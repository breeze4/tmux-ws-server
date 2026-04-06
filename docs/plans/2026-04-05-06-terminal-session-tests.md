# TerminalSession unit tests

## Parent spec

`docs/specs/2026-04-05-02-terminal-session-extraction.md`

## What to build

Unit tests for the `TerminalSession` class covering protocol framing, backpressure state machine, lifecycle (connect/dispose/onEnd), and input validation. Tests use a mock WebSocket — no DOM, no xterm.js, no server.

## Type

AFK

## Blocked by

- Blocked by `2026-04-05-05-extract-terminal-session.md`

## User stories addressed

- User story 4 (test backpressure and protocol logic without DOM, xterm, or server)

## Acceptance criteria

- [ ] Test: `connect(cols, rows)` creates a WebSocket with correct URL containing session name
- [ ] Test: `connect(cols, rows)` sends RESIZE frame on WebSocket open with correct cols/rows as JSON payload
- [ ] Test: `connect(0, 0)` throws an error
- [ ] Test: `connect(-1, 24)` throws an error
- [ ] Test: `sendInput("hello")` sends a binary frame with opcode 0 and UTF-8 payload
- [ ] Test: `resize(120, 40)` sends a binary frame with opcode 2 and JSON payload `{cols:120,rows:40}`
- [ ] Test: `onOutput` is called with decoded Uint8Array data and a done callback when OUTPUT frame is received
- [ ] Test: PAUSE frame (opcode 3) is sent when bytesInFlight exceeds HIGH_WATER (100KB)
- [ ] Test: RESUME frame (opcode 4) is sent when bytesInFlight drops below LOW_WATER (10KB) after calling done callbacks
- [ ] Test: `dispose()` closes WebSocket without triggering `onEnd`
- [ ] Test: unexpected WebSocket close triggers `onEnd` with a reason
- [ ] Test: `sendInput()` after `dispose()` is a no-op (no error, no send)
- [ ] Test: `resize()` after `dispose()` is a no-op
- [ ] All tests pass with `npm test -w client`

## Owns

- `client/src/TerminalSession.test.ts` — new test file

## Must not touch

- `client/src/TerminalSession.ts` — class implementation is frozen from previous plan
- `client/src/components/TerminalPane.tsx` — component is frozen from previous plan
- `client/src/components/TerminalPane.test.tsx` — existing component tests are separate
- `server/test/*` — server tests are independent

## Defines interfaces

None

## Pattern exemplar

- **MUST follow the pattern in**: `client/src/components/TerminalPane.test.tsx` lines 39-59 — `FakeWebSocket` class with `send` spy, `readyState`, `onopen`/`onmessage`/`onclose` handlers, and `instances` tracking. Adapt this for TerminalSession tests (the class doesn't use React, so no render/screen needed — just instantiate and call methods).
- **Follow the pattern in**: `server/test/terminal.test.ts` lines 43-58 — `sendInput`/`sendResize` helper functions that construct binary frames. Use similar helpers to verify outbound frame format from TerminalSession.

## Tasks

- [ ] Create `client/src/TerminalSession.test.ts` with a `FakeWebSocket` mock class (adapted from TerminalPane.test.tsx pattern)
- [ ] Add helper to decode binary frames from `FakeWebSocket.send` calls (extract opcode byte and payload)
- [ ] Write connect tests: correct URL, RESIZE on open, dimension validation (throws on 0/negative)
- [ ] Write sendInput tests: correct opcode (0), correct UTF-8 payload, no-op after dispose
- [ ] Write resize tests: correct opcode (2), correct JSON payload, no-op after dispose
- [ ] Write onOutput tests: simulate incoming OUTPUT frame via onmessage, verify callback receives data and done function
- [ ] Write backpressure tests: simulate enough OUTPUT data to exceed HIGH_WATER, verify PAUSE sent; call done callbacks to drain below LOW_WATER, verify RESUME sent
- [ ] Write dispose tests: verify WebSocket closed, verify onEnd NOT called
- [ ] Write onEnd tests: simulate unexpected WebSocket close, verify onEnd called with reason
- [ ] Verify all tests pass

## Implementation notes

To simulate incoming OUTPUT frames in tests, construct an ArrayBuffer with opcode 1 + payload and call `ws.onmessage({ data: buffer })` on the FakeWebSocket instance.

For backpressure tests, the key is:
1. Send enough OUTPUT data to push bytesInFlight over 100KB (HIGH_WATER)
2. Verify a PAUSE frame (opcode 3, no payload) was sent
3. Collect the `done` callbacks passed to `onOutput`
4. Call enough of them to drop bytesInFlight below 10KB (LOW_WATER)
5. Verify a RESUME frame (opcode 4, no payload) was sent
