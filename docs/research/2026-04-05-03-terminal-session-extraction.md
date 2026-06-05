# Research: Terminal Session Extraction

**Date**: 2026-04-05
**Source**: `docs/specs/2026-04-05-02-terminal-session-extraction.md`
**Status**: complete

## Summary

The extraction is a clean split. TerminalPane lines 21-28 (constants) and 81-134 (protocol framing, WebSocket lifecycle, backpressure) move into a new `TerminalSession` class. Lines 52-78 (terminal setup, addon loading) and 141-155 (resize observation, terminal event wiring) stay in the component. The cleanup block (lines 157-170) simplifies from 14 lines with ordering traps to two calls: `session.dispose()` and `terminal.dispose()`.

The server protocol is a direct mirror — same opcode values, same 1-byte-prefix framing, same UTF-8 payloads. The server only sends OUTPUT messages; the client only sends INPUT, RESIZE, PAUSE, and RESUME. No server changes needed.

Client-side test infrastructure doesn't exist yet. Adding vitest to the client workspace is straightforward — the server already uses vitest with the same pattern. TerminalSession tests need only a mock WebSocket; no DOM or jsdom required.

## File Map

### TerminalSession (new class — to be extracted)

| File | Current State | Spec Requirement | Change Needed |
|---|---|---|---|
| `client/src/components/TerminalPane.tsx:21-25` | Protocol constants `INPUT=0, OUTPUT=1, RESIZE=2, PAUSE=3, RESUME=4` | Constants are internal to TerminalSession | Move into class as private constants |
| `client/src/components/TerminalPane.tsx:27-28` | `HIGH_WATER=100*1024, LOW_WATER=10*1024` | Backpressure thresholds are internal | Move into class |
| `client/src/components/TerminalPane.tsx:81-88` | `sendMessage()` helper — encodes opcode + UTF-8 payload into Uint8Array | Protocol framing owned by class | Move into class as private method |
| `client/src/components/TerminalPane.tsx:97-139` | WebSocket creation (URL build, binaryType, onopen/onmessage/onclose) | WebSocket lifecycle owned by class | Becomes `connect()` method internals |
| `client/src/components/TerminalPane.tsx:114-134` | `ws.onmessage` — decodes OUTPUT frames, tracks bytesInFlight, sends PAUSE/RESUME | Protocol decoding + backpressure owned by class | Moves into class; decoded output delivered via `onOutput` callback |
| `client/src/components/TerminalPane.tsx:93-94` | `bytesInFlight` and `paused` variables | Backpressure state owned by class | Become private class fields |
| `client/src/components/TerminalPane.tsx:101-104` | URL construction: `${protocol}//${host}/ws/terminal?session=${name}` | URL building owned by class | Moves into `connect()` |

### TerminalPane (modified component)

| File | Current State | Spec Requirement | Change Needed |
|---|---|---|---|
| `client/src/components/TerminalPane.tsx:36-38` | `containerRef`, `wsRef`, `disconnected` state | `wsRef` replaced by session instance ref | Replace `wsRef` with `useRef<TerminalSession>`, keep `containerRef` and `disconnected` |
| `client/src/components/TerminalPane.tsx:40-48` | `sendCtrl` reads `wsRef.current`, manually encodes INPUT frame | Calls `session.sendInput()` instead | Replace frame encoding with `sessionRef.current?.sendInput(char)` |
| `client/src/components/TerminalPane.tsx:52-78` | Terminal creation, addon loading (WebGL/Canvas fallback), `terminal.open()` | Stays in component — rendering concern | No change |
| `client/src/components/TerminalPane.tsx:97-139` | setTimeout 150ms, WebSocket creation, onopen/onmessage/onclose | Replaced by `new TerminalSession(...)` + `session.connect(cols, rows)` | Delete; replace with session construction after dimensions are available |
| `client/src/components/TerminalPane.tsx:141-147` | `terminal.onData` → manual INPUT encoding; `terminal.onResize` → manual RESIZE encoding | Wire to `session.sendInput()` and `session.resize()` | Replace encoding logic with domain method calls |
| `client/src/components/TerminalPane.tsx:149-155` | ResizeObserver + debounce → `fitAddon.fit()` | Stays in component — rendering concern | No change |
| `client/src/components/TerminalPane.tsx:157-170` | 14-line cleanup with ordering constraints | Simplifies to `session.dispose(); terminal.dispose()` | Replace entire block |
| `client/src/components/TerminalPane.tsx:171` | Effect deps: `[sessionName, disconnected]` | Same deps, but effect body is simpler | No change to deps |

