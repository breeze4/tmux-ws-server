# Research: Patterns and Gotchas for Web tmux Manager

**Date**: 2026-04-05
**Source**: exploratory
**Status**: complete

## Summary

The xterm.js + node-pty + WebSocket stack is well-trodden (VS Code, ttyd, wetty, Cockpit all use variants of it), but the failure modes cluster at the seams: WebSocket-to-PTY data relay, resize coordination, PTY cleanup on disconnect, and tmux multi-client sizing. The most dangerous gotchas are silent — OOM from unbuffered terminal output, zombie PTY processes from missing disconnect handlers, and resize race conditions that corrupt ncurses apps. The Express + Vite + React production setup is straightforward but has specific ordering requirements and a WebSocket proxy gotcha in dev mode.

This document is organized as a reference for implementers. Each section covers one area with concrete warnings and the correct pattern to follow.

## Patterns & Conventions

### 1. xterm.js Setup

- **Use the scoped packages** (`@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`). The old unscoped `xterm` package is archived since v5.4.0 (Nov 2023) and receives no updates.

- **Initialization order matters**: `new Terminal()` → `loadAddon(fitAddon)` → `terminal.open(domElement)` → `fitAddon.fit()`. Calling `fit()` before `open()` produces wrong dimensions. The container must be visible and have non-zero size at `open()` time. Use `requestAnimationFrame(() => fitAddon.fit())` to avoid first-paint timing issues.

- **Set `allowProposedApi: true`** in the Terminal constructor if using the WebGL addon or serialize addon — they use proposed APIs that throw without this flag.

- **WebGL renderer has no fallback**. If the GPU context is lost (OOM, system suspend), the terminal goes blank. Listen for `webglcontextlost` on the canvas and fall back to `@xterm/addon-canvas`. You cannot switch back to the DOM renderer after loading an accelerated one without destroying the Terminal instance.

- **`cols` and `rows` can only be set at construction time**. Post-construction resizing requires `terminal.resize(cols, rows)` — setting them via `terminal.options` is silently ignored.

### 2. node-pty

- **Native module** — must be rebuilt when Node.js version changes. Use stable v1.1.0, not the v1.2.0 beta (which changes write behavior).

- **Always set TERM explicitly**:
  ```
  pty.spawn(shell, args, {
    name: 'xterm-256color',
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    cols, rows
  })
  ```
  node-pty defaults to `TERM=xterm` (no 256color), which breaks colors in most shells/editors.

- **node-pty strips tmux env vars** (`TMUX`, `TMUX_PANE`, `COLUMNS`, `LINES`) automatically. This is correct behavior for spawning `tmux attach` — don't fight it.

- **PTY cleanup requires a boolean guard** — calling `pty.kill()` twice throws an uncaught exception. Track exit state:
  ```
  let exited = false;
  pty.onExit(() => { exited = true; });
  ws.on('close', () => { if (!exited) { exited = true; pty.kill(); } });
  ```

- **Call `pty.kill()` explicitly on server shutdown** to avoid a known V8 crash when node-pty's native bindings are garbage collected with open PTYs.

### 3. WebSocket Terminal Relay

- **Flow control is mandatory**. xterm.js processes 5–35 MB/s. A `cat` of a large file or `yes` command can overflow xterm.js's 50 MB write buffer, causing OOM or silent data loss. Implement watermark-based backpressure:
  - Track bytes in-flight on the client
  - When watermark > HIGH (~100–500 KB): send PAUSE to server, server calls `pty.pause()`
  - When xterm.js write callbacks drain watermark below LOW (~10 KB): send RESUME, server calls `pty.resume()`
  - ttyd's protocol is a good reference: 1-byte command prefix on binary frames, explicit PAUSE/RESUME messages

- **Binary frames with a command byte prefix** (ttyd pattern): every WebSocket message is binary, first byte indicates type (input, output, resize, pause, resume). This is cleaner than mixing text/binary frames or using JSON for everything.

