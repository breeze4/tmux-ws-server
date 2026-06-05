# Terminal Connection (Tracer Bullet)

## Parent spec

`docs/specs/2026-04-05-01-web-tmux-manager.md`

## What to build

The foundational vertical slice: a working terminal in the browser connected to a tmux session. This proves the entire data path end-to-end — Express server with WebSocket on the same port, Vite React app with dev proxy, xterm.js rendering terminal output, node-pty spawning `tmux new-session -A`, binary WebSocket protocol with flow control, resize chain, and proper PTY cleanup. A single full-screen terminal pane with a hardcoded or query-param session name. No sidebar, no multi-pane — just one terminal that works correctly.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

- User story 2 (click to attach — partially, no sidebar yet but the connection mechanism works)
- User story 9 (sessions persist across browser refresh — tmux survives WebSocket disconnect)
- User story 12 (resize and reflow)
- User story 13 (keyboard input, colors, scrollback, cursor)

## Acceptance criteria

- [x] Monorepo structure: `client/` (Vite + React), `server/` (Express + ws + node-pty), root `package.json` with workspaces
- [x] `npm run dev` starts both Vite dev server and Express server
- [x] Vite proxies `/api/*` and `/ws/*` to Express (WebSocket proxy uses `ws://` protocol)
- [x] Express serves on port 8001, WebSocket upgrade handled via `noServer: true` + `server.on('upgrade')`
- [x] Navigating to the app shows a full-screen terminal pane
- [x] Terminal connects via WebSocket to `/ws/terminal?session=<name>`, server spawns node-pty running `tmux new-session -A -s <name>`
- [x] Binary WebSocket protocol with 1-byte command prefix: INPUT (0), OUTPUT (1), RESIZE (2), PAUSE (3), RESUME (4)
- [x] Typing in the terminal sends keystrokes to tmux; tmux output renders in xterm.js with correct colors (256 + truecolor), unicode, scrollback
- [x] Resizing the browser window triggers: ResizeObserver → fitAddon.fit() → terminal.onResize → WebSocket RESIZE message → pty.resize() → tmux reflows. Debounced at ~150ms
- [x] Flow control: client tracks bytes in-flight via xterm.js write callbacks, sends PAUSE when watermark > 100KB, RESUME when < 10KB. Server calls pty.pause()/resume()
- [x] PTY cleanup on WebSocket close: boolean guard prevents double-kill, pty.kill() sends SIGHUP, tmux session survives (detaches cleanly)
- [x] Server graceful shutdown: kills all open PTYs before exit (avoids V8 crash)
- [x] Integration tests: WebSocket connects, receives terminal output, sends input, resize message triggers pty.resize(), disconnect triggers PTY cleanup

## Owns

- `package.json` (root) — workspace config, top-level scripts
- `client/package.json` — React + Vite + xterm.js dependencies
- `client/vite.config.ts` — dev server proxy config
- `client/index.html` — SPA entry point
- `client/src/main.tsx` — React app entry
- `client/src/App.tsx` — root component, renders terminal pane
- `client/src/components/TerminalPane.tsx` — xterm.js wrapper, WebSocket connection, resize, flow control
- `server/package.json` — Express + ws + node-pty dependencies
- `server/src/index.ts` — Express app, HTTP server, WebSocket upgrade routing, graceful shutdown
- `server/src/terminal.ts` — WebSocket connection handler, node-pty spawn, binary protocol relay, flow control, PTY cleanup
- `server/src/protocol.ts` — shared message type constants
- `server/tsconfig.json`
- `client/tsconfig.json`
- `.gitignore`
- `server/test/terminal.test.ts` — integration tests for terminal WebSocket

## Must not touch

- `server/src/sessions.ts` — owned by plan `2026-04-05-02-session-api-sidebar.md`
- `client/src/components/SessionSidebar.tsx` — owned by plan `2026-04-05-02-session-api-sidebar.md`
- `client/src/components/PaneLayout.tsx` — owned by plan `2026-04-05-03-multi-pane-layout.md`

## Defines interfaces

