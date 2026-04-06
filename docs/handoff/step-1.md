# Step 1: Terminal Connection — Handoff

## Files Created

| File | Purpose |
|------|---------|
| `package.json` | Root workspace config, top-level dev/build/test scripts |
| `.gitignore` | Excludes node_modules, dist, server/public, sourcemaps |
| `server/package.json` | Server deps and scripts (ESM, type: module) |
| `server/tsconfig.json` | TypeScript config: ES2022, NodeNext, strict |
| `server/src/protocol.ts` | Binary protocol constants: INPUT=0, OUTPUT=1, RESIZE=2, PAUSE=3, RESUME=4 |
| `server/src/terminal.ts` | WebSocket connection handler: PTY spawn, binary relay, flow control, cleanup |
| `server/src/index.ts` | Express app, HTTP server, WebSocket upgrade routing, graceful shutdown |
| `server/test/terminal.test.ts` | Integration tests: connect, input/output, resize, session persistence |
| `client/package.json` | Client deps and scripts (Vite + React + xterm.js) |
| `client/tsconfig.json` | TypeScript config: ES2022, bundler resolution, react-jsx |
| `client/vite.config.ts` | Vite dev proxy: /api -> http://localhost:8001, /ws -> ws://localhost:8001 |
| `client/index.html` | SPA entry point with full-viewport CSS reset |
| `client/src/main.tsx` | React 19 createRoot entry |
| `client/src/App.tsx` | Root component, renders TerminalPane with sessionName="main" |
| `client/src/components/TerminalPane.tsx` | xterm.js wrapper: WebSocket, binary protocol, flow control, resize |

## Package Versions

### Server
- express 5.2.1
- ws 8.20.0
- node-pty 1.1.0
- typescript 5.9.3
- tsx 4.21.0
- vitest 3.2.4

### Client
- react 19.2.4, react-dom 19.2.4
- @xterm/xterm 5.5.0
- @xterm/addon-fit 0.10.0
- @xterm/addon-webgl 0.18.0
- @xterm/addon-canvas 0.7.0
- vite 6.4.1
- @vitejs/plugin-react 4.7.0
- typescript 5.9.3

### Root
- concurrently 9.1.2

## Port Numbers

- **Dev**: Vite on 5173 (proxies /ws and /api to 8001), Express on 8001
- **Prod**: Express on 8001 (PORT env var override), serves built client from `server/public/`

## How to Run

```bash
npm install          # install all workspaces
npm run dev          # starts both Vite and Express concurrently
npm test             # runs vitest integration tests in server workspace
npm run build        # builds both server (tsc) and client (vite build)
```

## WebSocket Protocol

Binary messages with 1-byte command prefix:

| Byte | Direction | Meaning |
|------|-----------|---------|
| 0 (INPUT) | client -> server | Keystroke data follows |
| 1 (OUTPUT) | server -> client | Terminal output data follows |
| 2 (RESIZE) | client -> server | JSON `{cols, rows}` follows |
| 3 (PAUSE) | client -> server | No payload; server calls pty.pause() |
| 4 (RESUME) | client -> server | No payload; server calls pty.resume() |

Flow control: client tracks bytes in-flight via xterm.js write callbacks. PAUSE at >100KB, RESUME at <10KB.

## TerminalPane Component Interface

```typescript
interface Props {
  sessionName: string | null;
}
```

When `sessionName` is null, renders a placeholder. When truthy, mounts xterm.js and connects WebSocket.

## Server Exports

`server/src/index.ts` exports:
- `app` — Express application instance (add routes via `app.get(...)`, `app.post(...)`)
- `server` — Node.js `http.Server` instance (already has WebSocket upgrade handler)

Later steps can import these to add REST routes and additional WebSocket handlers.

## Decisions and Notes

- Used `tsx watch` for server dev mode (faster than compiling to JS first)
- Express 5 (latest stable) used instead of Express 4
- WebSocket upgrade uses `noServer: true` pattern for clean URL-based routing
- PTY cleanup uses boolean exit guard to prevent double-kill race condition
- Server tracks active PTYs in a Set for graceful shutdown
- Test uses port 8099 to avoid conflicting with dev server on 8001
- tmux sessions survive WebSocket disconnect (node-pty kill sends SIGHUP, tmux client detaches)
