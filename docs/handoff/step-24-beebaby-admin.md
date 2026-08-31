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

## Pipeline and deployment evidence

Commit `ccce89c0aa0a92c086204a2eeb5ba18b041050d1` ran as Woodpecker pipeline `3`
and reached `success`. All three workflow steps passed:

```text
303|beebaby-admin-gates|success
305|deploy|success
307|publish-image|success
```

The host recorded the deployment in
`/srv/beebaby/deployments/beebaby-admin/active.env`:

```text
IMAGE_DIGEST=ghcr.io/breeze4/tmux-ws-server@sha256:fce20354386b3def6fbd8d9fb549c1354d93f358cb2cbb5c7a5998b69a48880f
COMMIT_SHA=ccce89c0aa0a92c086204a2eeb5ba18b041050d1
```

The running container reports `healthy`, carries the matching revision label,
and holds one bind mount:

```text
/tmp/tmux-1000/default -> /run/tmux/default (rw=true)
```

The live check returned `200`:

```text
$ curl -sS http://beebaby.tailc65f2f.ts.net:8001/api/health
{"status":"ok"}
```

## Host defect found and fixed during this step

The first deployment attempt failed before it pulled an image, because the
project record at
`/srv/beebaby/config/infra/deploy/projects/beebaby-admin.yaml` sets
`retained_health_url: http://127.0.0.1:8001/api/health` and `beebaby-deploy`
curled that URL unconditionally for any action other than `cutover`. The cutover
retired `beebaby-admin.service`, and Caddy publishes port `8001` through a
docker-proxy bound only to `100.103.192.66`, so the loopback address refuses the
connection:

```text
$ sudo -n /usr/local/sbin/beebaby-deploy beebaby-admin breeze4/tmux-ws-server \
    04e94fae663cb1ea188fce323bc1f09a20290360 \
    ghcr.io/breeze4/tmux-ws-server:04e94fae663cb1ea188fce323bc1f09a20290360 deploy
curl: (7) Failed to connect to 127.0.0.1 port 8001 after 0 ms: Couldn't connect to server
exit=7
```

BeeBaby resolved this outside this repository. `/usr/local/sbin/beebaby-deploy`
now guards the retained probe with a `retained_source_is_active` test, so it
skips the probe once the retained unit is inactive. The pipeline deployment ran
against the corrected script and passed.

## Remaining risks

- The record still carries `retained_health_url` and `health_url` for a service
  that no longer answers on loopback. Neither line runs today: the retained
  probe is guarded, and `beebaby-deploy` skips `health_url` whenever
  `target_health_url` is set. Both are stale and worth removing.
- The check workflow image has no `tmux`, so the tmux-backed integration tests
  never run in the pipeline. Only the type check and the build guard a commit.
  The runtime image installs `tmux`, so a tmux regression would first appear in
  the deployed container health check.
- The retired `deploy/` files describe a systemd unit that is now inactive.
  A rollback to the source path needs the unit started by hand.
- The container is the only writer to the host tmux socket. Any change that
  widens the mount would give the container more of the host than the service
  needs.
