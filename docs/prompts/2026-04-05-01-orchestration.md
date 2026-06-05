# Orchestration Prompt: Web tmux Manager

## Project context

- Working directory: `/home/breeze/dev/beebaby-admin`
- Research: `docs/research/2026-04-05-01-web-tmux-patterns-gotchas.md`
- Spec: `docs/specs/2026-04-05-01-web-tmux-manager.md`
- Build: `npm run build` (available after step 1)
- Test: `npm test` (available after step 1)
- Lint: none configured
- Handoff directory: `docs/handoff/` (create if needed)
- Greenfield project — no existing code. Node.js v24 and tmux 3.4 on target host.

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under "Context sources" and include relevant sections in the agent's "Context" field.
2. If a previous step completed, read `docs/handoff/step-{N}.md` and use it to fill in "Prior step context" and "Context".
3. After each gate, verify the gate passes before proceeding. On failure, diagnose and fix before moving on.

All steps are AFK (no human checkpoints needed). Run them serially — each step modifies shared files (`App.tsx`, `server/src/index.ts`, root `package.json`).

## Execution plan

### Step 1 — Terminal connection (tracer bullet)

**Plan**: `docs/plans/2026-04-05-01-terminal-connection.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these): `docs/specs/2026-04-05-01-web-tmux-manager.md` (Solution, Data Flow sections), `docs/research/2026-04-05-01-web-tmux-patterns-gotchas.md` (all of sections 1–6)
- **Read first**: `docs/plans/2026-04-05-01-terminal-connection.md`
- **Context**: Orchestrator pastes the spec's Data Flow section and the research doc's Patterns & Conventions sections (xterm.js setup, node-pty, WebSocket relay, resize, tmux patterns, Express+Vite setup). These contain every concrete warning and correct pattern the agent needs.
- **Owns**:
  - `package.json` (root — workspace config, scripts)
  - `client/` (entire directory — new)
  - `server/` (entire directory — new)
  - `.gitignore`
- **Must not touch**: `docs/` (specs, plans, research — read-only reference)
- **Do not**: create `server/src/sessions.ts`, `client/src/components/SessionSidebar.tsx`, `client/src/components/PaneLayout.tsx`, `client/src/components/TopBar.tsx`, or `client/src/components/EmptyPane.tsx` — those are Steps 2 and 3's responsibility.
- **Key implementation requirements from research**:
  - Use scoped packages: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`, `@xterm/addon-canvas`
  - xterm.js init order: `new Terminal({allowProposedApi: true})` → `loadAddon(fitAddon)` → `loadAddon(webglAddon)` (canvas fallback) → `open(container)` → `requestAnimationFrame(() => fitAddon.fit())`
  - node-pty spawn: `name: 'xterm-256color'`, `env: {...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor'}`
  - Binary protocol: 1-byte prefix (INPUT=0, OUTPUT=1, RESIZE=2, PAUSE=3, RESUME=4)
  - Flow control: client tracks bytes in-flight, PAUSE at >100KB, RESUME at <10KB, server calls `pty.pause()`/`pty.resume()`
  - WebSocket: `new WebSocketServer({noServer: true})` + `server.on('upgrade')` routing by path
  - PTY cleanup: boolean exit guard, explicit `pty.kill()` on graceful shutdown
  - Vite proxy: `/ws/*` target must use `ws://` protocol, not `http://`
  - Resize: ResizeObserver → debounce 150ms → fitAddon.fit() → terminal.onResize → WS RESIZE → pty.resize()
  - tmux: `tmux new-session -A -s <name>` (atomic create-or-attach)
- **Done when**: `npm run dev` starts both servers, navigating to localhost:5173 shows a terminal connected to a tmux session, typing works, colors work, resize works, closing the tab leaves the tmux session alive. Integration tests pass.
- **Handoff**: Write `docs/handoff/step-1.md` listing: files created, package versions installed, port numbers, how to run dev/test, the WebSocket protocol message types, and the TerminalPane component's prop interface.

Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.

**Gate**: `npm run build && npm test`

**Interface gate**: After this step, verify:
- `server/src/protocol.ts` exports message type constants (INPUT, OUTPUT, RESIZE, PAUSE, RESUME)
- `client/src/components/TerminalPane.tsx` accepts a `sessionName` prop (string or null)
- `server/src/index.ts` exports or exposes the Express `app` and HTTP `server` for route registration
- WebSocket upgrade handler routes `/ws/terminal` requests

---

### Step 2 — Session management API + sidebar

