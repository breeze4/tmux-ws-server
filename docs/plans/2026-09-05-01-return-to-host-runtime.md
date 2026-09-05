# Return BeeBaby Admin to the host runtime

## Parent spec

`docs/specs/2026-04-05-01-web-tmux-manager.md`, resolved decision "Host
runtime, not a container".

## Problem

The container deployment broke the purpose of the service. Evidence gathered
on September 5, 2026:

- The tmux server that owns `/tmp/tmux-1000/default` runs inside the
  `beebaby-admin` container. On the host it appears as
  `tmux -S /run/tmux/default new-session -A -s 0`, and the PID that tmux reports
  for itself does not exist in the host PID namespace.
- Every session lands in the container, including a plain `tmux` command from
  an SSH login, because the socket directory is shared.
- The app runs `tmux new-session -A` as a client. When no server owns the
  socket, that client starts one, and the client lives in the container. The
  August 31, 2026, change that mounted the socket directory made the container
  start without a host server, so after the next reboot the first web visit
  created a container-side server that has owned the socket since.
- The container image holds none of the host toolchain. No Claude CLI, no
  repositories, no SSH keys, and no sudo. Widening the mount is forbidden.

## Decisions

Each decision names the choice and the reason:

1. Run the service on the host as a beeadmin user systemd unit. A failsafe
   must keep working when Docker or Caddy is down, and its shells must be host
   shells.
2. The service binds the Tailscale address on port 8001 itself. Caddy releases
   port 8001. A proxy through the edge container adds a dependency that the
   failsafe must not have.
3. The deployment command gains a host runtime, selected by `runtime: host` in
   the project record, with the same `deploy` and `rollback` verbs and the
   marker `source` in the image position. The forced-command shape, the sudo
   rule, and the Woodpecker step keep their form, and rollback comes with the
   same history records as container projects.
4. Restore service first, by hand, from the retired unit and the stale tree
   on the host. That takes minutes and gives you a working failsafe while the
   rest is built. The deployment command then replaces that stale tree.
5. The host runtime reads no protected deployment environment file. The unit
   file declares the environment, and the app reads no secret.
6. The host runtime installs the unit file from the checkout. The app already
   runs as beeadmin, so the repository already controls what beeadmin runs.
7. Remove the container artifacts from this repository and the host after the
   host runtime passes one reboot. Keep the GHCR package as is.

## Host runtime contract

The deployment command reads these keys from a host project record:

- `repository`: the allowlisted GitHub repository, as today.
- `runtime: host`: selects the host path. Absent means container.
- `host_user`: the account that owns the checkout and the unit, `beeadmin`.
- `host_checkout`: an absolute path under the home directory of `host_user`,
  `/home/beeadmin/dev/beebaby-admin`.
- `host_unit`: the unit name, `beebaby-admin.service`.
- `host_unit_path`: the unit file inside the checkout,
  `deploy/beebaby-admin.service`.
- `health_url`: `http://100.103.192.66:8001/api/health`.

A host deployment runs these steps as root under the host lock, with the
checkout and build steps run as `host_user` through `runuser`:

1. Validate the project, repository, commit, action, and marker the same way
   as today. Reject a host record that carries `compose_path`, `image`, or
   `service`, and reject a container record that carries a host key.
2. Fetch the commit into the checkout. Clone the public repository over HTTPS
   when the checkout does not exist. Detach the working tree at the commit and
   confirm that `HEAD` equals the commit.
3. Install dependencies and build with the package manager that the
   `packageManager` field pins, through corepack.
4. Copy the unit file from the checkout into the user unit directory, reload
   the user manager, enable the unit, and restart it.
5. Probe `health_url` with the same attempt loop that container targets use.
6. On success, write `active.env` with the commit and the marker, keep the
   previous record, and append to `history.log` as today.
7. On failure, check out the commit in `previous.env`, rebuild, restart, probe
   again, and reject with the reason. When no previous record exists, leave the
   unit stopped and reject.

A host rollback runs the same steps with the commit from `previous.env` and
rejects when that record is missing.

Validation mode (`BEEBABY_VALIDATE_ONLY=1`) covers the host path with a
temporary checkout directory, a fake `runuser`, and a fake `git`, the way the
cutover tests fake `runuser` today.

## Phases

### Phase 1: restore service by hand

On BeeBaby, as beeadmin, complete these steps in order:

- [x] Stop and remove the admin container stack:
      `docker compose --project-name beebaby-beebaby-admin down`.
- [x] Confirm that no process holds `/tmp/tmux-1000/default` and remove the
      stale socket file if one remains.
- [x] In `beebaby-infra`, remove the `:8001` block from `caddy/Caddyfile` and
      split the `8000-8013` publish in `compose/edge.yaml` into `8000` and
      `8002-8013`.
- [x] Run `scripts/ci-gates.sh`, then `scripts/sync-to-host.sh`, then apply
      the edge stack with the environment the running Caddy container records
      in its Compose labels.
