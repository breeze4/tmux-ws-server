<!-- cos:managed-project:start -->
## Reading copy

This section applies only when the file `.cos/reading-copy` exists in this checkout. If that file doesn't exist, ignore this section.

When `.cos/reading-copy` exists:

- This checkout is a reading copy of the project `tmux-ws-server`, which the chief of staff owns on beebaby.
- The git hooks in this checkout reject every commit and push.
- To change the project, ask the chief of staff. Or run `cos eject tmux-ws-server` here, make the change, and run `cos migrate tmux-ws-server` when you finish.
<!-- cos:managed-project:end -->
