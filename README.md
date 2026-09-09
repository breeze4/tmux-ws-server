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

Woodpecker checks every push and pull request with `scripts/ci-gates.sh`. After
a check passes on `main`, Woodpecker sends the commit SHA and the `source`
marker to the restricted BeeBaby deployment command.

The deployment command checks out the commit on the host, installs the pinned
pnpm version through Corepack, builds the app, and restarts the
`beebaby-admin.service` user unit. The service runs outside containers and
binds tailnet port `8001`.

For the build, deploy, rollback, socket, and verification path, read
[Deploy BeeBaby Admin](docs/deployment.md).
