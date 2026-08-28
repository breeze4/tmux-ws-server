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

Factory owns deployment. A push to `main` sends the exact commit to Factory.
Factory runs the retained `scripts/cicd-router-gates.sh` gate, copies the
source, runs `deploy/remote-bootstrap.sh`, and restarts
`beebaby-admin.service`.

The `factory.project.yml` file is the active contract. The
`cicd-router.project.yml` file is audit and recovery data only.

Before you push, run the build and tests. After Factory deploys the commit,
examine `http://beebaby:8001/api/health`.
