# Orchestration prompt: return BeeBaby Admin to the host runtime

## Launch prompt

Copy the fenced block below and paste it as one message into a fresh Claude Code session started in `/Users/breeze/dev/beebaby-admin`. Paste only the block. The session reads the rest of this file from disk.

```
/goal Work on this doc: docs/prompts/2026-09-05-01-return-to-host-runtime.md. Read the whole file, then execute its "Orchestration plan" section exactly as written: every step, gate, recovery decision, verifier, commit, push, and progress-artifact update, in order. The work spans two repositories, /Users/breeze/dev/beebaby-admin and /Users/breeze/dev/beebaby-infra, and the host BeeBaby over SSH as beeadmin with passwordless sudo. The reboot of BeeBaby in Step 4 is pre-authorized; do not stop to ask. The run reaches a terminal state when every item in "Completion criteria" holds, or when a required gate remains failed after evidence-backed diagnosis and safe recovery and no authorized next action can make progress. A failed gate attempt alone is not terminal. Prove the terminal state in your final message: show the passing gate output, the health probe, and `git log --oneline` for both repositories, or show the complete failure, classification, recovery history, and reason that the run cannot continue. +500k
```

## Orchestration plan

### Project context

- Working directory: `/Users/breeze/dev/beebaby-admin` (the admin repository). Second repository: `/Users/breeze/dev/beebaby-infra` (the infra repository). Each is its own git repository on `main`. Commit to the right one.
- Host: `ssh beebaby` lands as `beeadmin` with passwordless `sudo -n`. One command per SSH call.
- Plan: `docs/plans/2026-09-05-01-return-to-host-runtime.md`. Read it in full before Step 1. Its "Host runtime contract" is the specification for Step 2.
- Spec: `docs/specs/2026-04-05-01-web-tmux-manager.md`, resolved decision "Host runtime, not a container".
- Deployment doc to rewrite in Step 3: `docs/deployment.md`.
- Admin build and test: `bash scripts/ci-gates.sh` (installs, runs tests, builds). No separate lint.
- Infra gate: `bash scripts/ci-gates.sh` in the infra repository. It renders `compose/edge.yaml` with Docker Compose, so Docker must be available on this machine.
- App URL for browser verification: `http://beebaby.tailc65f2f.ts.net:8001`. Health: `http://beebaby.tailc65f2f.ts.net:8001/api/health`.
- Screenshots: `screenshots/` in the admin repository, never staged.
- Handoff directory: `docs/handoff/` in the admin repository.
- Progress artifact data: `docs/handoff/progress.json` (schema: `~/.claude/skills/plans-to-prompt/progress/SCHEMA.md`), rendered to `docs/handoff/progress.html` with `sh ~/.claude/skills/plans-to-prompt/progress/build.sh docs/handoff/progress.json docs/handoff/progress.html`, published with the Artifact tool. Transient during the run, never in a step commit. At the terminal state, rename the pair to `docs/handoff/2026-09-05-01-return-to-host-runtime-run.{json,html}` and commit both alone.
- Interim access for you, the orchestrator: until Step 1 finishes, a host shell is available with `ssh beebaby` and `tmux -L host new -A -s admin`.

### Facts established before the run

Trust these unless the host contradicts them:

