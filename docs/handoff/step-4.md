# Step 4: Production Deployment Configuration

## Build output locations
- Server compiled JS: `server/dist/` (from `tsc`)
- Client static assets: `server/public/` (from `vite build`)
- Both directories are in `.gitignore`

## Production start command
```bash
npm run build   # builds server then client
npm start       # runs node server/dist/index.js
```
App serves on port 8001: API routes, WebSocket, static files, and SPA catch-all.

## Deploy commands

### First-time setup on beebaby
```bash
ssh beebaby 'bash -s' < deploy/setup.sh
```

### Subsequent deploys
```bash
./deploy/deploy.sh
```
This rsyncs code, runs `npm install && npm run build` on beebaby, installs the systemd service, and restarts it.

## Service file location on beebaby
`~/.config/systemd/user/beebaby-admin.service`

Manage with:
```bash
systemctl --user status beebaby-admin
systemctl --user restart beebaby-admin
systemctl --user enable beebaby-admin
journalctl --user -u beebaby-admin -f
```

## Route order in production
1. `app.use('/api', sessionRoutes)` — session CRUD
2. `app.get('/api/health')` — health check
3. `express.static(publicDir)` — Vite-built assets (only if `server/public/` exists)
4. `app.get('/{*splat}')` — SPA catch-all returning `index.html`

## Decisions and notes
- Static serving is conditional on `server/public/` directory existing, so dev mode (no build artifacts) is unaffected
- Used `import.meta.dirname` for path resolution (Node 24)
- The 695KB JS bundle triggers a Vite chunk size warning; not addressed now since xterm.js is inherently large
