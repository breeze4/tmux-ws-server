# BeeBaby Admin

Web-based tmux session manager.

## Stack

- **Server**: Node.js, Express 5, node-pty, WebSocket (server/)
- **Client**: React 19, xterm.js, Vite (client/)
- Workspaces: root package.json manages both

## Commands

- `npm run dev` — run server + client in dev mode
- `npm run build` — build server then client (output: server/dist, server/public)
- `npm test` — run server tests (vitest)

## Deploy

After a clean build and test run, deploy to beebaby:

```
npm run build && npm test && bash deploy/deploy.sh
```

This rsyncs to `beebaby:~/dev/beebaby-admin`, installs deps, builds, and restarts the systemd user service (`beebaby-admin.service`) on port 8001.