- **WebSocket binary protocol** in `server/src/protocol.ts` — message type constants (INPUT=0, OUTPUT=1, RESIZE=2, PAUSE=3, RESUME=4) consumed by plans `2026-04-05-02`, `2026-04-05-03`
- **TerminalPane component props** in `client/src/components/TerminalPane.tsx` — consumed by plan `2026-04-05-03-multi-pane-layout.md`
- **Express server + WebSocket upgrade handler** in `server/src/index.ts` — consumed by plan `2026-04-05-02-session-api-sidebar.md` (adds REST routes to the same Express app)

## Pattern exemplar

None — first of its kind (greenfield project). Refer to research doc `docs/research/2026-04-05-01-web-tmux-patterns-gotchas.md` for:
- ttyd binary protocol pattern (section 3)
- node-pty spawn options and TERM config (section 2)
- Express + WebSocket `noServer: true` pattern (section 6)
- xterm.js initialization order (section 1)
- Flow control watermark pattern (section 3)

## Tasks

- [x] Create monorepo structure: root `package.json` with workspaces, `client/` and `server/` directories with their own `package.json`, `tsconfig.json`, `.gitignore`
- [x] Install server dependencies: `express`, `ws`, `node-pty`, `typescript`, and dev/test tooling
- [x] Install client dependencies: `react`, `react-dom`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`, `@xterm/addon-canvas`, `vite`, `@vitejs/plugin-react`, `typescript`
- [x] Create `server/src/protocol.ts` with message type constants
- [x] Create `server/src/terminal.ts` — WebSocket connection handler: parse session name from URL query, spawn node-pty with `tmux new-session -A -s <name>`, set TERM=xterm-256color and COLORTERM=truecolor, binary protocol relay with command byte prefix, PAUSE/RESUME flow control calling pty.pause()/resume(), PTY cleanup with boolean exit guard, resize handler
- [x] Create `server/src/index.ts` — Express app on port 8001, `http.createServer(app)`, WebSocketServer with `noServer: true`, `server.on('upgrade')` routing `/ws/terminal` to the terminal handler, graceful shutdown (SIGINT/SIGTERM) killing all active PTYs
- [x] Configure `client/vite.config.ts` — React plugin, dev server proxy for `/api` (http) and `/ws` (ws://localhost:8001)
- [x] Create `client/src/components/TerminalPane.tsx` — mounts xterm.js Terminal with fit addon + WebGL addon (canvas fallback), connects WebSocket to `/ws/terminal?session=<name>`, binary protocol: sends INPUT frames on `terminal.onData`, receives OUTPUT frames into `terminal.write()`, sends RESIZE frames on `terminal.onResize`, flow control tracking bytes in-flight with HIGH/LOW watermark sending PAUSE/RESUME, ResizeObserver on container with 150ms debounce calling `fitAddon.fit()`, cleanup on unmount
- [x] Create `client/src/App.tsx` — renders single TerminalPane at full viewport, passes a default session name
- [x] Create `client/src/main.tsx` and `client/index.html` — standard React entry point
- [x] Add `npm run dev` script that starts both Vite and Express concurrently
- [x] Write integration tests for terminal WebSocket: connect, send input, receive output, send resize, verify PTY cleanup on disconnect
- [ ] Manual smoke test: open in browser, type commands, verify colors/scrollback/resize, close tab and verify tmux session survives

## Implementation notes

The binary WebSocket protocol uses a 1-byte type prefix on every message:

| Byte | Direction | Meaning |
|------|-----------|---------|
| 0 | client→server | INPUT (keystroke data follows) |
| 1 | server→client | OUTPUT (terminal data follows) |
| 2 | client→server | RESIZE (JSON `{cols, rows}` follows) |
| 3 | client→server | PAUSE (no payload) |
| 4 | client→server | RESUME (no payload) |

node-pty spawn should use:
- `name: 'xterm-256color'`
- `env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }`
- `cols` and `rows` from the initial RESIZE message (or defaults 80x24 until first resize)

xterm.js initialization order: `new Terminal({allowProposedApi: true})` → `loadAddon(fitAddon)` → `loadAddon(webglAddon)` (with canvas fallback) → `terminal.open(container)` → `requestAnimationFrame(() => fitAddon.fit())`
