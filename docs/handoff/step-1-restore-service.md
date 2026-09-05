# Step 1 handoff: restore the host service

## Result

The `beebaby-admin` user unit runs on the BeeBaby host. The service owns port
`8001`, and Caddy does not publish that port. The health endpoint returns an
HTTP `200 OK` status.

## Commands and evidence

The restoration ran the following commands:

```sh
ssh beebaby 'cd /srv/beebaby/stacks/beebaby-admin && sudo -n docker compose --project-name beebaby-beebaby-admin down'
ssh beebaby 'rm /tmp/tmux-1000/default'
bash scripts/ci-gates.sh
bash scripts/sync-to-host.sh
ssh beebaby 'sudo -n env TAILSCALE_IP=100.103.192.66 CADDY_IMAGE=caddy@sha256:d8c17a862962def15cde69863a3a463f25a2664942eafd7bdbf050e9c3116b83 docker compose --project-name beebaby-edge -f /srv/beebaby/config/infra/compose/edge.yaml up -d caddy'
ssh beebaby 'systemctl --user enable --now beebaby-admin'
curl -sS -i http://beebaby.tailc65f2f.ts.net:8001/api/health
```

The infrastructure gate ended with `infrastructure gates passed`. The health
probe returned the following response:

```text
HTTP/1.1 200 OK
{"status":"ok"}
```

The host listener is the Node process, not Caddy:

```text
LISTEN 0 511 *:8001 *:* users:(("MainThread",pid=2335209,fd=21))
```

The host has no Admin container. The default tmux socket is absent. After the
browser verifier removed its test session, `tmux ls` reported no server.

## Caddy change

The infra change removes the `:8001` Caddy block. The edge Compose file changes
the Tailscale mapping from `8000-8013` to separate `8000` and `8002-8013`
mappings. The host configuration contains the same change.

## Browser verification

A fresh-context verifier created `verify-step-1` in the admin page, focused the
xterm input, and ran `hostname; which claude; id -un`. The tmux capture showed
`beebaby`, `/home/beeadmin/.local/bin/claude`, and `beeadmin`. The verifier
saved these PNG files and removed the test session:

- `screenshots/verify-step-1-created.png`
- `screenshots/verify-step-1-terminal.png`