- [x] Confirm that nothing listens on port 8001.
- [x] Start the retired unit: `systemctl --user enable --now beebaby-admin`.
- [x] Open `http://beebaby.tailc65f2f.ts.net:8001`, create a session, and
      confirm from inside it that `hostname` prints the host name and
      `which claude` prints a path.

### Phase 2: host runtime in the deployment command

In the `beebaby-infra` repository, complete these steps:

- [x] Add the host record keys and the `runtime: host` branch to
      `deploy/beebaby-deploy`, following the contract in this plan.
- [x] Reject a `host_checkout` path that exists without a `.git` directory, so
      the stale tree from the retired deployment never passes as a checkout.
- [x] Reuse `source_unit_value` and `restart_source_unit` for the unit steps.
- [x] Skip `load_deployment_environment` for host records.
- [x] Add validation-mode tests to `scripts/ci-gates.sh`: a host record
      validates, a host record with `compose_path` is rejected, a container
      record with `host_unit` is rejected, and the fake `git` receives the
      commit.
- [x] Update the record-count and `compose_path` gates for one host record.
- [x] Rewrite `deploy/projects/beebaby-admin.yaml` as a host record.
- [x] Mark `beebaby-admin` as `runtime: host` in `config/ports.yaml`.
- [x] Document the host runtime in `docs/operations.md` and in
      `deploy/projects/README.md`.
- [x] Run `scripts/ci-gates.sh`, `scripts/sync-to-host.sh`, and
      `scripts/install-forced-command.sh`.

### Phase 3: host bits in this repository

In this repository, complete these steps:

- [x] Add a `HOST` environment variable to `server/src/index.ts` that selects
      the listen address, default `0.0.0.0`.
- [x] Update `deploy/beebaby-admin.service` to set `PORT=8001`,
      `HOST=100.103.192.66`, and `NODE_ENV=production`, and to start after
      `network-online.target`.
- [x] Delete `deploy/remote-bootstrap.sh`, `Dockerfile`, and
      `compose.beebaby.yaml`.
- [x] Delete `.woodpecker/publish.yaml`. Make `.woodpecker/deploy.yaml` depend
      on `check` and call
      `deploy beebaby-admin breeze4/tmux-ws-server COMMIT source deploy`.
- [x] Rewrite `docs/deployment.md` for the host runtime, including the manual
      deploy command and the rollback command.
- [x] Update the deployment section of `CLAUDE.md`.
- [x] Run `bash scripts/ci-gates.sh`.

### Phase 4: cut over through the deployment command

After phases 2 and 3 are on the host, complete these steps:

- [x] Move the stale tree aside: `mv ~/dev/beebaby-admin ~/dev/beebaby-admin.stale`.
      The running unit keeps its open directory, and the deployment clones a
      fresh checkout at that path.
- [x] Push to `main` and confirm that the Woodpecker pipeline deploys the head
      commit. The deployment command reads the commit from GitHub, so the push
      comes first.
- [x] Run the deployment command by hand once for the same commit and confirm
      that it reports `deployed`. That proves the manual path.
- [x] Read `active.env` and confirm the commit.
- [x] Reboot BeeBaby. Confirm that the unit is active, that the health
      endpoint answers `200`, and that a new session runs a host shell.

### Phase 5: cleanup after the reboot test

After the reboot test passes, complete these steps:

- [x] Delete `/srv/beebaby/secrets/deploy-env/beebaby-admin.env`.
- [x] Delete `/srv/beebaby/stacks/beebaby-admin`.
- [x] Delete `~/dev/beebaby-admin.stale`.
- [x] Remove the container entries from
      `/srv/beebaby/deployments/beebaby-admin/history.log`.
- [x] Append the lessons from this work to `docs/lessons.md`.

## Rollback

If phase 1 fails, the container stack can return with the recorded digest in
`/srv/beebaby/deployments/beebaby-admin/active.env` and the Caddy block
restored, but that returns the broken state. Prefer to fix the unit.

If phase 4 fails, the host runtime rolls back to the previous commit on its
own. If the deployment command itself is broken, stop the unit, check out the
last working commit by hand, build, and start the unit.

## Out of scope

- A second host project. The contract supports one, and the record shape is
  general, but no other service needs it.
- Authentication for the admin page. Tailscale keeps the access boundary.
- A Caddy route for the admin page. The service binds the Tailscale address
  itself.

## Done when

- A session opened from the admin page runs a shell on the host as beeadmin,
  with the Claude CLI on its path.
- `tmux ls` from an SSH login lists the same sessions as the admin page.
- Caddy publishes no listener on port 8001 and the Caddyfile has no `:8001`
  block.
- A push to `main` deploys through the forced command with the `source`
  marker, and `active.env` records the commit.
- The service comes back after a reboot without any manual step.
- The container image, the Compose file, the publish workflow, and the host
  stack directory are gone.
