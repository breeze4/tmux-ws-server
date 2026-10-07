#!/usr/bin/env python3
# The rule that this gate enforces
# --------------------------------
# Woodpecker CI filters the secret `ghcr_token` to plugin steps. It refuses a
# step that is not a plugin step and that reads the secret. This gate finds such
# steps before a pipeline runs. It follows the Woodpecker v3.16.0 source
# (revision b75ee6612863bc8d7436f10ebf52350350bf4176):
#
# * pipeline/frontend/yaml/types/container.go, `IsPlugin()`: a step is a plugin
#   step only when it has no `commands`, no `entrypoint`, and no `environment`.
#   An empty or null value counts as absent. A non-empty string, list, or map
#   counts as present.
# * pipeline/frontend/yaml/compiler/settings/params.go: a mapping that has the
#   key `from_secret` with a string value reads that secret. This holds at any
#   depth (nested maps and lists) under the step's `settings` and under its
#   `environment`.
# * pipeline/frontend/yaml/compiler/convert.go lowercases the name
#   (`strings.ToLower`), so `from_secret: GHCR_TOKEN` also reads `ghcr_token`.
#
# The gate is also strict about the legacy `secrets:` key. Woodpecker 2 accepted
# it. Woodpecker v3 has no such field, but the gate flags it anyway.
#
# The gate ignores `when` at the workflow level and at the step level. A
# workflow that only runs on main (publish, deploy) never runs in a pull
# request pipeline, so the gate must check it too.
"""Fail when a non-plugin Woodpecker step reads the secret `ghcr_token`.

Usage:
  check-ghcr-token.py [REPO_ROOT ...]

For each root (default `.`) the gate reads these workflow files:
`.woodpecker.yml`, `.woodpecker.yaml`, and the top level of `.woodpecker/` for
`*.yml` and `*.yaml`, sorted. It reads every file. It ignores `when`.

Containers live under the top-level `steps`, `services`, and `clone`. Each can
be a mapping (name -> container) or a list of containers that have `name:`. A
list item with no `name` is called `#<index>`.

A container reads `ghcr_token` when one of these is true:

* a `from_secret` string at any depth under `settings` or `environment` names it,
* a `secrets` list (or string) names it as an item or as an item's `source`.

Output and exit codes:
  0  No finding. Prints one summary line to stdout.
  1  A finding or a parse failure. Prints one line each to stderr.
  2  A root is not a directory.

A file that the built-in YAML reader cannot parse is a failure (fail closed).
PyYAML is not in the CI images, so this file has a small block-YAML reader. The
reader supports comments, block and flow collections, plain and quoted scalars,
block scalars, anchors, aliases, and the merge key. A file with more than one
document (`---`) is read document by document, and each document is a workflow.
The reader rejects tags, complex keys (`? `), tabs in indentation, inconsistent
indentation, duplicate keys, and scalars or flow collections that span lines.
It never skips content that it does not understand.
"""
import argparse
import re
import sys
from pathlib import Path

SECRET = "ghcr_token"
# Top-level keys that hold containers, with the word that the report uses.
SECTIONS = (("steps", "step"), ("services", "service"), ("clone", "clone"))
# The keys that make a container a non-plugin container.
NON_PLUGIN_KEYS = ("commands", "entrypoint", "environment")
FILE_NAMES = (".woodpecker.yml", ".woodpecker.yaml")
DIRECTORY = ".woodpecker"

ESCAPES = {
    "0": "\0", "a": "\a", "b": "\b", "t": "\t", "\t": "\t", "n": "\n",
    "v": "\v", "f": "\f", "r": "\r", "e": "\x1b", " ": " ", '"': '"',
    "/": "/", "\\": "\\", "N": "\x85", "_": "\xa0", "L": " ",
    "P": " ",
}
HEX_ESCAPES = {"x": 2, "u": 4, "U": 8}


class YamlError(Exception):
    """YAML that this reader cannot read."""

    def __init__(self, message, line=None):
        super().__init__(message)
        self.message = message
        self.line = line

    def __str__(self):
        if self.line is None:
            return self.message
        return f"line {self.line}: {self.message}"


# --- YAML scalars and flow collections -------------------------------------


def skip_ws(text, i):
    while i < len(text) and text[i] in " \t":
        i += 1
    return i


def resolve_plain(raw):
    """Turn a plain scalar into None, a bool, or a string."""
    if raw in ("", "~", "null", "Null", "NULL"):
        return None
    if raw in ("true", "True", "TRUE"):
        return True
    if raw in ("false", "False", "FALSE"):
        return False
    return raw