**Plan**: `docs/plans/2026-04-05-02-session-api-sidebar.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these): `docs/handoff/step-1.md`, `server/src/index.ts` (to see how to register routes), `client/src/App.tsx` (to see current structure), `client/src/components/TerminalPane.tsx` (to see prop interface)
- **Read first**: `docs/plans/2026-04-05-02-session-api-sidebar.md`
- **Context**: Orchestrator pastes step-1 handoff (file structure, protocol types, component interfaces), plus the current `server/src/index.ts` route registration pattern and `App.tsx` component tree.
- **Owns**:
  - `server/src/sessions.ts` (new — REST routes + tmux wrapper)
  - `server/test/sessions.test.ts` (new — integration tests)
  - `client/src/components/SessionSidebar.tsx` (new)
  - `client/src/hooks/useSessions.ts` (new)
  - `client/src/App.tsx` (modify — add sidebar, manage activeSession state)
  - `server/src/index.ts` (modify — register session routes with `app.use`)
- **Must not touch**: `server/src/terminal.ts`, `server/src/protocol.ts`, `client/src/components/TerminalPane.tsx` — these are Step 1's output, consume as-is. Do not create `PaneLayout.tsx`, `TopBar.tsx`, or `EmptyPane.tsx` — those are Step 3's responsibility.
- **Prior step context**: Step 1 created the monorepo with Express on port 8001, WebSocket terminal handler, and a single TerminalPane in App.tsx. Trust `docs/handoff/step-1.md` over this description.
- **Key implementation requirements from research**:
  - Parse sessions with format flags: `tmux list-sessions -F '#{session_id}\t#{session_name}\t#{session_attached}\t#{session_windows}\t#{session_created}'`
  - Create sessions with explicit size: `tmux new-session -d -s <name> -x <cols> -y <rows>`
  - Register routes on the Express app: `app.use('/api', sessionRoutes)` — must come before any static file serving
- **Done when**: All four REST endpoints work (test with curl or integration tests), sidebar renders in the browser showing tmux sessions, clicking a session attaches it in the terminal pane, create/rename/kill work from the UI, sidebar auto-refreshes. Integration tests pass.
- **Handoff**: Write `docs/handoff/step-2.md` listing: files created/modified, REST API endpoints and response shapes, useSessions hook interface, how the sidebar-to-terminal wiring works in App.tsx.

Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.

**Gate**: `npm run build && npm test`

**Interface gate**: After this step, verify:
- `GET /api/sessions` returns `[{id, name, attached, windows, created}]`
- `client/src/hooks/useSessions.ts` exports `useSessions()` returning `{sessions, createSession, renameSession, killSession}`
- `client/src/App.tsx` manages `activeSession` state and passes it to TerminalPane

---

### Step 3 — Multi-pane layout

**Plan**: `docs/plans/2026-04-05-03-multi-pane-layout.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these): `docs/handoff/step-1.md`, `docs/handoff/step-2.md`, `client/src/App.tsx` (current structure after step 2), `client/src/components/TerminalPane.tsx` (prop interface), `client/src/hooks/useSessions.ts` (hook interface)
- **Read first**: `docs/plans/2026-04-05-03-multi-pane-layout.md`
- **Context**: Orchestrator pastes both handoff files, plus the current `App.tsx` (showing sidebar + single pane structure from step 2), TerminalPane props, and useSessions return type.
- **Owns**:
  - `client/src/components/PaneLayout.tsx` (new)
  - `client/src/components/TopBar.tsx` (new)
  - `client/src/components/EmptyPane.tsx` (new)
  - `client/src/App.tsx` (modify — replace single pane with PaneLayout + TopBar)
- **Must not touch**: `server/` (entire directory — no server changes in this step), `client/src/components/TerminalPane.tsx`, `client/src/components/SessionSidebar.tsx`, `client/src/hooks/useSessions.ts` — consume as-is from Steps 1 and 2.
- **Prior step context**: Step 1 created TerminalPane (accepts `sessionName` prop, handles its own WebSocket + resize + cleanup). Step 2 added SessionSidebar and `useSessions` hook, with App.tsx managing a single `activeSession` state. This step replaces the single-pane model with a multi-pane layout. Trust handoff files over this description.
- **Key implementation details**:
  - CSS grid templates: 1 pane `1fr / 1fr`, 2 panes `1fr / 1fr 1fr`, 4 panes `1fr 1fr / 1fr 1fr`
  - Each pane is an independent TerminalPane instance with its own WebSocket
  - Layout state: array of pane slots, each holding a session name or null
  - Sidebar onAttach targets first empty pane, or focused pane if all occupied
  - Shrinking layout keeps first N panes, expanding adds empty slots
  - TerminalPane unmount handles WebSocket cleanup automatically (step 1)
  - Persist layout mode + pane assignments in localStorage