- The tmux server that owns `/tmp/tmux-1000/default` runs inside the container `beebaby-beebaby-admin-beebaby-admin-1`. Its host PID appears as `tmux -S /run/tmux/default new-session -A -s 0`.
- The retired user unit `~/.config/systemd/user/beebaby-admin.service` is loaded, disabled, and inactive. `~/dev/beebaby-admin` holds a built tree with `server/dist` and `node_modules`, and it is not a git repository.
- The host has Node 24 at `/usr/bin/node`, corepack at `/usr/bin/corepack`, tmux 3.4, and `claude` in `~/.local/bin`. Linger is on for beeadmin.
- Caddy publishes `100.103.192.66:8000-8013` from `compose/edge.yaml` and proxies `:8001` to `beebaby-admin:8080`. The edge stack runs as Compose project `beebaby-edge` from `/srv/beebaby/config/infra/compose/edge.yaml` with no env file. Its image is `caddy@sha256:d8c17a862962def15cde69863a3a463f25a2664942eafd7bdbf050e9c3116b83` and `TAILSCALE_IP` is `100.103.192.66`.
- The forced command is `sudo -n /usr/local/sbin/beebaby-deploy`, installed by `scripts/install-forced-command.sh` in the infra repository. Host copies of the infra files come from `scripts/sync-to-host.sh`.
- The GitHub repository `breeze4/tmux-ws-server` is public. Its `package.json` pins `pnpm@11.5.1` through `packageManager`.
- Neither repository shares tags with its remote. Do not push tags.

### Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under "Context sources" and include the relevant sections in the agent's "Context" field.
2. If a previous step completed, read its handoff file and use it to fill in what changed.
3. After each step's gates pass, make sure the commit and push rules in the **Commit policy** are applied before launching the next step.
4. Close the loop on checkboxes. Each agent marks its completed tasks `- [x]` in the plan file. You tick this prompt's own boxes below as steps land.
5. Maintain the progress artifact. You own the data, never the markup. Before Step 1, create `docs/handoff/progress.json` with every step `"queued"`, build, publish, and report the URL. Repeat the update, build, and publish loop at every step launch, gate attempt, recovery decision, commit, and terminal state. For a failed attempt, set the run and step to `"recovering"` and record `attempt`, `classification`, `disposition`, `recovery`, and the gate evidence. Set `"fail"` only after Gate failure recovery proves that no safe, authorized action remains.

### Gate failure recovery

A failed gate attempt is evidence, not a terminal verdict. You own the recovery decision.

For each failed attempt, follow this sequence:

1. Preserve the exact command, complete output, verifier findings, screenshots, or transcript.
2. Classify the failure as `implementation`, `acceptance`, `transient`, `environment`, `baseline`, `authority`, or `unknown`.
3. Choose one disposition: repair the implementation, correct the gate environment, retry to gain diagnostic evidence, ask one focused question, or end as unrecoverable.
4. Record the classification, disposition, recovery action, and evidence in the progress report.
5. After repair or environment correction, rerun the focused failing check and then the full required gate.

Do not repeat the same failed action unless relevant state changed or the retry produces new diagnostic evidence. For implementation or acceptance failures within scope, send the evidence to the implementer for repair. After a verifier failure, launch a new fresh-context verifier. The verifier that found the failure never repairs its own findings. For transient or environment failures, verify the command, working directory, SSH reachability, port state, and service readiness before retrying. Never commit a broken step.

Host-specific recovery rules:

- If Step 1 leaves port 8001 unclaimed and the unit fails to start, read `journalctl --user -u beebaby-admin -n 50` before any retry.
- If Step 4's deployment fails, the host runtime rolls back to `previous.env` on its own. If the deployment command itself is broken, stop the unit, fix the command in the infra repository, reinstall it, and rerun the deployment.
- If BeeBaby does not answer SSH within 5 minutes of the reboot, classify as `environment`, keep polling for a further 10 minutes, and only then end the run with the evidence.

### Commit policy (applies to every step)

This overrides the default "only commit when explicitly asked" behavior. Commits are required.

- One commit per step per repository that changed, made only after the step's gates pass.
- Message format: `step-N: return-to-host-runtime — <one-line summary>`.
- Stage only files inside the step's `Owns` set, plus the step's handoff file and the plan file with its newly checked `- [x]` boxes. Never `git add -A`.
- Commit messages carry no co-author trailer, no generated-with footer, and no mention of AI or of the assistant.
- Push rules: push the infra repository after each of its step commits. Do not push the admin repository before Step 4. A push to admin `main` runs Woodpecker, and until Step 3 lands that pipeline builds and deploys a container. Step 4 pushes admin `main` as one of its tasks.
- On gate failure, do not commit the broken step. After the recovered gate passes, create the normal step commit.
- Run report: at the terminal state the finalized `docs/handoff/2026-09-05-01-return-to-host-runtime-run.{json,html}` gets its own docs-only commit in the admin repository: `run: return-to-host-runtime — report (pass|fail)`. Then tag that commit `run/2026-09-05-01-return-to-host-runtime`. Do not push the tag.

