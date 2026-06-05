# Step 1: Extract TerminalSession — Handoff

## Files created

- `client/src/TerminalSession.ts`

## Files modified

- `client/src/components/TerminalPane.tsx`

## TerminalSession public API

```ts
class TerminalSession {
  constructor(opts: {
    sessionName: string;
    onOutput: (data: Uint8Array, done: () => void) => void;
    onEnd: (reason: string) => void;
  })

  connect(cols: number, rows: number): void   // throws if cols/rows <= 0
  sendInput(data: string): void                // no-op after dispose
  resize(cols: number, rows: number): void     // no-op after dispose
  dispose(): void                              // tears down WS, does NOT fire onEnd
}
```

## Deviations from plan

None. Implementation matches the plan exactly.

## Gate results

- `tsc -b`: clean, no errors
- `vitest run`: 7/7 tests pass (all existing TerminalPane tests)
