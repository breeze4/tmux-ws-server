# Deploy BeeBaby Admin

Woodpecker on BeeBaby builds, publishes, and deploys this repository. Factory no
longer participates.

## What happens on a push to main

Woodpecker runs three workflows for each commit on `main`:

1. `.woodpecker/check.yaml` runs `scripts/ci-gates.sh` in a pinned Node
   container.
2. `.woodpecker/publish.yaml` builds the runtime image and pushes it to
   `ghcr.io/breeze4/tmux-ws-server` with the commit SHA as its tag.
3. `.woodpecker/deploy.yaml` calls the restricted deployment command on BeeBaby
   with that tag. The host resolves the tag to its immutable digest with its own
   registry credentials, so the registry token stays limited to the build
   plugin.

A pull request runs only the check workflow. Deployment secrets stay out of pull
request pipelines.

## What the deployment command does

The `deploy` forced command reaches `/usr/local/sbin/beebaby-deploy`, which
accepts only an allowlisted project, repository, commit, image, and action. For
each deployment it takes the host lock, confirms that the image belongs to the
expected GHCR repository, confirms that the image revision label equals the
pipeline commit, renders the Compose stack with the digest, waits for container
health, probes the service through the Caddy edge, and records the digest. A
failed health or route check restores the previous digest.

## Roll back

To return to the previous digest, read the last two entries in
`/srv/beebaby/deployments/beebaby-admin/history.log` on BeeBaby and run the
deployment command with the digest you want:

```sh
ssh beeadmin@beebaby
sudo /usr/local/sbin/beebaby-deploy beebaby-admin breeze4/tmux-ws-server \
  COMMIT_SHA ghcr.io/breeze4/tmux-ws-server@sha256:DIGEST deploy
```

The active digest and commit stay in
`/srv/beebaby/deployments/beebaby-admin/active.env`.

## Data and secrets

The service holds no persistent data and reads no secret file. It needs one host
value, the tmux socket path, which BeeBaby keeps in the protected deployment
environment file `/srv/beebaby/secrets/deploy-env/beebaby-admin.env` as
`TMUX_SOCKET=/tmp/tmux-1000/default`. A rollback needs no data action.

The container binds only that socket, to `/run/tmux/default`. It mounts no host
directory, no SSH directory, and no Docker socket. Do not widen the mount.

The runtime uses UID and GID `1000` to match the socket owner, a read-only root
file system, a temporary `/tmp` file system, and no Linux capabilities. Caddy
owns the tailnet listener on port `8001` and proxies to container port `8080`,
so the Compose file publishes no host port.

## Build and run the image locally

To build the image the way the publish workflow builds it:

```sh
pnpm install --frozen-lockfile
docker build --build-arg VCS_REF=COMMIT_SHA -t beebaby-admin:COMMIT_SHA .
```

Replace `COMMIT_SHA` with the Git commit SHA. The Dockerfile pins the Node
`22.17.1` image and installs `tmux` in the runtime stage.

To render the deployed Compose stack, set both variables first:

```sh
IMAGE_DIGEST=ghcr.io/breeze4/tmux-ws-server@sha256:DIGEST \
TMUX_SOCKET=/tmp/tmux-1000/default \
docker compose -f compose.beebaby.yaml config
```

## Verify a deployment

After a deployment, read the recorded commit and check the live health endpoint:

```sh
ssh beebaby 'sudo -n cat /srv/beebaby/deployments/beebaby-admin/active.env'
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://beebaby.tailc65f2f.ts.net:8001/api/health
```

`COMMIT_SHA` must equal the deployed commit, and the health endpoint must return
`200`.

## Retired source deployment

The `deploy/remote-bootstrap.sh` script and the
`deploy/beebaby-admin.service` unit describe the retired source-copy deployment.
They stay in the tree until the container deployment passes one BeeBaby reboot
and seven days of normal operation, because the documented rollback path still
needs them. Remove them after that window closes.