### Execution plan

Every step is prescriptive: the agent executes the plan phase's checklist in order. Each step gets one implementing agent and one fresh-context verifier.

#### Step 1: restore service by hand

**Plan**: phase 1 of `docs/plans/2026-09-05-01-return-to-host-runtime.md`

**Agent briefing**:
- **Goal**: The admin page answers on port 8001 from the beeadmin user unit, the container is gone, Caddy no longer publishes 8001, and a session opened from the page runs a host shell.
- **Context sources**: the plan's Problem and Decisions sections, `caddy/Caddyfile` lines 50-64 and `compose/edge.yaml` ports block in the infra repository, `deploy/beebaby-admin.service` in the admin repository.
- **Read first**: the plan.
- **Context**: paste the facts section of this prompt and the two infra file excerpts.
- **Owns**: in the infra repository, `caddy/Caddyfile` and `compose/edge.yaml`. On the host, the admin container stack, the edge stack, the socket file `/tmp/tmux-1000/default`, and the user unit `beebaby-admin.service`.
- **Must not touch**: `deploy/beebaby-deploy`, `deploy/projects/*`, `config/ports.yaml`, anything in the admin repository except the plan file and the handoff.
- **Order on the host**: stop the container stack with `sudo -n docker compose --project-name beebaby-beebaby-admin down`; confirm with `ps -eo pid,cmd | grep '[t]mux -S /run/tmux'` that the container tmux server is gone; remove `/tmp/tmux-1000/default` if it remains; edit the two infra files; run the infra gate; run `scripts/sync-to-host.sh`; apply the edge stack with `sudo -n env TAILSCALE_IP=100.103.192.66 CADDY_IMAGE=caddy@sha256:d8c17a862962def15cde69863a3a463f25a2664942eafd7bdbf050e9c3116b83 docker compose --project-name beebaby-edge -f /srv/beebaby/config/infra/compose/edge.yaml up -d caddy`; confirm with `ss -ltn` that nothing listens on 8001; run `systemctl --user enable --now beebaby-admin`; probe the health URL.
- **Do not**: change `config/ports.yaml` or the project record. That is Step 2.
- **Done when**: the health URL returns `200`, `ss -ltnp` on the host shows node on port 8001 and no Caddy listener there, `sudo -n docker ps` shows no admin container, and `tmux ls` over SSH lists a host-owned server or no server.
- **Check off**: mark each completed phase 1 task `- [x]` in the plan file.
- **Handoff**: write `docs/handoff/step-1-restore-service.md` with the exact commands run, the Caddy diff, and the health probe output.

**Gate**: `bash scripts/ci-gates.sh` in the infra repository, then `curl -sS -o /dev/null -w '%{http_code}\n' http://beebaby.tailc65f2f.ts.net:8001/api/health` returns `200`.

**Gate failure**: return the complete output to the orchestrator and stop this attempt.

**Verify gate** (fresh context, before the commit): spawn a verifier whose prompt contains only the plan's phase 1 checklist, the "Done when" above, and the infra diff. Instruct it to refute completion and to exercise behavior over SSH. It returns one entry per checklist item: text, PASS or FAIL, one line on how it was exercised.

**Browser gate** (run by the verifier): with the `agent-browser` skill, open the app URL, create a session named `verify-step-1`, type `hostname; which claude; id -un` followed by Enter, and assert that the terminal shows `beebaby`, a path ending in `/claude`, and `beeadmin`. Save screenshots to `screenshots/`. Kill the session afterward with `tmux kill-session -t verify-step-1` over SSH.

