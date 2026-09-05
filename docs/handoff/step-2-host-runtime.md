# Step 2 handoff: host deployment runtime

## Result

The restricted deployment command supports `runtime: host` project records.
The Admin project record selects the host runtime and uses the `source` marker.
The command checks out, builds, installs, restarts, probes, records, and rolls
back host deployments as the `beeadmin` user where required.

## Woodpecker command

The deploy workflow must send this command line without changes:

```text
deploy beebaby-admin breeze4/tmux-ws-server ${CI_COMMIT_SHA} source deploy
```

## Validation and installation

The infrastructure gate ended with `infrastructure gates passed`. The gate
accepts a host record, rejects mixed host and container fields, checks the fake
Git commit, and checks both host-unit failure paths.

The following installation commands synchronized the worktree and installed
the forced command:

```sh
bash scripts/sync-to-host.sh
bash scripts/install-forced-command.sh
```

The local and installed command SHA-256 values matched:

```text
6135a65e39bfcbbdf6f5d1bf3141049ecd95483690841d8e3ce7a5ede055f4c4
```

The no-argument command rejected input with exit `64` and the expected usage
message:

```text
beebaby-deploy: expected PROJECT REPOSITORY COMMIT DIGEST ACTION [VARIABLE=DIGEST ...]
```

## Scope boundary

This phase installs the host-runtime command and record. Step 4 moves the
stale checkout, deploys the Admin commit, and creates the host `active.env`
record.
