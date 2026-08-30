# BeeBaby Admin container bridge

## Baseline and target

The baseline source deployment runs `beebaby-admin.service` on BeeBaby port
`8001`. The service uses the BeeBaby tmux server at
`/tmp/tmux-1000/default`. The checkout has unrelated `.vscode/` content, which
this step does not stage.

The bridge adds a manual Woodpecker image path. Factory, the router contract,
and the source deployment remain unchanged. The candidate image listens on
container port `8080` and binds only the host tmux socket to
`/run/tmux/default`.

## Invariants and risks

- The source service remains the active writer until the final cutover.
- The container uses UID and GID `1000` to match the tmux socket owner.
- The container has no host file system, SSH directory, Docker socket, or host
  port mount.
- The candidate uses a pinned Node image and an immutable GHCR publication
  workflow.
- A tmux format string converts tab delimiters to underscores. The bridge reads
  each session field separately so session names do not need a delimiter rule.

## Files

The bridge adds the `Dockerfile`, `.dockerignore`, `compose.beebaby.yaml`, and
Woodpecker check and publication workflows. It adds the pnpm workspace and
lockfile, updates the retained gate to use pnpm, and adds a `TMUX_SOCKET`
adapter for REST and WebSocket tmux commands.

## Gate results

The following commands passed:

```text
pnpm install --frozen-lockfile --force
pnpm run build
ssh beebaby sudo docker build --pull -t beebaby-admin:bridge-test
```

The first image build failed because the Node image did not include Python or a
C++ compiler for `node-pty`. The Dockerfile now installs `python3`, `make`, and
`g++` only in the builder stage.

The second image build exposed missing explicit TypeScript exports with pnpm's
layout. The server exports now declare `express.Express` and `Router` types.

The first tmux integration attempt found that tmux converts tab format
delimiters to underscores. The session reader now reads each field separately.
The focused remote container gate then passed create, attach, resize, rename,
and close operations through the mounted socket.

The first Compose render passed variables through `sudo`, which removed them.
The focused render sets `IMAGE_DIGEST` and `TMUX_SOCKET` after `sudo` and
renders the service without a published port.

The candidate runtime reported `healthy`, uses `1000:1000`, has a read-only
root file system, drops `ALL` capabilities, and has one bind mount:

```text
/tmp/tmux-1000/default -> /run/tmux/default
```

## Rollback

The candidate test container stops without changing the source service. To
roll back a later container cutover, stop the container before starting the
source service. This bridge does not move traffic or stop the Factory path.
