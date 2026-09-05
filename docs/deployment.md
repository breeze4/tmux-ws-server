# Deploy BeeBaby Admin

BeeBaby Admin runs on the BeeBaby host as the `beeadmin` user. The
`beebaby-admin.service` user unit starts `server/dist/index.js` and binds
`100.103.192.66:8001`. The service runs outside containers.

## Deploy a pushed commit

When you push a commit to `main`, Woodpecker runs these workflows:

1. `.woodpecker/check.yaml` runs `bash scripts/ci-gates.sh`.
2. `.woodpecker/deploy.yaml` connects to BeeBaby and sends the restricted
   deployment command with the commit SHA and the `source` marker.

A pull request runs only the check workflow. Deployment credentials are not
available to pull request pipelines.

Before you push, run the local gate:

```sh
bash scripts/ci-gates.sh
```

The deployment command fetches the commit into
`/home/beeadmin/dev/beebaby-admin`, installs dependencies, builds the app,
installs the user unit, restarts it, checks the health endpoint, and records the
active commit. If the health check fails, the command restores the previous
recorded commit.

## Deploy a commit manually

To deploy a specific commit, connect with the deployment account and run this
command:

```sh
ssh beeadmin@100.103.192.66 \
  "deploy beebaby-admin breeze4/tmux-ws-server COMMIT_SHA source deploy"
```

Replace `COMMIT_SHA` with the full Git commit SHA. The restricted command accepts
only the allowlisted project and repository.

## Roll back

To restore the previous recorded commit, run this command:

```sh
ssh beeadmin@100.103.192.66 \
  "deploy beebaby-admin breeze4/tmux-ws-server COMMIT_SHA source rollback"
```

Replace `COMMIT_SHA` with the full Git commit SHA. The rollback action reads the
previous deployment record and restarts the service with that commit.

## Verify a deployment

After a deployment or rollback, verify the recorded commit and health endpoint:

```sh
ssh beeadmin@100.103.192.66 \
  'cat /srv/beebaby/deployments/beebaby-admin/active.env'
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://beebaby.tailc65f2f.ts.net:8001/api/health
```

The `COMMIT_SHA` value in `active.env` matches the deployed commit. The health
endpoint returns HTTP `200 OK`.

## Restart after a reboot

The `beebaby-admin.service` user unit has `Restart=always` and is enabled in the
`beeadmin` user manager. After BeeBaby reboots, systemd starts the unit after
`network-online.target` is active. The unit sets `HOST=100.103.192.66`,
`PORT=8001`, and `NODE_ENV=production`.
