# tmux-ws-server

A browser-based tmux session manager. Create, attach, rename, and kill tmux sessions from a web UI with live terminal panes powered by xterm.js.

## Features

- 1/2/4 pane layouts with session-per-pane
- Sidebar with session list, create/rename/kill
- Reconnect on disconnect (layout persisted to localStorage)
- Tmux shortcut cheatsheet built into the UI
- Touch-friendly toolbar for mobile

## Stack

Node.js + Express + node-pty + WebSocket (server), React + xterm.js + Vite (client).

## Run the app

```bash
pnpm install
pnpm run dev
```

To serve a production build on port `8001`, run these commands:

```bash
pnpm run build
pnpm start
```

## Deployment

Woodpecker on BeeBaby tests each commit on the `main` branch, builds an
immutable container image, publishes it to GitHub Container Registry, and
deploys that digest through the restricted deployment command. Caddy proxies
tailnet port `8001` to the running container, which listens on port `8080`.

Woodpecker checks every push and pull request with `scripts/ci-gates.sh`. Only a
`main` push publishes an image and deploys it. The container mounts the host
tmux socket and nothing else.

The `deploy/` directory records the retired source-copy deployment. It stays
until the container deployment passes one BeeBaby reboot and seven days of
normal operation, because the documented rollback path still needs it.

For the build, deploy, rollback, socket, and verification path, read
[Deploy BeeBaby Admin](docs/deployment.md).
