# Step 3: Multi-Pane Layout

## Files created
- `client/src/components/TopBar.tsx` — app title and layout toggle buttons (1/2/4)
- `client/src/components/EmptyPane.tsx` — placeholder for unassigned pane slots with session selector
- `client/src/components/PaneLayout.tsx` — CSS grid container rendering TerminalPane or EmptyPane per slot

## Files modified
- `client/src/App.tsx` — replaced single-pane model with multi-pane state management

## Component hierarchy
```
App
├── TopBar (layout toggle)
└── flex row
    ├── SessionSidebar (unchanged)
    └── PaneLayout
        └── per slot: TerminalPane (key=sessionName) | EmptyPane
```

## Pane state management
- `layout: 1 | 2 | 4` — number of visible panes
- `panes: (string | null)[]` — array of length `layout`, each entry is a session name or null
- `focusedPane: number` — index of last-clicked pane (blue border indicator)
- Layout shrink: keep first N pane assignments, drop the rest
- Layout expand: append null slots
- Sidebar attach: assign to first empty pane, or focused pane if all occupied
- Sidebar detach: set focused pane to null

## localStorage
- Key: `beebaby-pane-layout`
- Value: `{ layout, panes }` — saved on every state change, restored on mount with fallback `{ layout: 1, panes: [null] }`

## Grid templates
- 1 pane: `1fr / 1fr`
- 2 panes: `1fr / 1fr 1fr`
- 4 panes: `1fr 1fr / 1fr 1fr`

## Decisions
- EmptyPane uses its own `useSessions()` hook instance for the session list (independent polling)
- TerminalPane gets `key={sessionName}` to force remount/reconnect when session changes
- Focused pane border is 2px solid `#5a8aba`; unfocused is 2px solid transparent (no layout shift)
- 1px gap between grid cells matches the dark background for a subtle divider effect
