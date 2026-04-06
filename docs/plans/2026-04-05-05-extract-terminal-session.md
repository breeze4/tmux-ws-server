# Extract TerminalSession and rewire TerminalPane

## Parent spec

`docs/specs/2026-04-05-02-terminal-session-extraction.md`

## What to build

Extract a `TerminalSession` class from TerminalPane's useEffect that owns WebSocket lifecycle, binary protocol framing (INPUT/OUTPUT/RESIZE/PAUSE/RESUME), and backpressure flow control. Rewire TerminalPane to use domain methods (`sendInput`, `resize`, `dispose`) instead of raw WebSocket operations. The component's external Props interface is unchanged — this is a pure internal refactor.

## Type

AFK

## Blocked by

None — can start immediately

## User stories addressed

- User story 1 (component expresses intent, not mechanism)
- User story 2 (protocol framing contained in one class)
- User story 3 (connection lifecycle isolated for future reconnection)
- User story 5 (clear separation: rendering vs transport)
- User story 6 (new protocol messages added in TerminalSession only)
- User story 7 (cleanup is two calls, not 14 lines)

## Acceptance criteria

- [ ] `TerminalSession` class exists with constructor taking `{ sessionName, onOutput, onEnd }`
- [ ] `connect(cols, rows)` initiates WebSocket connection and sends initial RESIZE frame
- [ ] `connect()` throws if cols or rows are <= 0
- [ ] `sendInput(string)` encodes and sends INPUT frames
- [ ] `resize(cols, rows)` encodes and sends RESIZE frames
- [ ] `dispose()` tears down WebSocket cleanly without triggering `onEnd`
- [ ] `onEnd(reason)` fires on unexpected WebSocket close (server crash, network drop, shell exit)
- [ ] `onOutput(data, done)` delivers decoded OUTPUT data with a completion callback for backpressure
- [ ] Backpressure (bytesInFlight, PAUSE/RESUME, HIGH_WATER/LOW_WATER) is fully internal to the class
- [ ] Protocol constants (INPUT=0, OUTPUT=1, RESIZE=2, PAUSE=3, RESUME=4) are internal to the class, not exported
- [ ] TerminalPane no longer imports or references WebSocket, Uint8Array framing, protocol constants, or backpressure state
- [ ] TerminalPane's `sendCtrl` uses `session.sendInput()` instead of manual frame encoding
- [ ] TerminalPane's cleanup block is `session.dispose(); terminal.dispose()` (no ordering traps)
- [ ] `sendInput()` / `resize()` after `dispose()` are no-ops
- [ ] Existing TerminalPane tests pass without modification (rendering states are unchanged)
- [ ] Manual smoke test: connect to session, type commands, resize window, switch layouts (1→2→4→1), disconnect/reconnect, detach

## Owns

- `client/src/TerminalSession.ts` — new file, the extracted class
- `client/src/components/TerminalPane.tsx` — remove protocol constants (lines 21-28), remove `sendMessage` helper (lines 81-88), remove WebSocket lifecycle (lines 92-139), replace `sendCtrl` encoding (lines 40-48), replace `terminal.onData`/`terminal.onResize` wiring (lines 141-147), replace cleanup block (lines 157-170)

## Must not touch

- `server/src/protocol.ts` — server keeps its own constants (out of scope per spec)
- `server/src/terminal.ts` — wire protocol unchanged
- `client/src/App.tsx` — no changes to state management
- `client/src/components/PaneLayout.tsx` — no changes to pane rendering
- `client/src/components/SessionSidebar.tsx` — no changes
- `client/src/components/TerminalPane.test.tsx` — existing tests must pass as-is; owned by plan `2026-04-05-06-terminal-session-tests.md`

## Defines interfaces

- `TerminalSession` class interface in `client/src/TerminalSession.ts` — consumed by plan `2026-04-05-06-terminal-session-tests.md`

## Pattern exemplar

- **Follow the pattern in**: `server/src/terminal.ts` — same binary framing format (1-byte opcode + payload), same protocol constants, same PAUSE/RESUME handling. The class is the client-side mirror of this server code.
- **Follow the pattern in**: `client/src/components/TerminalPane.test.tsx` lines 39-59 — `FakeWebSocket` class pattern for how WebSocket is stubbed in this codebase.

## Tasks

- [ ] Create `client/src/TerminalSession.ts` with the class skeleton: constructor, connect, sendInput, resize, dispose, private fields for ws/backpressure state
- [ ] Move protocol constants (INPUT/OUTPUT/RESIZE/PAUSE/RESUME) and water marks (HIGH_WATER/LOW_WATER) into the class as private constants
- [ ] Implement `connect(cols, rows)` — validate dimensions, build URL, create WebSocket, set binaryType, wire onopen (send initial RESIZE), wire onmessage (decode OUTPUT → onOutput with done callback, backpressure), wire onclose (call onEnd if not disposed)
- [ ] Implement `sendInput(string)` — encode text to INPUT frame, send via WebSocket, guard on readyState
- [ ] Implement `resize(cols, rows)` — encode to RESIZE frame with JSON payload, send via WebSocket
- [ ] Implement `dispose()` — set disposed flag, null onclose before close (ordering constraint), close WebSocket
- [ ] Implement backpressure internally — track bytesInFlight, send PAUSE at HIGH_WATER, use done callback to decrement, send RESUME at LOW_WATER
- [ ] Rewire TerminalPane: remove constants, remove sendMessage helper, remove WebSocket creation/lifecycle code
- [ ] Rewire TerminalPane: replace sendCtrl to use sessionRef.current?.sendInput(char)
- [ ] Rewire TerminalPane: create TerminalSession in useEffect after 150ms delay, wire onOutput to terminal.write(data, done), wire onEnd to setDisconnected(true)
- [ ] Rewire TerminalPane: wire terminal.onData → session.sendInput(), terminal.onResize → session.resize()
- [ ] Rewire TerminalPane: simplify cleanup to session.dispose() + terminal.dispose()
- [ ] Verify existing TerminalPane tests pass
- [ ] Manual smoke test: connect, type, resize, layout switch, disconnect, reconnect, detach

## Implementation notes

The `sendCtrl` callback currently reads `wsRef.current` and manually builds an INPUT frame (lines 40-48). After refactoring, it becomes:

```
// Before
const ws = wsRef.current;
if (!ws || ws.readyState !== WebSocket.OPEN) return;
const payload = new TextEncoder().encode(char);
const msg = new Uint8Array(1 + payload.length);
msg[0] = INPUT;
msg.set(payload, 1);
ws.send(msg.buffer);

// After
sessionRef.current?.sendInput(char);
```

The `onOutput` wiring uses the done callback for backpressure:

```
onOutput: (data, done) => terminal.write(data, done)
```

The 150ms connection delay stays in the component (rendering concern). After the timer fires, call `fitAddon.fit()` to get dimensions, then `session.connect(terminal.cols, terminal.rows)`.
