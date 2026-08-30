# Container bridge deployment

## Active deployment path

Factory deploys the source service during this bridge. The
`factory.project.yml` file and the `cicd-router.project.yml` file remain active
recovery artifacts. Factory runs `scripts/cicd-router-gates.sh`, starts
`beebaby-admin.service`, and checks `http://beebaby:8001/api/health`.

Woodpecker runs `.woodpecker/check.yaml` for pushes and pull requests. A push
to `main` runs `.woodpecker/publish.yaml` and publishes
`ghcr.io/breeze4/tmux-ws-server` with the exact commit SHA as its tag. The
workflow does not deploy the image during this bridge.

## Build the image

To build the image, use the locked pnpm workspace:

```bash
pnpm install --frozen-lockfile
pnpm run build
docker build \
    --build-arg VCS_REF=COMMIT_SHA \
    --build-arg BUILD_DATE=TIMESTAMP \
    -t beebaby-admin:COMMIT_SHA .
```

Replace `COMMIT_SHA` with the Git commit SHA. Replace `TIMESTAMP` with an ISO
8601 UTC timestamp.

The Dockerfile uses the pinned Node `22.17.1` image. The final image runs as
UID and GID `1000`, listens on port `8080`, and exposes `/api/health` through
its Docker health check.

## Run the container

To run the container, set the required values before rendering the Compose
file:

```bash
IMAGE_DIGEST=ghcr.io/breeze4/tmux-ws-server@sha256:IMAGE_DIGEST \
TMUX_SOCKET=/tmp/tmux-1000/default \
docker compose -f compose.beebaby.yaml config
```

Replace `IMAGE_DIGEST` with the published immutable image digest. The Compose
service binds only `TMUX_SOCKET` to `/run/tmux/default`. It does not mount a
host directory, an SSH directory, or the Docker socket.

The service uses a read-only root file system, drops Linux capabilities, and
uses a temporary `/tmp` file system. Caddy owns the private listener in the
final cutover, so the Compose file does not publish a host port.

## Roll back the bridge

To roll back before the Factory shutdown, stop the container and leave
`beebaby-admin.service` as the only writer to the tmux socket. Factory remains
the source-deployment and rollback path until the cleanup commit removes it.
