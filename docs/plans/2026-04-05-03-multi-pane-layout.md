# Multi-Pane Layout

## Parent spec

`docs/specs/2026-04-05-01-web-tmux-manager.md`

## What to build

The pane layout system: switch between 1x (full), 2x (vertical split), and 4x (2x2 grid) terminal panes. Each pane independently connects to a tmux session via its own WebSocket. A top bar provides layout toggle buttons and connection status. Empty panes show a session selector. Layout preference persists in localStorage. ResizeObserver on each pane container triggers xterm.js refit when pane dimensions change.

## Type

AFK

## Blocked by

- Blocked by `2026-04-05-01-terminal-connection.md` (needs TerminalPane component and WebSocket protocol)
- Blocked by `2026-04-05-02-session-api-sidebar.md` (needs sidebar for session-to-pane assignment via click-to-attach)

## User stories addressed

- User story 6 (1 pane full width/height)
- User story 7 (2 panes vertical split)
- User story 8 (4 panes 2x2 grid)

## Acceptance criteria

- [x] Top bar with layout toggle buttons: 1-pane, 2-pane, 4-pane. Active layout visually indicated
- [x] 1-pane layout: single TerminalPane fills the main area
- [x] 2-pane layout: two TerminalPanes side by side (vertical split, equal width)
- [x] 4-pane layout: four TerminalPanes in a 2x2 grid (equal size)
- [x] Each pane independently connects to a tmux session (or shows empty state)
- [x] Empty pane shows a prompt/selector to pick a session from the session list
- [x] Clicking a session in the sidebar attaches it to the first empty pane, or the focused pane if all panes are occupied
- [x] Switching layout preserves existing pane-to-session assignments where possible (e.g., going from 4 to 2 keeps the first 2 panes, going from 1 to 2 keeps the first pane and adds an empty one)
- [x] Switching layout triggers ResizeObserver → fitAddon.fit() → resize chain for all affected panes
- [x] Layout preference saved to localStorage, restored on page load
- [ ] Top bar shows connection status indicator (connected/disconnected per pane or global)

## Owns

- `client/src/components/PaneLayout.tsx` — layout manager, grid rendering, pane-to-session state
- `client/src/components/TopBar.tsx` — layout toggles, connection status
- `client/src/components/EmptyPane.tsx` — empty pane state with session selector
- `client/src/App.tsx` — modify to replace single TerminalPane with PaneLayout + TopBar, wire sidebar attach to target specific panes

## Must not touch

- `server/src/terminal.ts` — owned by plan `2026-04-05-01`
- `server/src/sessions.ts` — owned by plan `2026-04-05-02`
- `server/src/protocol.ts` — owned by plan `2026-04-05-01`
- `client/src/components/TerminalPane.tsx` — owned by plan `2026-04-05-01` (consumed as-is, do not modify its internals)
- `client/src/components/SessionSidebar.tsx` — owned by plan `2026-04-05-02` (consumed as-is)

## Defines interfaces

None — this plan only consumes existing interfaces (TerminalPane props, useSessions hook, session REST API).

## Pattern exemplar

None — first of its kind. The layout is a CSS grid that switches between `grid-template` configurations. No prior art in this repo.

## Tasks

- [x] Create `client/src/components/TopBar.tsx` — app title, layout toggle buttons (1/2/4 icons or labels), active layout highlighted, connection status indicator
- [x] Create `client/src/components/EmptyPane.tsx` — displays "Select a session" with a dropdown or clickable list of available sessions (consumes useSessions hook), calls `onSelectSession(sessionName)` callback
- [x] Create `client/src/components/PaneLayout.tsx` — manages layout state (1, 2, or 4), maintains array of pane slots (each has a session name or null), renders a CSS grid with the appropriate template (1x1, 1x2, 2x2), renders TerminalPane for assigned slots and EmptyPane for empty slots, handles pane focus state
- [x] Add localStorage persistence: save layout mode and pane-to-session mapping on change, restore on mount
- [x] Implement pane assignment logic: sidebar `onAttach` targets first empty pane, or focused pane if all occupied. Layout changes preserve assignments (shrinking drops trailing panes, expanding adds empty panes)
- [x] Modify `client/src/App.tsx` — replace single TerminalPane with TopBar + PaneLayout + SessionSidebar composition, wire sidebar onAttach to PaneLayout's assignment logic
- [x] Verify resize chain works per-pane: each TerminalPane's ResizeObserver fires independently when grid layout changes, triggering fitAddon.fit() and the WebSocket resize message

## Implementation notes

Layout CSS grid templates:
- 1 pane: `grid-template: 1fr / 1fr`
- 2 panes: `grid-template: 1fr / 1fr 1fr`
- 4 panes: `grid-template: 1fr 1fr / 1fr 1fr`

When switching from more panes to fewer, keep the first N pane assignments. The extra panes' WebSocket connections are cleaned up by TerminalPane's unmount logic (already implemented in plan 01). When switching from fewer to more, new pane slots start as null (empty).

Pane focus: track which pane was last clicked/interacted with. The sidebar's "attach" action targets this pane if all panes are occupied. Visual indicator (border highlight or similar) shows the focused pane.
