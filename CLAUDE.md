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

Factory owns the active source deployment during the container bridge. A push
to `main` sends the exact commit to Factory. Factory runs the retained
`scripts/cicd-router-gates.sh` gate, copies the source, runs
`deploy/remote-bootstrap.sh`, and restarts `beebaby-admin.service`.

Woodpecker checks each push and pull request. A `main` push publishes an
immutable container image, but does not deploy it during this bridge. The
container mounts only the host tmux socket. It does not mount a host directory,
an SSH directory, or the Docker socket.

Before you push, run `bash scripts/cicd-router-gates.sh`. After Factory deploys
the commit, examine `http://beebaby:8001/api/health`.