- **Done when**: Layout toggle buttons in the top bar switch between 1/2/4 panes. Each pane connects independently to a session. Empty panes show a session selector. Sidebar click-to-attach works with multi-pane targeting. Layout persists across refresh. Resize works correctly per-pane.
- **Handoff**: Write `docs/handoff/step-3.md` listing: files created/modified, component hierarchy (App → TopBar + PaneLayout + Sidebar), pane state management approach, localStorage keys used.

Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.

**Gate**: `npm run build && npm test`

---

### Step 4 — Production deployment

**Plan**: `docs/plans/2026-04-05-04-production-deployment.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these): `docs/handoff/step-1.md` (port, dev scripts), `docs/handoff/step-3.md` (final component structure), `client/vite.config.ts`, `server/src/index.ts`, `package.json` (root), `/home/breeze/dev/hiking-food/deploy/deploy.sh`, `/home/breeze/dev/hiking-food/deploy/setup.sh`, `/home/breeze/dev/hiking-food/deploy/hiking-food.service`
- **Read first**: `docs/plans/2026-04-05-04-production-deployment.md`
- **Context**: Orchestrator pastes handoff files, current vite.config.ts, server/src/index.ts, root package.json, AND the three hiking-food deploy files (deploy.sh, setup.sh, hiking-food.service) as the pattern exemplars.
- **Owns**:
  - `client/vite.config.ts` (modify — add build.outDir)
  - `server/src/index.ts` (modify — add production static serving + SPA catch-all)
  - `server/package.json` (modify — add build script for TypeScript compilation)
  - `server/tsconfig.json` (modify if needed — ensure outDir is set for compiled output)
  - `package.json` (root — modify — add build and start scripts)
  - `deploy/deploy.sh` (new — rsync-based deploy script)
  - `deploy/setup.sh` (new — one-time remote setup)
  - `deploy/beebaby-admin.service` (new — systemd unit file)
- **Must not touch**: `client/src/` (no component changes), `server/src/terminal.ts`, `server/src/sessions.ts`, `server/src/protocol.ts`
- **Prior step context**: Steps 1-3 built the full app. Dev mode works. This step adds production build config and the deploy/ directory.
- **MUST follow the pattern in**: `/home/breeze/dev/hiking-food/deploy/deploy.sh` — same rsync-based pattern: rsync with exclusions (node_modules, dist, .git, server/public), remote `npm install && npm run build`, copy service file to `~/.config/systemd/user/`, daemon-reload, restart, print status
- **MUST follow the pattern in**: `/home/breeze/dev/hiking-food/deploy/setup.sh` — same one-time setup: create app dir, enable lingering. Usage: `ssh beebaby 'bash -s' < deploy/setup.sh`
- **MUST follow the pattern in**: `/home/breeze/dev/hiking-food/deploy/hiking-food.service` — same systemd structure: Type=simple, WorkingDirectory=%h/dev/beebaby-admin, Restart=always, RestartSec=5, WantedBy=default.target
- **Key implementation requirements from research**:
  - Express route order in production: API routes first, `express.static(publicDir)` second, SPA catch-all `app.get('/{*splat}', ...)` last
  - Vite build: `outDir: '../server/public'`, `emptyOutDir: true`
  - ESM: use `import.meta.dirname` (Node 24 supports it) or `path.dirname(fileURLToPath(import.meta.url))`
  - Service ExecStart: `/usr/bin/node server/dist/index.js`
  - Deploy script rsyncs from WSL dev machine to beebaby, builds remotely, restarts service
- **Done when**: `npm run build` produces `server/public/` with Vite assets and `server/dist/` with compiled server. `npm start` serves the full app on port 8001. `deploy/` directory has all three files matching the hiking-food pattern. `./deploy/deploy.sh` successfully deploys to beebaby. Service runs and is accessible at `beebaby:8001`.
- **Handoff**: Write `docs/handoff/step-4.md` listing: build output locations, production start command, deploy commands (`setup.sh` for first time, `deploy.sh` for subsequent deploys), service file location on beebaby.

Stay within your plan's scope.

**Gate**: `npm run build && npm start` (verify app works at localhost:8001). Then run `./deploy/deploy.sh` and verify `beebaby:8001` is accessible.

## Completion criteria

- All plan acceptance criteria met (check each plan's checkboxes)
- `npm run build && npm test` passes
- App runs in production mode on port 8001
- Systemd service starts and restarts correctly on beebaby
- App accessible at `beebaby:8001` from Tailscale network
- Frontend smoke test: terminal works, sidebar shows sessions, CRUD operations work, multi-pane layout switches correctly, resize works per-pane
