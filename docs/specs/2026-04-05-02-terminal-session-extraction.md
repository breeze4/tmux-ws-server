## Problem Statement

TerminalPane's 120-line useEffect mixes transport concerns (WebSocket lifecycle, binary protocol framing, backpressure flow control) with terminal rendering concerns (xterm.js setup, resize observation, addon loading). The component speaks WebSocket when it should speak terminal domain concepts — it knows about `readyState`, `Uint8Array` framing, opcode bytes, and water marks.

This makes the component hard to read, hard to test, and fragile to modify. The cleanup function has ordering constraints (`ws.onclose = null` before `ws.close()`) that are correctness traps. Protocol constants (INPUT/OUTPUT/RESIZE/PAUSE/RESUME) are duplicated between client and server with no shared source.

## Solution

Extract a `TerminalSession` class that owns the WebSocket connection, binary protocol, and backpressure. TerminalPane stops knowing about transport entirely and instead calls domain methods: `sendInput()`, `resize()`, `dispose()`. Output and lifecycle events flow back through callbacks provided at construction time.

The component's responsibility narrows to: create a terminal, create a session, wire them together, handle rendering states (empty, connected, disconnected).

## User Stories

1. As a developer reading TerminalPane, I want the component to express intent ("send input", "resize") rather than mechanism ("encode bytes, set opcode, check readyState"), so that I can understand what the component does without understanding the wire protocol.
2. As a developer modifying the protocol, I want protocol framing contained in one class, so that changes don't require updating both TerminalPane and server code in lockstep.
3. As a developer adding reconnection logic, I want connection lifecycle isolated in TerminalSession, so that I can add retry behavior without touching rendering code.
4. As a developer writing tests, I want to test backpressure and protocol logic without needing a DOM, xterm.js, or a running server.
5. As a developer debugging resize issues, I want a clear separation between "terminal recalculated its grid" (rendering) and "told the server about new dimensions" (transport), so that I can identify which layer is broken.
6. As a developer adding a new protocol message, I want to add it in TerminalSession without modifying TerminalPane.
7. As a developer reading cleanup code, I want disposal to be straightforward (`session.dispose()`, `terminal.dispose()`) rather than a 14-line block with ordering constraints.

## Data Flow

### Current flow (before)

```
TerminalPane useEffect:
  create Terminal → load addons → open in container
  setTimeout 150ms → create WebSocket → set binaryType
  ws.onopen → fitAddon.fit() → encode RESIZE frame → ws.send()
  ws.onmessage → decode OUTPUT frame → terminal.write() → track bytesInFlight → PAUSE/RESUME
  terminal.onData → encode INPUT frame → ws.send()
  terminal.onResize → encode RESIZE frame → ws.send()
  ResizeObserver → debounce → fitAddon.fit()
  cleanup: clear timers, null onclose, close ws, dispose terminal
```

### New flow (after)

```
TerminalPane useEffect:
  create Terminal → load addons → open in container
  wait for container dimensions (150ms or ResizeObserver gate)
  create TerminalSession({ sessionName, onOutput, onEnd })
  session.connect(cols, rows)
  terminal.onData → session.sendInput(string)
  terminal.onResize → session.resize(cols, rows)
  ResizeObserver → debounce → fitAddon.fit()
  cleanup: session.dispose(), terminal.dispose()

TerminalSession internally:
  connect() → validate dimensions → create WebSocket → set binaryType
  ws.onopen → send RESIZE frame
  ws.onmessage → decode frame → call onOutput(data)
  sendInput() → encode INPUT frame → ws.send()
  resize() → encode RESIZE frame → ws.send()
  backpressure: track bytesInFlight, send PAUSE/RESUME automatically
  dispose() → close WebSocket (without triggering onEnd)
  ws.onclose (unexpected) → call onEnd(reason)
```

## Behavior

### TerminalSession owns (responsibilities)

- WebSocket creation, configuration (`binaryType = 'arraybuffer'`), and teardown
- Binary protocol framing: opcode byte + payload encoding/decoding
- Protocol constants: INPUT, OUTPUT, RESIZE, PAUSE, RESUME (not exported)
- Backpressure: bytesInFlight tracking, HIGH_WATER/LOW_WATER thresholds, PAUSE/RESUME signaling
- Input validation: `connect()` throws if cols/rows are <= 0

### TerminalSession hides (implementation details)

- WebSocket instance and readyState checks
- Uint8Array construction and TextEncoder/TextDecoder usage
- Opcode values and protocol framing format
- Backpressure state machine (paused flag, water marks, bytesInFlight counter)
- The fact that transport is WebSocket at all

### TerminalSession exposes (interface contract)

```
constructor({ sessionName, onOutput, onEnd })
  sessionName: string — tmux session to connect to
  onOutput: (data: Uint8Array, done: () => void) => void — called with decoded output data; caller must call done() when rendering is complete (enables internal backpressure tracking)
  onEnd: (reason: string) => void — called when session ends unexpectedly

connect(cols: number, rows: number): void
  Throws if cols <= 0 or rows <= 0
  Initiates WebSocket connection and sends initial RESIZE

sendInput(data: string): void
  Sends text input to the session

resize(cols, rows): void
  Sends updated dimensions to the server

dispose(): void
  Tears down WebSocket cleanly, does NOT trigger onEnd
```

### Caller migration

TerminalPane's useEffect changes from:

