# BeeBaby Admin

Web-based tmux session manager.

## Stack

- **Server**: Node.js, Express 5, node-pty, WebSocket (server/)
- **Client**: React 19, xterm.js, Vite (client/)
- Workspaces: root package.json manages both

## Commands

- `pnpm run dev`: Run the server and client in development mode.
- `pnpm run build`: Build the server and client.
- `pnpm test`: Run the server tests.

The build output is in `server/dist/` and `server/public/`.

## Deployment

BeeBaby Admin runs on the BeeBaby host through the `beeadmin` user unit
`beebaby-admin.service`. The unit starts the Node server with
`HOST=100.103.192.66`, `PORT=8001`, and `NODE_ENV=production`.

A push to `main` runs the check and deploy workflows in `.woodpecker/`. The
deploy workflow sends the host deployment command with the `source` marker.
Before you push, run `bash scripts/ci-gates.sh`.

To deploy a commit manually, run:

```sh
ssh beeadmin@100.103.192.66 \
  "deploy beebaby-admin breeze4/tmux-ws-server COMMIT_SHA source deploy"
```

For rollback and verification procedures, read `docs/deployment.md`.
