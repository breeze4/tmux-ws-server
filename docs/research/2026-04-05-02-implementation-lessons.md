# Research Follow-Up: Implementation Lessons

**Date**: 2026-04-05
**Source**: post-implementation review of `2026-04-05-01-web-tmux-patterns-gotchas.md`
**Status**: complete

## Summary

The pre-implementation research (`01-web-tmux-patterns-gotchas.md`) was roughly 80% accurate. Core patterns — binary WebSocket protocol, xterm.js initialization, node-pty configuration, Express+WS setup, tmux CLI wrappers — were all correct and directly usable. The failures clustered in three areas: timing between components, mobile-specific behavior, and error handling edge cases that only surface in production on a real machine. This document captures what we learned and what should inform future research for similar projects.

## Corrections to Original Research

### 1. PTY spawn timing — don't spawn at default dimensions

The research recommended spawning node-pty at 80x24 and then resizing when the client sends dimensions. This is wrong in practice.

**What happens**: the PTY spawns at 80x24, tmux attaches and immediately renders its UI (status bar, shell prompt) at those dimensions. The client's RESIZE message arrives milliseconds later, but tmux has already drawn a frame. On desktop (where the terminal is often close to 80 columns) the reflow is barely noticeable. On mobile (where the terminal might be 60x52) the initial 80x24 render produces garbled output — text wraps at the wrong column, tmux's status bar lands in the middle of the screen, and the reflow when the correct dimensions arrive doesn't fully clean up.

**Correct pattern**: defer PTY spawn until the first RESIZE message. The server accepts the WebSocket connection but does not call `pty.spawn()`. It buffers any INPUT messages. When the first RESIZE arrives with actual `{cols, rows}`, it spawns the PTY at exactly those dimensions. The client sends an explicit RESIZE in its `onopen` handler (not relying on `fitAddon.fit()` to trigger `onResize`, since fit won't fire if dimensions haven't changed since the pre-connect fit).

This is ~20 lines of additional server code (deferred spawn + input buffering) and one explicit `sendMessage` on the client. Worth it for correct behavior on every screen size.

### 2. xterm.js fit timing — `requestAnimationFrame` is not enough

The research recommended `requestAnimationFrame(() => fitAddon.fit())` after `terminal.open()`. On desktop this works. On mobile, the container's dimensions are not yet final at the next animation frame — the layout is still settling (flex containers, CSS grid, dynamic viewport height).

**Correct pattern**: use a `setTimeout` of ~150ms before the first fit, or (better) defer the WebSocket connection by 150ms and fit just before connecting. This guarantees the container has its final pixel dimensions. The WebSocket `onopen` handler then fits again and sends the RESIZE, covering any edge case where the container shifted between the pre-connect fit and the actual connection.

### 3. `fitAddon.fit()` does not always fire `terminal.onResize`

If you call `fitAddon.fit()` and the computed cols/rows are identical to the terminal's current dimensions, xterm.js does not emit `onResize`. This means:

- Pre-connect fit sets terminal to 60x30
- WebSocket opens, `onopen` calls `fitAddon.fit()` again
- Dimensions are still 60x30
- `onResize` does not fire
- No RESIZE message is sent to the server
- Server never spawns the PTY (if using deferred spawn)
- Blank terminal

**Fix**: always send an explicit RESIZE message in `onopen`, reading `terminal.cols` and `terminal.rows` directly:

```
ws.onopen = () => {
  fitAddon.fit();
  const { cols, rows } = terminal;
  sendMessage(ws, RESIZE, JSON.stringify({ cols, rows }));
};
```

### 4. tmux error messages vary by environment

The research documented checking for `"no server running"` and `"no sessions"` in tmux's stderr when `list-sessions` fails. On a fresh machine where no tmux session has ever been created, the tmux socket file doesn't exist, and the error is:

```
error connecting to /tmp/tmux-1000/default (No such file or directory)
```

This doesn't match either documented string. The fix is to also check for `"No such file or directory"` and `"error connecting"`. More robust: treat any non-zero exit from `tmux list-sessions` as "no sessions" unless the error clearly indicates something else (permissions, corrupted socket, etc.).

## New Patterns Not in Original Research

### 5. Mobile terminal support requires a control key toolbar

Mobile browsers have no physical keyboard and no way to type control characters (Ctrl+C, Ctrl+D, etc.). A web terminal aimed at mobile must provide a toolbar with buttons that inject these characters into the terminal stream.

