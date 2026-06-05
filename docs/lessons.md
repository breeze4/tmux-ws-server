# Lessons Learned

## 2026-04-05 — Initial build

- **Defer PTY spawn until client sends dimensions.** Spawning at 80x24 then resizing causes garbled output on non-standard screen sizes (especially mobile). Wait for the first RESIZE message.
- **`fitAddon.fit()` doesn't fire `onResize` if dimensions are unchanged.** Always send an explicit RESIZE message on WebSocket open.
- **tmux error messages vary by machine state.** A fresh machine with no tmux socket gives "No such file or directory", not "no server running". Check for multiple error strings or treat all non-zero exits as empty.
- **Mobile web terminals need a control key toolbar.** No Ctrl+C on a phone. Use `onTouchStart` not `onClick`. Include arrow keys and Enter for TUI app interaction.
- **`100vh` is wrong on mobile.** Use `100dvh` with `@supports` fallback. Don't use `position: fixed` on body.
- **Pre-implementation research is strong on setup patterns, weak on timing and runtime failures.** The ~20% that was wrong was all timing-between-components and environment-specific error handling — things that only surface when running on a real device.