**Commit**: in the infra repository, `git add caddy/Caddyfile compose/edge.yaml && git commit -m "step-1: return-to-host-runtime — release port 8001 from the edge"`, then `git push`. In the admin repository, `git add docs/plans/2026-09-05-01-return-to-host-runtime.md docs/handoff/step-1-restore-service.md && git commit -m "step-1: return-to-host-runtime — restore the host unit by hand"`. No push of the admin repository.

#### Step 2: host runtime in the deployment command

**Plan**: phase 2 of the plan, specified by its "Host runtime contract" section.

**Agent briefing**:
- **Goal**: `deploy/beebaby-deploy` deploys and rolls back a `runtime: host` project, the infra gate proves it in validation mode, the admin project record is a host record, and the host runs the new command.
- **Context sources**: `docs/handoff/step-1-restore-service.md`, the whole of `deploy/beebaby-deploy`, `scripts/ci-gates.sh`, `deploy/projects/beebaby-admin.yaml`, `deploy/projects/README.md`, `config/ports.yaml`, and `docs/operations.md` in the infra repository.
- **Read first**: the plan's "Host runtime contract" and phase 2.
- **Context**: paste the contract verbatim and the existing `source_unit_value`, `restart_source_unit`, `probe_target_health`, and cutover test blocks.
- **Owns**: in the infra repository, `deploy/beebaby-deploy`, `scripts/ci-gates.sh`, `deploy/projects/beebaby-admin.yaml`, `deploy/projects/README.md`, `config/ports.yaml`, `docs/operations.md`. On the host, `/usr/local/sbin/beebaby-deploy` and `/srv/beebaby/config/infra`.
- **Must not touch**: `caddy/Caddyfile`, `compose/edge.yaml`, any other project record, anything in the admin repository except the plan file and the handoff.
- **MUST follow the pattern in**: the existing `cutover` branch of `deploy/beebaby-deploy` for reading record keys, faking `runuser` in validation mode, and rejecting with `reject`. Match its style: one `reject` per failed check, named reasons.
- **Contract details to honor**: the marker `source` in the image position; `deploy` and `rollback` verbs unchanged; reject a host record that carries `compose_path`, `image`, or `service`; reject a container record that carries a host key; reject a `host_checkout` that exists without `.git`; skip `load_deployment_environment` for host records; `active.env`, `previous.env`, and `history.log` keep their formats with `source` as the digest; failure rolls back to `previous.env` and rejects; validation mode covers the host path with a temporary checkout directory, a fake `runuser`, and a fake `git`.
- **Gate updates**: the record-count gate stays at 15, the `compose_path` count gate drops to 13 and skips `runtime: host` records, and four new validation-mode checks cover the host record accepted, the host record with `compose_path` rejected, the container record with `host_unit` rejected, and the fake `git` receiving the commit.
- **Do not**: change the admin repository's unit file, workflows, or docs. That is Step 3. Do not run the host deployment for the admin project. That is Step 4.
- **Done when**: the infra gate passes locally, `scripts/sync-to-host.sh` and `scripts/install-forced-command.sh` report the synchronized commit and a matching SHA-256, and `ssh beebaby 'sudo -n /usr/local/sbin/beebaby-deploy'` with no arguments rejects with the usage line.
- **Check off**: mark each completed phase 2 task `- [x]` in the plan file.
- **Handoff**: write `docs/handoff/step-2-host-runtime.md` with the final record keys, the exact command line the Woodpecker step must send, and the install output.

**Gate**: `bash scripts/ci-gates.sh` in the infra repository.

**Gate failure**: return the complete output to the orchestrator and stop this attempt.

**Verify gate** (fresh context, before the commit): spawn a verifier with only the contract, phase 2's checklist, the "Done when" above, and the infra diff. Instruct it to refute completion, to run the infra gate itself, and to try one negative case the gate does not cover, such as a `host_checkout` outside the home directory. One entry per checklist item.

**Browser gate**: skipped. No browser surface.

