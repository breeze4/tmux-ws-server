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

Woodpecker on BeeBaby owns the deployment. A push to `main` runs the check,
publish, and deploy workflows in `.woodpecker/`. The deploy workflow calls the
restricted deployment command on BeeBaby, which resolves the published tag to an
immutable digest and rolls the container forward. Caddy proxies tailnet port
`8001` to container port `8080`.

The container mounts only the host tmux socket. It does not mount a host
directory, an SSH directory, or the Docker socket. Do not widen that mount.

Before you push, run `bash scripts/ci-gates.sh`. After the pipeline deploys the
commit, examine `http://beebaby.tailc65f2f.ts.net:8001/api/health`. For the
build, rollback, and verification path, read `docs/deployment.md`.