### Server Protocol (unchanged — reference only)

| File | Current State | Spec Requirement | Change Needed |
|---|---|---|---|
| `server/src/protocol.ts:1-5` | Exports `INPUT=0, OUTPUT=1, RESIZE=2, PAUSE=3, RESUME=4` | Out of scope — server keeps its own constants | None |
| `server/src/terminal.ts:57-93` | Decodes INPUT, RESIZE, PAUSE, RESUME from client; encodes OUTPUT to client | Wire protocol unchanged | None |
| `server/src/terminal.ts:32-39` | Encodes OUTPUT frames: `Buffer.alloc(1 + payload.length)`, `msg[0] = OUTPUT` | Same framing format | None |
| `server/src/terminal.ts:88-93` | Handles PAUSE → `term.pause()`, RESUME → `term.resume()` | Backpressure protocol unchanged | None |

### Test Infrastructure (new)

| File | Current State | Spec Requirement | Change Needed |
|---|---|---|---|
| `client/package.json` | No test runner, no test script | Need vitest for TerminalSession tests | Add `vitest` to devDependencies, add `"test": "vitest run"` script |
| `client/test/` | Does not exist | TerminalSession unit tests | Create directory with test file |
| `client/tsconfig.json:14` | `include: ["src"]` | Tests need to compile | Expand to `["src", "test"]` or add separate tsconfig |
| Root `package.json:9` | `"test": "npm test -w server"` | Should run client tests too | Update to include `-w client` |

## Dependencies & Compatibility

| Dependency | Current Version | Constraint | Notes |
|---|---|---|---|
| `vitest` | Not installed (client) | 3.1 used in server | Install same version for consistency |
| `WebSocket` (browser API) | Native | Tests need a mock | Vitest's default `node` environment has no `WebSocket` global; tests must provide a mock/fake class |

## Patterns & Conventions

- **Server test layout**: `server/test/*.test.ts` alongside `server/src/` — client tests should mirror as `client/test/*.test.ts`
- **Server test runner**: `vitest run --fileParallelism=false` in package.json script — client can use plain `vitest run`
- **Server protocol helpers**: `server/test/terminal.test.ts` lines 43-58 define `sendInput()` and `sendResize()` helpers that build binary frames — TerminalSession tests should have equivalent helpers for verifying outbound frames
- **Binary framing**: Both sides use identical format — 1 byte opcode + N bytes UTF-8 payload, no length prefix, WebSocket frame as delimiter
- **Server test imports**: Uses `.js` extension (`from '../src/index.js'`) consistent with ESM — client tests should follow same convention if client uses ESM

## Judgment Calls

- [ ] **`onOutput` data type — Uint8Array vs string**: The spec says `onOutput(data: Uint8Array)`, but `terminal.write()` accepts both `Uint8Array` and `string`. The server encodes output as UTF-8 strings. Passing `Uint8Array` means the caller avoids a decode step (xterm handles it internally), but passing `string` would be more consistent with `sendInput(string)`. The current code passes `Uint8Array` from `buf.slice(1)` directly to `terminal.write(data, callback)`.
  - Option A: `Uint8Array` — matches current behavior, avoids unnecessary decode, xterm accepts it natively
  - Option B: `string` — symmetric with `sendInput(string)`, but adds a TextDecoder step for no benefit
  - Resolution: **Option A — Uint8Array.** Input and output are asymmetric by nature: input is text from keyboards, output is bytes from a PTY stream. Forcing symmetry adds a decode step for no benefit. `sendByteInput()` can be added later if needed for the input side.

- [ ] **Backpressure callback threading**: Currently `terminal.write(data, callback)` is used to track when xterm finishes rendering each chunk, and the callback decrements `bytesInFlight`. With TerminalSession owning backpressure, the `onOutput` callback needs to signal back when rendering is complete. Either TerminalSession passes a "done" callback alongside the data, or the caller returns something from `onOutput`.
  - Option A: `onOutput(data, done)` — session passes a completion callback; caller calls `done()` after `terminal.write(data, done)`. Session tracks bytesInFlight internally using the `done` signal.
  - Option B: `onOutput(data)` returns a Promise — session awaits it before decrementing bytesInFlight. More ergonomic but adds async complexity.
  - Option C: Session calls `terminal.write` directly — but this couples session to xterm, violating the spec's separation.
  - Resolution: **Option A — `onOutput(data, done)`.** The wiring becomes `onOutput: (data, done) => terminal.write(data, done)` — one line. Matches how `terminal.write(data, callback)` already works. No promises, no async, session tracks bytesInFlight using the `done` signal internally.