**Commit**: in the infra repository, `git add deploy/beebaby-deploy scripts/ci-gates.sh deploy/projects/beebaby-admin.yaml deploy/projects/README.md config/ports.yaml docs/operations.md && git commit -m "step-2: return-to-host-runtime — add the host runtime to the deployment command"`, then `git push`. In the admin repository, commit the plan file and the handoff with `step-2: return-to-host-runtime — record the host runtime contract`.

#### Step 3: host bits in the admin repository

**Plan**: phase 3 of the plan.

**Agent briefing**:
- **Goal**: the admin repository describes only the host runtime: a `HOST` bind address, a complete unit file, one deploy workflow that sends the `source` marker, rewritten deployment docs, and no container files.
- **Context sources**: `docs/handoff/step-2-host-runtime.md`, `server/src/index.ts`, `deploy/beebaby-admin.service`, `.woodpecker/*.yaml`, `docs/deployment.md`, `CLAUDE.md`.
- **Read first**: phase 3 of the plan.
- **Context**: paste the exact command line from the Step 2 handoff and the current `deploy.yaml`.
- **Owns**: `server/src/index.ts`, `deploy/beebaby-admin.service`, `deploy/remote-bootstrap.sh` (delete), `Dockerfile` (delete), `compose.beebaby.yaml` (delete), `.woodpecker/publish.yaml` (delete), `.woodpecker/deploy.yaml`, `docs/deployment.md`, `CLAUDE.md`.
- **Must not touch**: `server/src/terminal.ts`, `server/src/sessions.ts`, `client/`, `scripts/ci-gates.sh`, `.woodpecker/check.yaml`, anything in the infra repository.
- **Requirements**: `HOST` defaults to `0.0.0.0` and the unit sets `HOST=100.103.192.66`, `PORT=8001`, `NODE_ENV=production`, `After=network-online.target`, and `Wants=network-online.target`; `deploy.yaml` gains `depends_on: [check]` and sends `deploy beebaby-admin breeze4/tmux-ws-server ${CI_COMMIT_SHA} source deploy`; `docs/deployment.md` follows the tech-writing style and covers what a push does, the manual deploy command, rollback, the reboot behavior, and verification; the `CLAUDE.md` deployment section says the service runs as a host user unit and names the manual command.
- **Do not**: push the admin repository. That is Step 4. Do not touch the host.
- **Done when**: `bash scripts/ci-gates.sh` passes, the deleted files are gone from the tree, `grep -rn "container\|Docker\|Caddy" docs/deployment.md CLAUDE.md` shows only the sentence that says the service runs outside containers, and a local run with `HOST=127.0.0.1` proves the bind address is honored.
- **Check off**: mark each completed phase 3 task `- [x]` in the plan file.
- **Handoff**: write `docs/handoff/step-3-admin-host-bits.md` with the diffstat and the final unit file.

**Gate**: `bash scripts/ci-gates.sh` in the admin repository.

**Gate failure**: return the complete output to the orchestrator and stop this attempt.

**Verify gate** (fresh context, before the commit): spawn a verifier with only phase 3's checklist, the "Done when" above, and `git diff` plus the list of deleted files. Instruct it to refute completion, to start the server locally with `HOST=127.0.0.1 PORT=18001 node server/dist/index.js` and probe `/api/health`, and to run the tech-writing self-check on `docs/deployment.md`.

**Browser gate**: skipped. The change reaches the host only in Step 4.

**Commit**: `git add server/src/index.ts deploy/beebaby-admin.service .woodpecker/deploy.yaml docs/deployment.md CLAUDE.md docs/plans/2026-09-05-01-return-to-host-runtime.md docs/handoff/step-3-admin-host-bits.md && git rm deploy/remote-bootstrap.sh Dockerfile compose.beebaby.yaml .woodpecker/publish.yaml && git commit -m "step-3: return-to-host-runtime — describe only the host runtime"`. No push.

#### Step 4: cut over through the deployment command

**Plan**: phase 4 of the plan.