- **Use `window.location.host` for WebSocket URLs**, not hardcoded localhost. Works transparently in both dev (Vite proxy) and prod (Express):
  ```
  new WebSocket(`ws://${window.location.host}/ws/terminal?session=<name>`)
  ```

### 4. Resize Coordination

The full chain: browser resize → ResizeObserver → `fitAddon.fit()` → `terminal.onResize` → WebSocket message → `pty.resize(cols, rows)` → kernel SIGWINCH → shell redraws. **Every link is required.** The most commonly missed link: wiring `terminal.onResize` to send a WebSocket message.

- **Debounce resize events by ~150–200ms**. Rapid resizes (dragging) thrash the PTY with SIGWINCH signals.

- **Use ResizeObserver on the terminal container**, not `window.addEventListener('resize')` — the terminal may be in a resizable split pane, not filling the window.

- **The resize race condition is unfixable**: between `pty.resize()` and the running app processing SIGWINCH, the PTY may emit output sized for old dimensions. This causes occasional garbled redraws during rapid resizing. Accept it — all four major projects (ttyd, wetty, Cockpit, VS Code) have this issue.

### 5. tmux-Specific Patterns

- **Use `tmux new-session -A -s <name>`** instead of `tmux attach -t <name>`. The `-A` flag atomically creates-or-attaches, avoiding the race where `attach` fails because the session doesn't exist (exits immediately with code 1).

- **Set session size at creation time**: `tmux new-session -d -s <name> -x <cols> -y <rows>`. Without `-x`/`-y`, detached sessions get 80x24 default.

- **Parse session list with format flags**: `tmux list-sessions -F '#{session_id}\t#{session_name}\t#{session_attached}\t#{session_windows}\t#{session_created}'`. Never parse default human-readable output — it's unstable across versions.

- **Multi-client sizing policy**: by default (`window-size smallest`), all clients are constrained to the smallest attached client's dimensions. Options:
  - `smallest` — safe but wastes space on larger clients
  - `latest` — session tracks most recently active client, causes reflow on switch
  - `manual` — full programmatic control, but sizes persist after disconnect (must explicitly `resize-window` when clients detach)

- **Disconnect is clean**: when the PTY dies (WebSocket closes), the tmux client receives SIGHUP and detaches cleanly. The session survives. No special handling needed.

- **Do not rely on tmux hooks for cleanup** (`client-detached`, etc.) — hooks don't fire on signal-based termination (SIGHUP from PTY death). Handle all cleanup in Node.js via `pty.onExit`.

- **After a client disconnects, call `tmux resize-window`** if using `manual` window-size policy — the ghost size from the disconnected client persists otherwise.

### 6. Express + Vite + React Setup

**Project structure**: two `package.json` files — `client/` (Vite + React) and `server/` (Express + ws). Root `package.json` with workspaces for scripts only. Vite `outDir` should point into the server directory (e.g., `server/public`).

**Dev mode**: Vite dev server (:5173) proxies `/api/*` and `/ws/*` to Express (:3000). Critical: WebSocket proxy target must use `ws://` protocol, not `http://`. Do not use Vite middleware mode — WebSocket proxying silently fails when `httpServer` is null.

**Production**: Express serves everything on one port.
1. API routes first
2. `express.static(distPath)` second
3. SPA catch-all `app.get('/{*splat}', ...)` last (Express 5 syntax)

Order matters — if the catch-all lands before API routes, API calls silently return `index.html` with 200.

**WebSocket + Express on the same port**: use `noServer: true` mode on `WebSocketServer` and handle upgrades manually via `server.on('upgrade', ...)`. This lets you route by path and reject bad upgrade requests. Express itself never sees WebSocket upgrades — they're handled by the `http.Server` `upgrade` event.

```
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws/terminal')) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});
```

**ESM gotcha**: `__dirname` is not defined in ES modules. Use `path.dirname(fileURLToPath(import.meta.url))` or `import.meta.dirname` (Node 20.11+).

## Dependencies & Compatibility

| Dependency | Recommended Version | Constraint | Notes |
|---|---|---|---|
| `@xterm/xterm` | 5.5+ | Scoped package, v5 API | Old `xterm` is archived |
| `@xterm/addon-fit` | 0.10+ | Must match xterm major | Required for resize |
| `@xterm/addon-webgl` | 0.18+ | Optional, needs `allowProposedApi` | Falls back to canvas addon |
| `node-pty` | 1.1.0 (stable) | Native module, rebuild on Node upgrade | Avoid 1.2.0-beta |
| `ws` | 8.x | Standard WebSocket server | Use `noServer: true` mode |
| `express` | 5.x | Note wildcard route change (`/{*splat}`) | Or 4.x with `app.get('*')` |
| `vite` | 6.x+ | WebSocket proxy bug on WSL2 in some 6.3.x | Fixed in later patches / 7.0 |
| `react` | 19.x | Standard | |
| `tmux` | 3.3a+ | Control mode SIGHUP fix | Check server version |
| Node.js | 20+ (LTS) | node-pty requires 16+ | beebaby has v24 |

## Judgment Calls

- [x] **Flow control complexity vs. simplicity**: Full watermark-based PAUSE/RESUME is the correct approach but adds protocol complexity. For a single-user app on a local network, the risk of OOM is lower (no slow WAN connections).
  - Option A: Implement full flow control from the start — correct, prevents edge-case OOM
  - Option B: Ship without flow control, add it if problems arise — simpler initial implementation, risk of crash on `cat bigfile.bin`
  - Resolution: **Option A.** Implement from the start. It's ~35 lines total across client and server, baked into the WebSocket handler and terminal pane component. Easier to include in the initial protocol design than retrofit later.

- [x] **tmux window-size policy**: Affects behavior when multiple panes attach to the same session or when the browser window resizes.
  - Option A: `latest` — session tracks most recently active client, some reflow jank on switch
  - Option B: `smallest` — safe default, wastes space on larger panes
  - Option C: `manual` + explicit resize management — full control, more server-side code
  - Resolution: **Option A (`latest`).** User rarely/never attaches multiple panes to the same session. `latest` gives the best single-user experience with no dead space. Reflow jank is acceptable since only one user.

## Open Questions

- **Vite 6.x WebSocket proxy on WSL2**: There's a confirmed regression where WebSocket upgrade headers are swallowed on Linux/WSL2. If you hit this, check if upgrading Vite resolves it (fixed in later patches). Worth testing early in development.

- **tmux version on beebaby**: The control mode SIGHUP bug (orphan processes on disconnect) was fixed in tmux ~3.3a. Check `tmux -V` on beebaby to confirm the installed version is recent enough.
