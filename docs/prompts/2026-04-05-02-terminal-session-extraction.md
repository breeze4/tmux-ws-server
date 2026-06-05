# Orchestration Prompt: Terminal Session Extraction

## Project context

- Working directory: `/home/breeze/dev/beebaby-admin`
- Spec: `docs/specs/2026-04-05-02-terminal-session-extraction.md`
- Research: `docs/research/2026-04-05-03-terminal-session-extraction.md`
- Build (client): `cd client && npx tsc -b && npx vite build`
- Test (client): `cd client && npx vitest run`
- Test (server): `npm test -w server`
- Handoff directory: `docs/handoff/` (create if needed)

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under "Context sources" and include relevant sections in the agent's "Context" field.
2. If a previous step completed, read `docs/handoff/step-{N}.md` and use it to fill in what changed.

## Execution plan

Two steps, serial. No parallelization — Step 2 depends on the class created in Step 1, and both touch the same workspace.

---

### Step 1 — Extract TerminalSession class and rewire TerminalPane

**Plan**: `docs/plans/2026-04-05-05-extract-terminal-session.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these):
  - `docs/specs/2026-04-05-02-terminal-session-extraction.md` (the full spec — inline the interface contract and resolved decisions)
  - `docs/research/2026-04-05-03-terminal-session-extraction.md` (the file map — inline the TerminalSession and TerminalPane tables)
  - `client/src/components/TerminalPane.tsx` (the current code — inline fully, it's 240 lines)
  - `server/src/terminal.ts` (the server-side protocol mirror — inline the message handling, lines 57-93)
  - `server/src/protocol.ts` (protocol constants — inline fully, it's 5 lines)
- **Read first**: `docs/plans/2026-04-05-05-extract-terminal-session.md`
- **Context**: Orchestrator pastes the above files' content here before launch.
- **Owns**:
  - `client/src/TerminalSession.ts` — create new file
  - `client/src/components/TerminalPane.tsx` — modify to consume TerminalSession
- **Must not touch**:
  - `server/src/*` — wire protocol unchanged
  - `client/src/App.tsx`, `client/src/components/PaneLayout.tsx`, `client/src/components/SessionSidebar.tsx` — no changes
  - `client/src/components/TerminalPane.test.tsx` — existing tests must pass as-is, do not modify
  - `client/src/TerminalSession.test.ts` — do not create, that is Step 2's responsibility
- **Follow the pattern in**: `server/src/terminal.ts` — same binary framing format (1-byte opcode + UTF-8 payload), same constant values, same PAUSE/RESUME handling
- **Do not**: Write tests for TerminalSession — that is Step 2's responsibility. Do not create `client/src/TerminalSession.test.ts`.
- **Key implementation details**:
  - `sendCtrl` in TerminalPane currently reads `wsRef.current` and manually builds an INPUT frame. Replace with `sessionRef.current?.sendInput(char)`.
  - `onOutput` wiring: `onOutput: (data, done) => terminal.write(data, done)` — the `done` callback enables backpressure tracking inside the class.
  - The 150ms connection delay stays in the component. After timer fires: `fitAddon.fit()`, then `session.connect(terminal.cols, terminal.rows)`.
  - `dispose()` must null `ws.onclose` before calling `ws.close()` — this ordering constraint moves inside the class, not the component.
  - `sendInput()` / `resize()` after `dispose()` must be no-ops, not errors.
- **Done when**:
  - `TerminalSession` class exists with constructor, connect, sendInput, resize, dispose
  - TerminalPane uses TerminalSession instead of raw WebSocket
  - No protocol constants, Uint8Array framing, or backpressure state in TerminalPane
  - `cd client && npx vitest run` passes (existing TerminalPane tests)
  - `cd client && npx tsc -b` passes (no type errors)
- **Handoff**: Write `docs/handoff/step-1-extract-terminal-session.md` listing: files created, files modified, the TerminalSession public API (constructor params, methods), and any deviations from the plan.

**Gate**: `cd client && npx tsc -b && npx vitest run`

---

### Step 2 — TerminalSession unit tests

**Plan**: `docs/plans/2026-04-05-06-terminal-session-tests.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-1-extract-terminal-session.md` (what Step 1 produced — inline the TerminalSession API)
  - `client/src/TerminalSession.ts` (the class to test — inline fully)
  - `client/src/components/TerminalPane.test.tsx` lines 39-59 (FakeWebSocket pattern — inline)
  - `server/test/terminal.test.ts` lines 43-58 (sendInput/sendResize helper pattern — inline)
- **Read first**: `docs/plans/2026-04-05-06-terminal-session-tests.md`
- **Context**: Orchestrator pastes the above files' content here before launch.
- **Owns**:
  - `client/src/TerminalSession.test.ts` — create new file
- **Must not touch**:
  - `client/src/TerminalSession.ts` — class is frozen, tests must work against it as-is
  - `client/src/components/TerminalPane.tsx` — do not modify
  - `client/src/components/TerminalPane.test.tsx` — do not modify
  - `server/test/*` — server tests are independent
- **MUST follow the pattern in**: `client/src/components/TerminalPane.test.tsx` lines 39-59 — `FakeWebSocket` class with `send` spy, `readyState`, `onopen`/`onmessage`/`onclose`, and `instances` tracking. Adapt for non-React tests (no render/screen — just instantiate TerminalSession and call methods).
- **Prior step context**: Step 1 created `client/src/TerminalSession.ts` with the class. Trust `docs/handoff/step-1-extract-terminal-session.md` for the exact API.
- **Key test patterns**:
  - To verify outbound frames: read `FakeWebSocket.send.mock.calls`, extract the ArrayBuffer/Uint8Array, check byte 0 for opcode and remaining bytes for payload.
  - To simulate incoming OUTPUT: construct `ArrayBuffer` with opcode 1 + payload bytes, call `ws.onmessage({ data: buffer })`.
  - For backpressure: send enough OUTPUT data to exceed 100KB, verify PAUSE (opcode 3) sent. Collect `done` callbacks from `onOutput`, call them to drain below 10KB, verify RESUME (opcode 4) sent.
  - The test environment is `happy-dom` (configured in `client/vite.config.ts`), but these tests don't need DOM — they're pure class tests with a mock WebSocket.
- **Done when**:
  - All acceptance criteria tests pass
  - `cd client && npx vitest run` passes (both TerminalPane and TerminalSession tests)
- **Handoff**: Write `docs/handoff/step-2-terminal-session-tests.md` listing: test file created, number of tests, any edge cases discovered.

**Gate**: `cd client && npx vitest run`

---

## Interface gates

- [ ] After Step 1: verify `client/src/TerminalSession.ts` exports a class with `connect(cols, rows)`, `sendInput(string)`, `resize(cols, rows)`, `dispose()`, and constructor accepting `{ sessionName, onOutput, onEnd }`

## HITL checkpoints

- [ ] After Step 1: manual smoke test — connect to a tmux session, type commands, resize window, switch layouts (1→2→4→1), disconnect/reconnect, detach. This verifies the refactor didn't break runtime behavior.

## Completion criteria

- All plan acceptance criteria met
- `cd client && npx tsc -b && npx vitest run` passes
- `npm test -w server` still passes (no server changes, but verify no regression)
- HITL smoke test approved after Step 1
- TerminalPane contains zero references to WebSocket, Uint8Array, protocol constants, or backpressure state