**Agent briefing**:
- **Goal**: Woodpecker deploys the admin through the host runtime, the manual command deploys the same commit, and the service survives a reboot without a manual step.
- **Context sources**: `docs/handoff/step-2-host-runtime.md`, `docs/handoff/step-3-admin-host-bits.md`, `docs/deployment.md`.
- **Read first**: phase 4 of the plan.
- **Context**: paste the manual deploy command and the rollback command from `docs/deployment.md`.
- **Owns**: on the host, `~/dev/beebaby-admin`, the user unit, `/srv/beebaby/deployments/beebaby-admin`. In the admin repository, nothing but the plan file and the handoff.
- **Must not touch**: any source file in either repository. Do not delete the stale tree copy or the secrets file. That is Step 5.
- **Order**: move the stale tree with `mv ~/dev/beebaby-admin ~/dev/beebaby-admin.stale`; `git push` the admin repository; watch the Woodpecker pipeline for the pushed commit until the deploy workflow finishes; read `/srv/beebaby/deployments/beebaby-admin/active.env` and confirm `COMMIT` equals the pushed SHA; run `ssh beebaby "sudo -n /usr/local/sbin/beebaby-deploy beebaby-admin breeze4/tmux-ws-server SHA source deploy"` and confirm it prints `deployed`; confirm with `sudo -n docker ps --format '{{.Names}} {{.Status}}'` that every container is healthy and that `/srv/beebaby/deploy.lock` is not held; run `sudo -n reboot`; poll `ssh -o ConnectTimeout=5 beebaby true` until it succeeds; confirm `systemctl --user is-active beebaby-admin` prints `active`, the health URL returns `200`, and every container that was healthy before the reboot is healthy again.
- **Reboot authorization**: the user pre-authorized the reboot. Do not ask.
- **Done when**: `active.env` holds the pushed commit, the manual command reported `deployed`, and after the reboot the unit is active, the health probe returns `200`, and every container is back.
- **Check off**: mark each completed phase 4 task `- [x]` in the plan file.
- **Handoff**: write `docs/handoff/step-4-cutover.md` with the pipeline URL or run number, the manual command output, `active.env`, the reboot timestamps, and the post-reboot container list.

**Gate**: the health probe returns `200` after the reboot, and `ssh beebaby 'sudo -n cat /srv/beebaby/deployments/beebaby-admin/active.env'` shows the pushed commit and `DIGEST=source`.

**Gate failure**: return the complete output to the orchestrator and stop this attempt. Apply the host-specific recovery rules.

**Verify gate** (fresh context, before the commit): spawn a verifier with only phase 4's checklist, the "Done when" above, and the handoff's raw outputs. Instruct it to refute completion, to confirm over SSH that the tmux server PID exists in the host PID namespace, that `tmux ls` over SSH and the sessions list on the page agree, and that `journalctl --user -u beebaby-admin -b` shows the unit started during the current boot.

**Browser gate** (run by the verifier): with the `agent-browser` skill, open the app URL, create a session named `verify-step-4`, type `hostname; which claude; git -C ~/dev/beebaby-admin rev-parse HEAD` followed by Enter, and assert `beebaby`, a path ending in `/claude`, and the pushed SHA. Save screenshots to `screenshots/`. Kill the session afterward over SSH.

**Commit**: in the admin repository, commit the plan file and the handoff with `step-4: return-to-host-runtime — cut over to the host runtime`, then `git push`.

#### Step 5: cleanup after the reboot test

**Plan**: phase 5 of the plan.