def parse_quoted(text, i):
    """Read a quoted scalar that starts at text[i]. Return (string, end)."""
    quote = text[i]
    i += 1
    out = []
    if quote == "'":
        while i < len(text):
            char = text[i]
            if char == "'":
                if text[i + 1:i + 2] == "'":
                    out.append("'")
                    i += 2
                    continue
                return "".join(out), i + 1
            out.append(char)
            i += 1
        raise YamlError("unterminated single-quoted scalar")
    while i < len(text):
        char = text[i]
        if char == '"':
            return "".join(out), i + 1
        if char != "\\":
            out.append(char)
            i += 1
            continue
        i += 1
        if i >= len(text):
            break
        escape = text[i]
        if escape in ESCAPES:
            out.append(ESCAPES[escape])
            i += 1
        elif escape in HEX_ESCAPES:
            width = HEX_ESCAPES[escape]
            digits = text[i + 1:i + 1 + width]
            if len(digits) != width or not re.fullmatch(r"[0-9A-Fa-f]+", digits):
                raise YamlError(f"bad \\{escape} escape in double-quoted scalar")
            try:
                out.append(chr(int(digits, 16)))
            except ValueError:
                raise YamlError(f"bad \\{escape} escape in double-quoted scalar")
            i += 1 + width
        else:
            raise YamlError(f"unknown escape \\{escape} in double-quoted scalar")
    raise YamlError("unterminated double-quoted scalar")


def check_tail(text, end):
    """Allow only spaces or a comment after a value that ends at text[end]."""
    rest = text[end:]
    if rest.strip() == "":
        return
    if rest[0] in " \t" and rest.lstrip().startswith("#"):
        return
    raise YamlError(f"unexpected text after a value: {rest.strip()!r}")


def parse_flow_plain(text, i):
    """Read a plain scalar inside a flow collection. Return (raw, end)."""
    start = i
    while i < len(text):
        char = text[i]
        if char in ",[]{}":
            break
        if char == ":" and (i + 1 >= len(text) or text[i + 1] in " \t,[]{}"):
            break
        if char == "#" and (i == start or text[i - 1] in " \t"):
            raise YamlError("comment or line break inside a flow collection")
        i += 1
    raw = text[start:i].strip()
    if raw == "":
        raise YamlError("empty entry in a flow collection")
    if raw[0] in "@`":
        raise YamlError(f"reserved character {raw[0]!r} starts a scalar")
    return raw, i


def build_mapping(pairs):
    """Make a dict from (key, value) pairs. Apply `<<` merges last.

    An explicit key wins over a merged key. In a list of merged mappings, an
    earlier mapping wins over a later one.
    """
    result = {}
    merges = None
    have_merge = False
    for key, value in pairs:
        if key == "<<":
            if have_merge:
                raise YamlError("duplicate merge key '<<'")
            have_merge = True
            merges = value
            continue
        if key in result:
            raise YamlError(f"duplicate key {key!r}")
        result[key] = value
    if have_merge:
        sources = merges if isinstance(merges, list) else [merges]
        for source in sources:
            if not isinstance(source, dict):
                raise YamlError("merge key '<<' needs a mapping or a list of mappings")
            for key, value in source.items():
                result.setdefault(key, value)
    return result


def split_key(content):
    """Split a block line into (key, rest) when it is `key: rest`, else None."""
    if re.match(r"\?(\s|$)", content):
        raise YamlError("complex keys ('? ') are not supported")
    if content[0] == "!":
        raise YamlError("tags are not supported")
    if content[0] == "&":
        # An anchor before a key would anchor the key, not the mapping.
        probe = re.sub(r"^&\S*\s*", "", content)
        if probe and split_key(probe) is not None:
            raise YamlError("an anchor on a mapping key is not supported")
        return None
    if content[0] in "[{*":
        return None
    if content[0] in "\"'":
        text, end = parse_quoted(content, 0)
        j = skip_ws(content, end)
        if content[j:j + 1] == ":" and (j + 1 >= len(content) or content[j + 1] in " \t"):
            return text, content[j + 1:]
        return None
    for i, char in enumerate(content):
        if char == "#" and i > 0 and content[i - 1] in " \t":
            return None
        if char == ":" and (i + 1 >= len(content) or content[i + 1] in " \t"):
            key = content[:i].rstrip()
            if key == "":
                raise YamlError("empty mapping key")
            return key, content[i + 1:]
    return None


