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

This bridge keeps the Factory deployment active. A local commit to `main`
creates a Factory deployment intent. Factory runs
`scripts/cicd-router-gates.sh`, restarts `beebaby-admin.service`, and examines
`/api/health` on port `8001`.

Woodpecker checks every push and pull request. A `main` push also publishes an
immutable image to GitHub Container Registry. The image does not deploy during
this bridge.

The `factory.project.yml` and `cicd-router.project.yml` files remain in the
repository for the Factory rollback path. The `compose.beebaby.yaml` file
defines the later container runtime. For deployment, rollback, socket, and
image details, see [the deployment guide](docs/deployment.md).