**Agent briefing**:
- **Goal**: no container-era files remain on the host, and the lessons from the run are recorded.
- **Context sources**: `docs/handoff/step-4-cutover.md`, `docs/lessons.md`, the `ingest-lessons` skill's entry format.
- **Read first**: phase 5 of the plan.
- **Owns**: on the host, `/srv/beebaby/secrets/deploy-env/beebaby-admin.env`, `/srv/beebaby/stacks/beebaby-admin`, `~/dev/beebaby-admin.stale`, and the container lines in `/srv/beebaby/deployments/beebaby-admin/history.log`. In the admin repository, `docs/lessons.md`.
- **Must not touch**: any other secrets file, any other stack directory, the active checkout, any source file.
- **Before each deletion**: list the target with `ls -la` and record it in the handoff.
- **Lessons to capture at minimum**: a container cannot serve a host-access tool; a shared socket directory lets a container client start the server; a failsafe must not depend on the platform it is meant to repair.
- **Done when**: the three paths are gone, `history.log` holds only `source` entries, and `docs/lessons.md` has the new entries in the skill's format.
- **Check off**: mark each completed phase 5 task `- [x]` in the plan file.
- **Handoff**: write `docs/handoff/step-5-cleanup.md` with the listings taken before deletion.

**Gate**: `ssh beebaby 'sudo -n ls /srv/beebaby/secrets/deploy-env/beebaby-admin.env /srv/beebaby/stacks/beebaby-admin ~beeadmin/dev/beebaby-admin.stale'` reports each of the three as missing, and the health probe still returns `200`.

**Gate failure**: return the complete output to the orchestrator and stop this attempt.

**Verify gate** (fresh context, before the commit): spawn a verifier with only phase 5's checklist, the "Done when" above, and the diff. Instruct it to refute completion and to confirm over SSH that the unit is still active and that the active checkout is untouched.

**Browser gate**: skipped. No user-facing change.

**Commit**: in the admin repository, `git add docs/lessons.md docs/plans/2026-09-05-01-return-to-host-runtime.md docs/handoff/step-5-cleanup.md && git commit -m "step-5: return-to-host-runtime — remove the container remains"`, then `git push`.

### Interface gates

- [ ] After Step 2: the Step 2 handoff names the exact Woodpecker command line, and Step 3's `deploy.yaml` sends that line character for character.

### HITL checkpoints

None. The reboot in Step 4 is pre-authorized by the user on September 5, 2026.

### UI and browser testing

Target: `http://beebaby.tailc65f2f.ts.net:8001`. The verifier drives it with the `agent-browser` skill.

- [ ] Step 1: create a session, run `hostname; which claude; id -un`, assert `beebaby`, a `/claude` path, and `beeadmin`; screenshots to `screenshots/`.
- [ ] Step 4: create a session, run `hostname; which claude; git -C ~/dev/beebaby-admin rev-parse HEAD`, assert `beebaby`, a `/claude` path, and the pushed SHA; screenshots to `screenshots/`.
- Skipped (no browser surface): Step 2 (deployment command), Step 3 (repository only, reaches the host in Step 4), Step 5 (host cleanup).

### Completion criteria

- Every item in the plan's "Done when" section holds, with evidence in the handoffs.
- Every task in the plan's five phases is checked `- [x]`.
- `bash scripts/ci-gates.sh` passes in both repositories.
- One commit per step exists in the admin repository, and one per step that changed the infra repository, with no AI or co-author mention.
- Both repositories are pushed, and the Woodpecker deploy for the admin repository succeeded with the `source` marker.
- The two browser gates passed with screenshots saved.
- Every verify gate ran in a fresh-context subagent, never the implementing agent.
- The progress artifact was published before Step 1, republished at every state change, and shows the terminal state with evidence on every gate.
- The run report `docs/handoff/2026-09-05-01-return-to-host-runtime-run.{json,html}` is committed alone, tagged `run/2026-09-05-01-return-to-host-runtime`, and no `progress.json` or `progress.html` remains untracked.

### Unrecoverable failure criteria

The failure terminal requires all of the following evidence:

- A required gate remains failed after evidence-backed diagnosis and safe recovery.
- The report preserves the complete failing output, classification, disposition, and recovery actions.
- No safe and authorized next action can make progress.
- No broken step was committed.
- The host is left in a serving state if at all possible: the unit active on port 8001, or the interim `tmux -L host` path documented in the report.
- The finalized report has its own docs-only `run: return-to-host-runtime — report (fail)` commit.
