# Production Deployment

## Parent spec

`docs/specs/2026-04-05-01-web-tmux-manager.md`

## What to build

Production build configuration and deployment to beebaby. Vite builds the React app to static assets served by Express. Express route ordering: API routes → static files → SPA catch-all. Systemd user service matching the existing `hiking-food.service` pattern on beebaby. The app runs on port 8001, accessible via Tailscale.

## Type

AFK

## Blocked by

- Blocked by `2026-04-05-01-terminal-connection.md`
- Blocked by `2026-04-05-02-session-api-sidebar.md`
- Blocked by `2026-04-05-03-multi-pane-layout.md`

## User stories addressed

- User story 14 (accessible from any device on Tailscale network)
- User story 15 (systemd service, starts on boot, restarts on crash)

## Acceptance criteria

- [ ] `npm run build` in the root builds the Vite app to `server/public/`
- [ ] `npm start` in the root starts Express in production mode, serving static assets + API + WebSocket on port 8001
- [ ] Express route order: API routes first, `express.static(publicDir)` second, SPA catch-all `/{*splat}` last
- [ ] SPA catch-all returns `index.html` for all non-API, non-asset GET requests (client-side routing works)
- [ ] Systemd user service file: `beebaby-admin.service` — Type=simple, auto-restart, starts on boot via `default.target`
- [ ] Service deployed to beebaby: `~/.config/systemd/user/beebaby-admin.service`
- [ ] `systemctl --user enable beebaby-admin` and `systemctl --user start beebaby-admin` work
- [ ] App accessible at `beebaby:8001` from another device on the Tailscale network
- [ ] Service restarts automatically if the process crashes

## Owns

- `client/vite.config.ts` — add `build.outDir` pointing to `../server/public`, `build.emptyOutDir: true`
- `server/src/index.ts` — add production static serving: `express.static()` + SPA catch-all (after API routes, before listen)
- `server/package.json` — add `build` script for TypeScript compilation
- `server/tsconfig.json` — ensure `outDir` is set for compiled output
- `package.json` (root) — add `build` and `start` scripts
- `deploy/deploy.sh` — rsync + remote build + service restart (modeled on hiking-food)
- `deploy/setup.sh` — one-time remote setup (node_modules, lingering)
- `deploy/beebaby-admin.service` — systemd unit file

## Must not touch

- `server/src/terminal.ts` — owned by plan `2026-04-05-01`
- `server/src/sessions.ts` — owned by plan `2026-04-05-02`
- `client/src/components/*` — owned by plans `2026-04-05-01`, `02`, `03`

## Defines interfaces

None.

## Pattern exemplar

- **MUST follow the pattern in**: `/home/breeze/dev/hiking-food/deploy/deploy.sh` — same rsync-based deploy pattern: rsync with exclusions, remote npm install + build, service file copy, daemon-reload, restart, status check
- **MUST follow the pattern in**: `/home/breeze/dev/hiking-food/deploy/setup.sh` — same one-time setup pattern: create app dir, enable lingering
- **MUST follow the pattern in**: `/home/breeze/dev/hiking-food/deploy/hiking-food.service` — same systemd structure: Type=simple, WorkingDirectory=%h/..., Restart=always, RestartSec=5, WantedBy=default.target

## Tasks

- [x] Update `client/vite.config.ts` — set `build.outDir: '../server/public'` and `build.emptyOutDir: true`
- [x] Update `server/src/index.ts` — add conditional production static serving: if `server/public/` exists, mount `express.static(publicDir)` after API routes, add SPA catch-all `app.get('/{*splat}', ...)` sending `index.html` as the last route
- [x] Add server build step: TypeScript compilation for the server (add `"build"` script to `server/package.json`, ensure `tsconfig.json` has `outDir`)
- [x] Add root `package.json` scripts: `"build": "npm run build -w server && npm run build -w client"`, `"start": "node server/dist/index.js"`
- [x] Create `deploy/beebaby-admin.service` modeled on hiking-food.service:
  - Type=simple
  - WorkingDirectory=%h/dev/beebaby-admin
  - ExecStart=/usr/bin/node server/dist/index.js
  - Restart=always, RestartSec=5
  - Environment=NODE_ENV=production
  - WantedBy=default.target
- [x] Create `deploy/setup.sh` modeled on hiking-food's setup.sh:
  - Create `~/dev/beebaby-admin` directory
  - Enable lingering (`loginctl enable-linger`)
  - Usage: `ssh beebaby 'bash -s' < deploy/setup.sh`
- [x] Create `deploy/deploy.sh` modeled on hiking-food's deploy.sh:
  - rsync project to `beebaby:dev/beebaby-admin/` excluding node_modules, dist, .git, server/public
  - SSH: `cd ~/dev/beebaby-admin && npm install && npm run build`
  - SSH: copy service file to `~/.config/systemd/user/`, daemon-reload, restart
  - SSH: print service status
  - Usage: `./deploy/deploy.sh`
- [x] Test locally: `npm run build && npm start`, verify app works at localhost:8001
- [ ] Run `ssh beebaby 'bash -s' < deploy/setup.sh` for first-time setup
- [ ] Run `./deploy/deploy.sh` to deploy
- [ ] Verify from another device on Tailscale: navigate to `beebaby:8001`, confirm full functionality
