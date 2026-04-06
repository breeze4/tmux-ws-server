# Session Management API + Sidebar

## Parent spec

`docs/specs/2026-04-05-01-web-tmux-manager.md`

## What to build

REST API for tmux session CRUD and a sidebar component that consumes it. The API wraps tmux CLI commands with structured JSON responses using `tmux list-sessions -F` format flags for stable parsing. The sidebar displays the session list with auto-refresh polling, and provides controls to create, rename, kill, and attach to sessions. Click-to-attach wires the sidebar to the existing TerminalPane component from plan 01.

## Type

AFK

## Blocked by

- Blocked by `2026-04-05-01-terminal-connection.md` (needs the Express server, WebSocket terminal handler, and TerminalPane component)

## User stories addressed

- User story 1 (see all active sessions in sidebar)
- User story 3 (create new session with optional name)
- User story 4 (rename session)
- User story 5 (kill session with confirmation)
- User story 10 (detach pane from session without killing it)
- User story 11 (sidebar auto-refresh)

## Acceptance criteria

- [x] `GET /api/sessions` returns JSON array of sessions with fields: id, name, attached, windows, created
- [x] `POST /api/sessions` creates a new tmux session (optional `name` in body, uses `-x`/`-y` for initial size)
- [x] `PATCH /api/sessions/:name` renames a session (new name in body)
- [x] `DELETE /api/sessions/:name` kills a session
- [x] All endpoints return appropriate error responses (session not found, duplicate name, etc.)
- [x] Sidebar component displays session list with name, window count, attached indicator
- [x] Sidebar auto-refreshes via polling every 2-3 seconds
- [x] Clicking a session in the sidebar attaches it to the terminal pane
- [x] Create session UI: input field for optional name, submit button
- [x] Rename session UI: inline edit or modal
- [x] Kill session UI: button with confirmation dialog
- [x] Detach button on the terminal pane disconnects WebSocket without killing the tmux session
- [x] Integration tests: create session → list (verify present) → rename → list (verify renamed) → kill → list (verify absent)

## Owns

- `server/src/sessions.ts` — REST route handlers, tmux command wrapper functions
- `server/test/sessions.test.ts` — integration tests for session CRUD
- `client/src/components/SessionSidebar.tsx` — sidebar component
- `client/src/hooks/useSessions.ts` — polling hook for session list data
- `client/src/App.tsx` — modify to add sidebar alongside terminal pane, wire click-to-attach

## Must not touch

- `server/src/terminal.ts` — owned by plan `2026-04-05-01-terminal-connection.md` (already complete)
- `server/src/protocol.ts` — owned by plan `2026-04-05-01-terminal-connection.md`
- `client/src/components/PaneLayout.tsx` — owned by plan `2026-04-05-03-multi-pane-layout.md`

## Defines interfaces

- **Session REST API contract** in `server/src/sessions.ts` — `GET/POST/PATCH/DELETE /api/sessions` response shapes. Consumed by `client/src/hooks/useSessions.ts` and plan `2026-04-05-03-multi-pane-layout.md`
- **useSessions hook** in `client/src/hooks/useSessions.ts` — returns session list + CRUD methods. Consumed by plan `2026-04-05-03-multi-pane-layout.md` (pane layout needs session data for assignment)

## Pattern exemplar

None — first of its kind (greenfield). Refer to research doc for:
- tmux `list-sessions -F` format string pattern (section 5)
- `tmux new-session -d -s <name> -x <cols> -y <rows>` for headless creation (section 5)

## Tasks

- [x] Create `server/src/sessions.ts` — tmux command wrapper functions: `listSessions()` parses `tmux list-sessions -F '#{session_id}\t#{session_name}\t#{session_attached}\t#{session_windows}\t#{session_created}'`, `createSession(name?, cols?, rows?)` runs `tmux new-session -d`, `renameSession(oldName, newName)` runs `tmux rename-session`, `killSession(name)` runs `tmux kill-session`
- [x] Add Express REST routes to `server/src/sessions.ts`: GET/POST/PATCH/DELETE on `/api/sessions`, register on the Express app in `server/src/index.ts`
- [x] Wire session routes into `server/src/index.ts` (add `app.use('/api', sessionRoutes)` before static serving)
- [x] Create `client/src/hooks/useSessions.ts` — fetches `GET /api/sessions` on an interval (2-3s), exposes `sessions`, `createSession()`, `renameSession()`, `killSession()`, `loading`, `error`
- [x] Create `client/src/components/SessionSidebar.tsx` — renders session list from `useSessions`, each entry shows name + window count + attached badge, click handler calls an `onAttach(sessionName)` callback, create form (input + button), rename (inline edit or click-to-edit), kill (button with confirm dialog)
- [x] Modify `client/src/App.tsx` — add SessionSidebar alongside TerminalPane, manage `activeSession` state, pass `onAttach` callback that sets the active session, pass session name to TerminalPane
- [x] Add detach control: button or UI element that disconnects the WebSocket (TerminalPane prop or method) without killing the tmux session, clears the active session state
- [x] Write integration tests: create a test session, list sessions and verify it appears, rename it, verify new name, kill it, verify it's gone

## Implementation notes

Session list parsing uses tab-separated format flags — never parse default `tmux list-sessions` output. The format string:

```
tmux list-sessions -F '#{session_id}\t#{session_name}\t#{session_attached}\t#{session_windows}\t#{session_created}'
```

`session_created` is a Unix timestamp. `session_attached` is a count (0 = no clients). `session_id` is `$N` format.

For session creation, always pass `-x` and `-y` to avoid the 80x24 default:

```
tmux new-session -d -s <name> -x 120 -y 40
```

Use reasonable defaults if the client doesn't specify dimensions.
