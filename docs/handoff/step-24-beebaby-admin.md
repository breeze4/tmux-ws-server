# Step 24: clean up BeeBaby Admin

## Baseline

Before this step the repository carried both retired deployment contracts,
`factory.project.yml` and `cicd-router.project.yml`, and ran its gate from
`scripts/cicd-router-gates.sh`. The `.woodpecker/` directory held a check
workflow and a publish workflow but no deploy workflow, so Woodpecker published
an image and stopped. The README, `CLAUDE.md`, and `docs/deployment.md` all
described Factory as the active deployment path.

On BeeBaby the container cutover had already happened. `active.env` recorded
commit `04e94fae663cb1ea188fce323bc1f09a20290360` at digest
`sha256:42a31d6d25c93a130863a36f4dc77c3416216b6c839f04ef8696eea0d9232152`, the
container reported `healthy`, the retained `beebaby-admin.service` unit was
inactive, and Caddy proxied tailnet port `8001` to container port `8080`.

The checkout carries unrelated untracked `.vscode/` content, which this step
does not stage.

## Changes

- Remove `factory.project.yml` and `cicd-router.project.yml`. Git history keeps
  both contracts.
- Rename `scripts/cicd-router-gates.sh` to `scripts/ci-gates.sh` and point
  `.woodpecker/check.yaml` at the new path. The script content does not change.
- Add `.woodpecker/deploy.yaml`. It runs on a `main` push, depends on the
  publish workflow, and calls the restricted deployment command with the commit
  tag. The host resolves the tag to its digest, so the step needs no registry
  credential.
- Rewrite `docs/deployment.md` to describe the build, publish, deploy, rollback,
  data, secret, and verification path.
- Update the README and `CLAUDE.md` to name Woodpecker as the deployment path
  and `scripts/ci-gates.sh` as the gate.

The `deploy/remote-bootstrap.sh` script and the `deploy/beebaby-admin.service`
unit stay in the tree. The rollback window stays open until the container
deployment passes one BeeBaby reboot and seven days of normal operation.

The container still mounts only the host tmux socket. This step does not widen
that mount, change a Compose setting, or touch application code.

## Gate results

The gate passed as the operator on macOS:

```text
$ bash scripts/ci-gates.sh
Skipping tmux-backed integration tests: tmux is not installed on this gate host.
✓ built in 718ms
exit 0
```

The gate also passed as root in the image the check workflow pins, with the same
package list the workflow installs:

```text
$ docker run --rm -v "$stage":/src:ro -w /work \
    node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854 \
    bash -ec 'apt-get install --yes g++ make python3 rsync; cp -a /src/. /work/; corepack enable; bash scripts/ci-gates.sh'
Skipping tmux-backed integration tests: tmux is not installed on this gate host.
✓ built in 960ms
exit 0
```

## Known blocker outside this repository

The deploy workflow cannot succeed until BeeBaby corrects the project record for
this service. The record at
`/srv/beebaby/config/infra/deploy/projects/beebaby-admin.yaml` still sets
`retained_health_url: http://127.0.0.1:8001/api/health`. For any action other
than `cutover`, `beebaby-deploy` curls that URL before it pulls an image. The
cutover retired `beebaby-admin.service`, and Caddy now publishes port `8001`
through a docker-proxy bound only to `100.103.192.66`, so the loopback address
refuses the connection.

Running the deployment command by hand with the commit that is already active
reproduces the failure and changes nothing:

```text
$ sudo -n /usr/local/sbin/beebaby-deploy beebaby-admin breeze4/tmux-ws-server \
    04e94fae663cb1ea188fce323bc1f09a20290360 \
    ghcr.io/breeze4/tmux-ws-server:04e94fae663cb1ea188fce323bc1f09a20290360 deploy
curl: (7) Failed to connect to 127.0.0.1 port 8001 after 0 ms: Couldn't connect to server
exit=7
```

The service itself is healthy. `http://beebaby.tailc65f2f.ts.net:8001/api/health`
returns `200`.

The fix belongs to the infrastructure repository: drop `retained_health_url`
from the record, because the retained unit no longer exists. The `health_url`
line in the same record is already unreachable code, since `beebaby-deploy`
skips it whenever `target_health_url` is set. Other cut-over projects carry the
same stale retained URL, so this is not specific to BeeBaby Admin.

## Remaining risks

- The check workflow image has no `tmux`, so the tmux-backed integration tests
  never run in the pipeline. Only the type check and the build guard a commit.
  The runtime image installs `tmux`, so a tmux regression would first appear in
  the deployed container health check.
- The retired `deploy/` files describe a systemd unit that is now inactive.
  A rollback to the source path needs the unit started by hand.
- The container is the only writer to the host tmux socket. Any change that
  widens the mount would give the container more of the host than the service
  needs.
