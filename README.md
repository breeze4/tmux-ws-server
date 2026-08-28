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

Factory deploys each pushed `main` commit that passes the project gates. The
`factory.project.yml` file is the active deployment contract. Factory runs the
retained `scripts/cicd-router-gates.sh` gate, restarts
`beebaby-admin.service`, and examines `/api/health` on port `8001`.

The `cicd-router.project.yml` file is audit and recovery data. It does not
control deployments.

The live app is available at `http://beebaby:8001/` on the private tailnet.