def parse_plain_block(text):
    """Read a plain scalar in block context (comment cut, no `: ` inside)."""
    match = re.search(r"(^|[ \t])#", text)
    if match:
        text = text[:match.start()]
    text = text.strip()
    if text[0] in "@`%,]}":
        raise YamlError(f"reserved character {text[0]!r} starts a scalar")
    if re.match(r"(-|\?)(\s|$)", text):
        raise YamlError("a block indicator cannot start a value on a key line")
    if re.search(r":(\s|$)", text):
        raise YamlError("mapping values are not allowed here")
    return resolve_plain(text)


def fold(lines):
    """Fold the lines of a `>` block scalar (blank line -> newline)."""
    out = []
    for i, line in enumerate(lines):
        if i == 0:
            out.append(line)
        elif line == "":
            out.append("\n")
        elif lines[i - 1] == "":
            out.append(line)
        elif line[0] in " \t" or lines[i - 1][0] in " \t":
            out.append("\n" + line)
        else:
            out.append(" " + line)
    return "".join(out)


# --- YAML block structure ---------------------------------------------------


def is_seq_item(content):
    return re.match(r"-(\s|$)", content) is not None


class Parser:
    """Read one YAML document from a list of lines."""

    def __init__(self, lines, first_line=1):
        self.lines = list(lines)
        self.first = first_line
        self.pos = 0
        self.cur = 0
        self.anchors = {}

    def parse(self):
        try:
            if self.peek() is None:
                return None
            value = self.parse_block(-1)
            if self.peek() is not None:
                raise YamlError("unexpected content (inconsistent indentation)")
            return value
        except YamlError as error:
            if error.line is None:
                error.line = self.first + self.cur
            raise

    def peek(self):
        """Return (index, indent, content) of the next line. Do not consume it."""
        while self.pos < len(self.lines):
            raw = self.lines[self.pos]
            stripped = raw.strip()
            if stripped == "" or stripped.startswith("#"):
                self.pos += 1
                continue
            self.cur = self.pos
            leading = raw[:len(raw) - len(raw.lstrip())]
            if leading != " " * len(leading):
                raise YamlError("tabs or other whitespace used for indentation")
            return self.pos, len(leading), raw[len(leading):].rstrip()
        return None

    def parse_block(self, parent_indent):
        """Read the node that starts at the next line."""
        idx, indent, content = self.peek()
        if is_seq_item(content):
            return self.parse_seq(indent)
        if split_key(content) is not None:
            return self.parse_map(indent)
        self.pos = idx + 1
        return self.parse_value(content, parent_indent, False)

    def parse_map(self, n):
        pairs = []
        while True:
            line = self.peek()
            if line is None or line[1] < n:
                break
            idx, indent, content = line
            if indent > n:
                raise YamlError("inconsistent indentation")
            if is_seq_item(content):
                raise YamlError("sequence item where a mapping key is expected")
            split = split_key(content)
            if split is None:
                raise YamlError("expected a mapping key")
            key, rest = split
            self.pos = idx + 1
            pairs.append((key, self.parse_value(rest, n, True)))
        return build_mapping(pairs)

    def parse_seq(self, n):
        items = []
        while True:
            line = self.peek()
            if line is None or line[1] < n:
                break
            idx, indent, content = line
            if indent > n:
                raise YamlError("inconsistent indentation")
            if not is_seq_item(content):
                break
            after = content[1:]
            body = after.lstrip()
            if body == "" or body.startswith("#"):
                self.pos = idx + 1
                following = self.peek()
                if following is not None and following[1] > n:
                    items.append(self.parse_block(n))
                else:
                    items.append(None)
            else:
                # Rewrite the line so the item content starts at its own
                # column. A mapping in the item then continues at that column.
                shift = 1 + len(after) - len(body)
                self.lines[idx] = " " * (indent + shift) + body
                items.append(self.parse_block(n))
        return items

    def parse_value(self, rest, parent_indent, in_map):
        """Read the value after `key:` or `- `. The line is already consumed."""
        text = rest.strip()
        anchor = None
        if text.startswith("&"):
            match = re.match(r"&([^\s,\[\]{}]+)(?:\s+|$)(.*)$", text)
            if not match:
                raise YamlError("bad anchor")
            anchor = match.group(1)
            text = match.group(2).strip()
        if text.startswith("!"):
            raise YamlError("tags are not supported")
        if text == "" or text.startswith("#"):
            following = self.peek()
            if following is not None and following[1] > parent_indent:
                value = self.parse_block(parent_indent)
            elif (in_map and following is not None
                  and following[1] == parent_indent and is_seq_item(following[2])):
                value = self.parse_seq(parent_indent)
            else:
                value = None
        elif text.startswith("*"):
            match = re.fullmatch(r"\*(\S+)(?:\s+#.*)?", text)
            if not match or anchor is not None:
                raise YamlError("bad alias")
            value = self.alias(match.group(1))
        elif text[0] in "|>":
            value = self.parse_block_scalar(text, parent_indent)
        else:
            value = self.parse_inline(text)
        if anchor is not None:
            self.anchors[anchor] = value
        return value

    def alias(self, name):
        if name not in self.anchors:
            raise YamlError(f"alias *{name} has no anchor")
        return self.anchors[name]

    def parse_inline(self, text):
        """Read a value that is on the key line (not a block scalar)."""
        if text[0] in "[{":
            value, end = self.parse_flow(text, 0)
            check_tail(text, end)
            return value
        if text[0] in "\"'":
            value, end = parse_quoted(text, 0)
            check_tail(text, end)
            return value
        return parse_plain_block(text)

    def parse_block_scalar(self, header, parent_indent):
        match = re.fullmatch(r"([|>])([+-]?)(?:[ \t]+#.*)?[ \t]*", header)
        if not match:
            raise YamlError(f"unsupported block scalar header {header!r}")
        style, chomp = match.group(1), match.group(2)
        lines = []
        indent = None
        while self.pos < len(self.lines):
            raw = self.lines[self.pos]
            if raw.strip() == "":
                lines.append("" if indent is None else raw[indent:].rstrip())
                self.pos += 1
                continue
            self.cur = self.pos
            leading = raw[:len(raw) - len(raw.lstrip())]
            if "\t" in leading:
                raise YamlError("tabs used for indentation")
            if indent is None:
                if len(leading) <= parent_indent:
                    break
                indent = len(leading)
            elif len(leading) < indent:
                break
            lines.append(raw[indent:])
            self.pos += 1
        trailing = 0
        while lines and lines[-1] == "":
            lines.pop()
            trailing += 1
        if not lines:
            return "\n" * trailing if chomp == "+" else ""
        text = fold(lines) if style == ">" else "\n".join(lines)
        if chomp == "":
            text += "\n"
        elif chomp == "+":
            text += "\n" * (trailing + 1)
        return text

    # Flow collections. They must fit on one line.

    def parse_flow(self, text, i):
        i = skip_ws(text, i)
        if i >= len(text):
            raise YamlError("unterminated flow collection")
        char = text[i]
        if char == "[":
            return self.parse_flow_seq(text, i)
        if char == "{":
            return self.parse_flow_map(text, i)
        if char in "\"'":
            return parse_quoted(text, i)
        if char in "&!":
            raise YamlError("anchors and tags inside flow collections are not supported")
        if char == "*":
            match = re.match(r"\*([^\s,\[\]{}]+)", text[i:])
            if not match:
                raise YamlError("bad alias")
            return self.alias(match.group(1)), i + match.end()
        raw, end = parse_flow_plain(text, i)
        return resolve_plain(raw), end

    def parse_flow_seq(self, text, i):
        items = []
        i += 1
        while True:
            i = skip_ws(text, i)
            if i >= len(text):
                raise YamlError("unterminated flow sequence")
            if text[i] == "]":
                return items, i + 1
            item, i = self.parse_flow(text, i)
            items.append(item)
            i = skip_ws(text, i)
            if i >= len(text):
                raise YamlError("unterminated flow sequence")
            if text[i] == ",":
                i += 1
            elif text[i] != "]":
                raise YamlError(f"unexpected {text[i]!r} in a flow sequence")

    def parse_flow_map(self, text, i):
        pairs = []
        i += 1
        while True:
            i = skip_ws(text, i)
            if i >= len(text):
                raise YamlError("unterminated flow mapping")
            if text[i] == "}":
                return build_mapping(pairs), i + 1
            if text[i] in "\"'":
                key, i = parse_quoted(text, i)
            elif text[i] in "[{*&!?":
                raise YamlError("this kind of flow mapping key is not supported")
            else:
                key, i = parse_flow_plain(text, i)
            i = skip_ws(text, i)
            value = None
            if i < len(text) and text[i] == ":":
                i = skip_ws(text, i + 1)
                if i < len(text) and text[i] not in ",}":
                    value, i = self.parse_flow(text, i)
            pairs.append((key, value))
            i = skip_ws(text, i)
            if i >= len(text):
                raise YamlError("unterminated flow mapping")
            if text[i] == ",":
                i += 1
            elif text[i] != "}":
                raise YamlError(f"unexpected {text[i]!r} in a flow mapping")


