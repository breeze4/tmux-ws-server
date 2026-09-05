# Step 3 handoff: Admin host runtime files

## Result

The Admin repository defines only the host runtime. The server honors `HOST`,
the user unit binds the Tailscale address, and the deployment workflow sends the
`source` command from the Step 2 contract.

## Diff summary

The change modifies five files and removes four container files:

- Modified: `server/src/index.ts`, `deploy/beebaby-admin.service`,
  `.woodpecker/deploy.yaml`, `docs/deployment.md`, and `CLAUDE.md`.
- Removed: `Dockerfile`, `compose.beebaby.yaml`,
  `deploy/remote-bootstrap.sh`, and `.woodpecker/publish.yaml`.

## Service unit

The deployed unit file is:

```ini
[Unit]
Description=BeeBaby Admin
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/dev/beebaby-admin
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=5
Environment=HOST=100.103.192.66
Environment=PORT=8001
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

## Verification

`bash scripts/ci-gates.sh` passed. The gate built both workspaces and skipped
only tmux-backed integration tests because the gate host lacks `tmux`.

The local bind check started the server with `HOST=127.0.0.1` and a temporary
port. The server listened only on `127.0.0.1`, and `/api/health` returned
`{"status":"ok"}`.
