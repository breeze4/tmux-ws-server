# Step 2: TerminalSession Unit Tests — Handoff

## Test file created

- `client/src/TerminalSession.test.ts` — 16 tests across 6 describe blocks

## Test inventory

### connect (5 tests)
- Creates WebSocket with correct URL containing session name
- URL-encodes the session name
- Sends RESIZE frame on WebSocket open with correct cols/rows
- Throws on cols=0, rows=0
- Throws on negative cols

### sendInput (2 tests)
- Sends binary frame with opcode 0 and UTF-8 payload
- No-op after dispose

### resize (2 tests)
- Sends binary frame with opcode 2 and JSON payload
- No-op after dispose

### onOutput (2 tests)
- Calls onOutput with Uint8Array data and done callback on OUTPUT frame
- Ignores empty frames

### backpressure (3 tests)
- PAUSE sent when bytesInFlight exceeds HIGH_WATER (100KB)
- RESUME sent when bytesInFlight drops below LOW_WATER (10KB) after done
- No RESUME if bytesInFlight still above LOW_WATER (multi-chunk scenario)

### dispose / onEnd (2 tests)
- dispose() closes WebSocket without triggering onEnd
- Unexpected WebSocket close triggers onEnd with reason

## Edge cases discovered

- **URL encoding**: Session names with spaces/special characters need `encodeURIComponent`. Added a test for this beyond the original 13 acceptance criteria.
- **Empty frames**: The class silently ignores zero-length messages. Added a test to confirm this behavior.
- **Multi-chunk backpressure**: When multiple OUTPUT chunks are in flight, calling `done` for a smaller chunk may not cross the LOW_WATER threshold. The third backpressure test covers this ordering-sensitive scenario.

## Gate result

All 23 tests pass (16 TerminalSession + 7 TerminalPane).