- Building WebSocket URLs, setting binaryType, managing readyState → `new TerminalSession(...)` + `session.connect(cols, rows)`
- Encoding INPUT frames manually → `session.sendInput(string)`
- Encoding RESIZE frames with JSON.stringify → `session.resize(cols, rows)`
- Tracking bytesInFlight, paused flag, PAUSE/RESUME → gone, fully internal
- 14-line cleanup block with ordering constraints → `session.dispose(); terminal.dispose()`
- `wsRef` for sendCtrl callback → session instance ref, call `session.sendInput()`

### Edge cases

- `sendInput()` / `resize()` called before `connect()` — no-op or queue (implementation choice, not visible to caller)
- `sendInput()` / `resize()` called after `dispose()` — no-op, no error
- `connect()` called with 0x0 dimensions — throws immediately
- WebSocket fails to connect — `onEnd` fires with reason
- Multiple rapid `resize()` calls — all sent, no debouncing (debounce stays in the component's ResizeObserver)

## Modules

- **TerminalSession**: Domain class encapsulating terminal-over-WebSocket transport
  - Role: **defines** the terminal session interface
  - Interface: constructor, connect, sendInput, resize, dispose
  - Test: yes

- **TerminalPane (modified)**: React component narrowed to rendering + wiring
  - Role: **consumes** TerminalSession interface
  - Interface: unchanged externally (same Props)
  - Test: no (no client tests exist; visual verification)

## Resolved Decisions

- **Class, not hook**: TerminalSession is a plain TypeScript class, not a React hook. Hooks are React-specific; the session logic has no React dependency. A hook can wrap the class if needed later, but the core logic is framework-agnostic.

- **One instance per pane**: Each TerminalPane creates and owns one TerminalSession. No sharing between panes. PaneLayout already enforces this via `key={sessionName}`.

- **Callbacks at construction time**: `onOutput` and `onEnd` are required constructor parameters, not optional events or post-construction subscriptions. They're the core contract of the class.

- **`onEnd` vs `dispose()` are mutually exclusive**: `onEnd` fires only for unexpected endings (server closed connection, network dropped, shell exited). `dispose()` tears down cleanly and never triggers `onEnd`. This prevents React state updates on unmounting components.

- **`sendInput()` takes strings**: The API accepts strings, not bytes. Every caller sends strings (xterm's onData, touch keyboard). A `sendByteInput()` can be added later if needed.

- **150ms delay stays in the component**: The connection delay is a rendering/layout concern (wait for container to have dimensions). TerminalSession validates dimensions (`connect()` throws on 0x0) but doesn't manage timing. The component is responsible for knowing when dimensions are ready.

- **`resize()` is fire-and-forget**: No ack from server, no way to verify visual correctness. Same as current behavior. Debouncing stays in the component's ResizeObserver; TerminalSession sends every resize it receives.

- **Protocol constants are internal**: INPUT/OUTPUT/RESIZE/PAUSE/RESUME values are implementation details of TerminalSession. Not exported, not part of the public API.

- **Backpressure is fully hidden**: HIGH_WATER, LOW_WATER, bytesInFlight, PAUSE/RESUME are internal to TerminalSession. The component never knows about flow control. The `onOutput(data, done)` callback's `done` parameter is the only surface area — the session uses it to track when rendering completes and manage bytesInFlight internally.

- **`onOutput` passes Uint8Array, not string**: Input and output are asymmetric by nature. `sendInput()` takes strings (from keyboards), `onOutput` provides Uint8Array (from PTY byte stream). xterm's `terminal.write()` accepts Uint8Array natively, so no decode step is needed. The wiring is: `onOutput: (data, done) => terminal.write(data, done)`.

## Testing Decisions

- **TerminalSession**: Unit tests with a mock WebSocket. Test protocol framing (correct opcode bytes), backpressure state machine (PAUSE sent at HIGH_WATER, RESUME at LOW_WATER), input validation (0x0 throws), dispose behavior (onEnd not called), and the onEnd/onOutput callback contracts.
- **Prior art**: Server-side tests in `server/test/terminal.test.ts` test the other end of this protocol. Client tests would mirror the same protocol expectations from the client side.
- **Frontend verification**: No automated component tests. TerminalPane changes verified by manual smoke test (connect to session, type, resize window, switch layouts, disconnect/reconnect).

## Dependency Strategy

- **In-process**: TerminalSession is pure client-side logic with one external dependency (WebSocket). WebSocket is substitutable in tests via a mock/fake implementation. No I/O beyond the WebSocket.

## Testing Strategy

- **New boundary tests**: TerminalSession unit tests covering protocol encoding, backpressure state machine, lifecycle (connect/dispose/onEnd), and input validation.
- **Old tests to delete**: None — no client tests exist today.
- **Test environment**: Mock WebSocket class. No DOM needed. No server needed.

## Out of Scope

- **Reconnection logic**: TerminalSession does not auto-reconnect. The component shows a reconnect button and creates a new TerminalSession on user action. Auto-reconnect can be added later as a wrapper.
- **Shared protocol constants**: The server's `protocol.ts` still has its own constants. Unifying them into a shared package is a separate effort.
- **Server-side changes**: The wire protocol is unchanged. The server doesn't know or care about this refactor.
- **Other components**: SessionSidebar, PaneLayout, App.tsx are untouched.
- **Session switching without remount**: Seamless session switching (reuse Terminal, swap the WebSocket) is a different architecture. This refactor preserves the current unmount/remount behavior.