def parse_yaml(text):
    """Read every document in `text`. Return a list of non-empty documents."""
    text = text.lstrip("﻿")
    lines = text.replace("\r\n", "\n").split("\n")
    segments = []
    start = 0
    for number, line in enumerate(lines):
        if re.match(r"\.\.\.(\s|$)", line):
            raise YamlError("the document end marker '...' is not supported", number + 1)
        if re.match(r"---(\s|$)", line):
            rest = line[3:].strip()
            if rest and not rest.startswith("#"):
                raise YamlError("content on a document marker line is not supported", number + 1)
            segments.append((start, lines[start:number]))
            start = number + 1
    segments.append((start, lines[start:]))
    documents = []
    for first, segment in segments:
        document = Parser(segment, first + 1).parse()
        if document is not None:
            documents.append(document)
    return documents


# --- The gate ---------------------------------------------------------------


def is_present(value):
    """True when Woodpecker counts the value as set (not null and not empty)."""
    return not (value is None or value == "" or value == [] or value == {})


def is_secret_name(name):
    return isinstance(name, str) and name.strip().lower() == SECRET


def find_from_secret(node, path, found):
    """Add the path of every `from_secret` that names the secret to `found`."""
    if isinstance(node, dict):
        for key, value in node.items():
            child = f"{path}.{key}"
            if key == "from_secret" and is_secret_name(value):
                found.append(child)
            find_from_secret(value, child, found)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            find_from_secret(value, f"{path}[{index}]", found)


