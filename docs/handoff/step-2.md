# Step 2 Handoff — Session Management API + Sidebar

## Files Created

- `server/src/sessions.ts` — Express Router with tmux CRUD wrappers, exported as `sessionRoutes`
- `server/test/sessions.test.ts` — Integration tests for all session endpoints (7 tests)
- `client/src/hooks/useSessions.ts` — Polling hook for session list with CRUD methods
- `client/src/components/SessionSidebar.tsx` — Sidebar component with session list, create, rename, kill, detach

## Files Modified

- `server/src/index.ts` — Added `express.json()` middleware and mounted `sessionRoutes` at `/api`
- `server/package.json` — Added `--fileParallelism=false` to test script to avoid port conflicts between test files
- `client/src/App.tsx` — Added `activeSession` state, `SessionSidebar` component, flex layout

## REST API Endpoints

### `GET /api/sessions`
Returns: `Session[]` where Session is `{ id: string, name: string, attached: number, windows: number, created: number }`
Returns empty array if no tmux server running.

### `POST /api/sessions`
Body: `{ name?: string }`
Returns: `201` with created `Session` object. `409` if name already exists.

### `PATCH /api/sessions/:name`
Body: `{ name: string }` (new name)
Returns: `200` with updated `Session`. `404` if not found. `409` if new name conflicts.

### `DELETE /api/sessions/:name`
Returns: `204`. `404` if not found.

## useSessions Hook Interface

```typescript
function useSessions(): {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  createSession: (name?: string) => Promise<void>;
  renameSession: (oldName: string, newName: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

Polls `GET /api/sessions` every 3 seconds. All mutation methods call `refresh()` after completion.

## Sidebar-to-Terminal Wiring (App.tsx)

- `App` manages `activeSession: string | null` state (defaults to `null`)
- `SessionSidebar` receives `activeSession`, `onAttach`, and `onDetach` props
- Clicking a session in the sidebar calls `onAttach(sessionName)` which sets `activeSession`
- The detach button calls `onDetach()` which sets `activeSession` to `null`
- `TerminalPane` receives `activeSession` as its `sessionName` prop
- When `sessionName` is `null`, TerminalPane shows "No session selected"

## Decisions / Deviations

- Used `execFile` (not `exec`) from `child_process` for tmux commands — avoids shell injection
- Session creation uses `-P -F <format>` to get the created session's info directly from `tmux new-session` output, rather than creating then listing
- Added `--fileParallelism=false` to vitest because both test files import `server` from index.ts which calls `server.listen(8001)` at module load; running in parallel causes EADDRINUSE
- Sidebar uses inline styles (consistent with TerminalPane's approach) rather than CSS modules
- Rename is triggered by a pencil button (not double-click) for discoverability; edit is inline with Enter to confirm, Escape to cancel