**What works**:
- Buttons for Ctrl+C (`\x03`), Ctrl+D (`\x04`), Ctrl+Z (`\x1a`), Tab (`\t`), Esc (`\x1b`), arrow keys (`\x1b[A`, `\x1b[B`), Enter (`\r`)
- Use `onTouchStart` with `preventDefault()` — not `onClick` — to avoid focus/keyboard issues on iOS
- Detect touch devices with `'ontouchstart' in window || navigator.maxTouchPoints > 0`
- Only render the toolbar on touch devices to avoid wasting space on desktop

**What doesn't work**:
- Sending tmux copy-mode sequences (`Ctrl+B [`) to scroll back in full-screen apps — the app inside tmux (e.g., Claude Code) intercepts the input, not tmux. Scrollback in full-screen TUI apps on mobile remains unsolved without tmux mouse mode.

### 6. Mobile viewport height — `100vh` lies

On mobile browsers, `100vh` includes the area behind the browser's URL bar and bottom navigation. The actual visible area is smaller. This causes the terminal container to overflow, pushing the control toolbar off-screen.

**Fix**: use `100dvh` (dynamic viewport height) which tracks the actual visible area. Use `@supports` for browsers that don't support it:

```css
html, body, #root { height: 100%; }
@supports (height: 100dvh) {
  html, body, #root { height: 100dvh; }
}
```

Do NOT use `position: fixed` on body as a workaround — it can break element sizing on iOS.

### 7. Session kill should clear the pane

When a tmux session is killed externally (via sidebar, another client, or `tmux kill-session`), the PTY exits, the server closes the WebSocket, and the client's terminal goes dead — but the UI still shows the terminal pane bound to a now-dead session. The user can't create or attach to a new session without manually detaching.

**Fix**: the TerminalPane component should accept an `onDisconnect` callback. When the WebSocket closes (and the component hasn't been intentionally unmounted), fire `onDisconnect` to clear the pane assignment. Important: null out `ws.onclose` before intentional cleanup to avoid spurious disconnect events during React unmount.

### 8. Font size should be smaller on mobile

Desktop terminal font size of 14px works well on a monitor. On a mobile phone screen (~375px wide), 14px gives only ~40 columns — too narrow for most terminal workflows. 12px gives ~55-60 columns, which is usable.

Detect touch devices and set font size accordingly. This is a constructor-time setting on `Terminal` — it can't be changed later without destroying and recreating the instance.

## Lessons for Future Research

### What pre-implementation research gets right
- **Setup patterns**: how to configure libraries, what options to set, what order to initialize things. The xterm.js init order, node-pty env config, Express+WS `noServer` pattern, and tmux CLI format strings were all correct and directly copy-pasteable.
- **Known gotchas with documented fixes**: WebGL requiring `allowProposedApi`, Vite proxy needing `ws://` protocol, the double-kill PTY bug. These are well-documented in issue trackers and saved real debugging time.
- **Architecture decisions**: binary protocol vs. JSON, flow control inclusion, window-size policy. Having these decided upfront prevented mid-implementation pivots.

### What pre-implementation research gets wrong
- **Timing and ordering between components**: research can identify that A talks to B, but it can't predict the exact millisecond-level ordering issues that cause blank screens or garbled output. These only surface when you run the code on a real device.
- **Error message strings**: the exact text of error messages from CLI tools varies by OS, version, and state. Research based on documentation or common examples will miss edge cases. Defensive error handling (check for multiple strings, or invert the check to look for known-good states) is safer.
- **Platform-specific behavior**: mobile browsers, touch input, viewport units, soft keyboards. If the spec says "accessible from any device" but the research only covers desktop browser behavior, mobile will be a surprise.

### What to add to future research for similar projects
1. **Test the failure modes, not just the happy path.** What happens when there are no sessions? When the session is killed while attached? When the browser is on a 375px-wide screen? These generate the most bugs.
2. **Include a "mobile considerations" section** for any web app that will be used on phones. Cover: viewport height, touch events, missing keyboard keys, font sizing, and overflow behavior.
3. **Note timing dependencies explicitly.** "A must happen before B" is more useful than "A and B both need to happen." The deferred-spawn pattern would have been obvious if the research had stated "the PTY's initial dimensions determine tmux's first render, and resize-after-spawn causes a visible glitch."
4. **Capture actual error strings from the target environment**, not just from documentation. SSH into the target machine and run the commands that will fail (e.g., `tmux list-sessions` with no server) to see the exact output.