def secrets_list_reads(secrets):
    """True when a legacy `secrets` value names the secret."""
    if is_secret_name(secrets):
        return True
    if not isinstance(secrets, list):
        return False
    for item in secrets:
        if is_secret_name(item):
            return True
        if isinstance(item, dict) and is_secret_name(item.get("source")):
            return True
    return False


def containers(document):
    """Yield (kind, name, container) for every container in a workflow."""
    for section, kind in SECTIONS:
        value = document.get(section)
        if isinstance(value, dict):
            for name, container in value.items():
                if isinstance(container, dict):
                    yield kind, str(name), container
        elif isinstance(value, list):
            for index, container in enumerate(value):
                if not isinstance(container, dict):
                    continue
                name = container.get("name")
                if not isinstance(name, str) or name == "":
                    name = f"#{index}"
                yield kind, name, container


def finding_reason(container):
    """Return why a container breaks the rule, or None when it does not."""
    causes = [key for key in NON_PLUGIN_KEYS if is_present(container.get(key))]
    if not causes:
        return None
    reads = []
    find_from_secret(container.get("settings"), "settings", reads)
    find_from_secret(container.get("environment"), "environment", reads)
    if secrets_list_reads(container.get("secrets")):
        reads.append("a secrets list")
    if not reads:
        return None
    return f"has {' and '.join(causes)} and reads {SECRET} through {' and '.join(reads)}"


def check_text(text, label):
    """Return the problem lines for the text of one workflow file."""
    try:
        documents = parse_yaml(text)
    except (YamlError, RecursionError) as error:
        return [f"check-ghcr-token: {label}: cannot parse: {error}"]
    problems = []
    for document in documents:
        if not isinstance(document, dict):
            problems.append(
                f"check-ghcr-token: {label}: cannot parse: the top level is not a mapping")
            continue
        for kind, name, container in containers(document):
            reason = finding_reason(container)
            if reason:
                problems.append(f"check-ghcr-token: {label}: {kind} {name}: {reason}")
    return problems


def check_file(path):
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        return [f"check-ghcr-token: {path}: cannot parse: {error}"]
    return check_text(text, str(path))


def workflow_files(root):
    """List the workflow files of a repository root."""
    root = Path(root)
    files = [root / name for name in FILE_NAMES if (root / name).is_file()]
    directory = root / DIRECTORY
    if directory.is_dir():
        files.extend(sorted(
            path for path in directory.iterdir()
            if path.name.endswith((".yml", ".yaml")) and path.is_file()))
    return files


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Fail when a non-plugin Woodpecker step reads ghcr_token.")
    parser.add_argument("roots", nargs="*", metavar="REPO_ROOT", default=["."])
    args = parser.parse_args(argv)
    for root in args.roots:
        if not Path(root).is_dir():
            print(f"check-ghcr-token: {root}: not a directory", file=sys.stderr)
            return 2
    count = 0
    problems = []
    for root in args.roots:
        for path in workflow_files(root):
            count += 1
            problems.extend(check_file(path))
    if problems:
        for line in problems:
            print(line, file=sys.stderr)
        return 1
    print(f"check-ghcr-token: no non-plugin step reads {SECRET} in {count} workflow file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
