// Hand-authored OpenAPI 3 document for the beebaby-admin (tmux session manager) API.
//
// Source of truth: `server/src/index.ts` (GET /api/health) and the routes in
// `server/src/sessions.ts` (mounted under /api). Every path/method/param/body
// below was verified against those files. Keep in sync when routes change.
//
// The WebSocket terminal transport is NOT expressible in OpenAPI, so it is
// documented in prose under `info.description` and the `Terminal (WebSocket)`
// section below. Served at GET /openapi.json; rendered by Swagger UI at /docs.
//
// Not typed `as const`: swaggerUi.setup() expects a mutable JsonObject, and a
// deeply-readonly literal would not assign cleanly.

const SessionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: '$0', description: 'tmux session id.' },
    name: { type: 'string', example: 'main' },
    attached: { type: 'integer', description: 'Number of attached clients.' },
    windows: { type: 'integer', description: 'Number of windows in the session.' },
    created: { type: 'integer', description: 'Unix timestamp of session creation.' },
  },
  required: ['id', 'name', 'attached', 'windows', 'created'],
};

const ErrorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};

const nameParam = {
  name: 'name',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Current tmux session name.',
};

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'BeeBaby Admin API',
    version: '0.1.0',
    description: [
      'Browser-based tmux session manager (Express + node-pty + WebSocket).',
      'REST endpoints under `/api` do session CRUD by shelling out to `tmux`.',
      'No authentication of any kind — the service spawns real shells on the host, so it must stay LAN-only (bound to 127.0.0.1).',
      '',
      '## Terminal (WebSocket)',
      '',
      'Live terminal I/O is served over a WebSocket at `ws://<host>:8001/ws/terminal?session=<name>`',
      '(query param `session` defaults to `main`). This transport is **not** part of the OpenAPI spec.',
      '',
      'On connect the server does not spawn a PTY immediately; it waits for the first `RESIZE` message,',
      'then runs `tmux new-session -A -s <name>` via node-pty at the given dimensions. Input received before',
      'the PTY is ready is buffered and flushed once it spawns.',
      '',
      'All frames are **binary**. The first byte is the message type; the remaining bytes are the payload:',
      '',
      '| Byte | Constant | Direction | Payload |',
      '|------|----------|-----------|---------|',
      '| `0` | INPUT | client → server | UTF-8 text written to the PTY |',
      '| `1` | OUTPUT | server → client | UTF-8 terminal output from the PTY |',
      '| `2` | RESIZE | client → server | JSON `{ "cols": <n>, "rows": <n> }` (first RESIZE also spawns the PTY) |',
      '| `3` | PAUSE | client → server | empty — pause PTY output |',
      '| `4` | RESUME | client → server | empty — resume PTY output |',
      '',
      'On PTY exit the server closes the socket; on socket close/error it kills the PTY.',
      'Only the `/ws/terminal` upgrade path is accepted; all other upgrade requests are destroyed.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'On-box service (port 8001).' }],
  tags: [
    { name: 'Utility' },
    { name: 'Sessions', description: 'tmux session CRUD via the `tmux` CLI.' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Utility'],
        summary: 'Liveness check.',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
              },
            },
          },
        },
      },
    },
    '/api/sessions': {
      get: {
        tags: ['Sessions'],
        summary: 'List all active tmux sessions.',
        description: 'Returns an empty array when no tmux server is running.',
        responses: {
          '200': {
            description: 'Array of sessions',
            content: { 'application/json': { schema: { type: 'array', items: SessionSchema } } },
          },
          '500': { description: 'Unexpected tmux error', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
      post: {
        tags: ['Sessions'],
        summary: 'Create a new detached tmux session (120×40).',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Session name; tmux auto-assigns one if omitted.' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created session', content: { 'application/json': { schema: SessionSchema } } },
          '409': { description: 'Session name already exists', content: { 'application/json': { schema: ErrorSchema } } },
          '500': { description: 'Unexpected tmux error', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
    '/api/sessions/{name}': {
      patch: {
        tags: ['Sessions'],
        summary: 'Rename an existing session.',
        parameters: [nameParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', description: 'New session name.' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated session', content: { 'application/json': { schema: SessionSchema } } },
          '400': { description: 'Missing "name" in body', content: { 'application/json': { schema: ErrorSchema } } },
          '404': { description: 'Session not found', content: { 'application/json': { schema: ErrorSchema } } },
          '409': { description: 'Target name already exists', content: { 'application/json': { schema: ErrorSchema } } },
          '500': { description: 'Unexpected tmux error', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
      delete: {
        tags: ['Sessions'],
        summary: 'Kill a tmux session.',
        description: 'Terminates the session and any work running in it.',
        parameters: [{ ...nameParam, description: 'Session name to kill.' }],
        responses: {
          '204': { description: 'Killed (no body).' },
          '404': { description: 'Session not found', content: { 'application/json': { schema: ErrorSchema } } },
          '500': { description: 'Unexpected tmux error', content: { 'application/json': { schema: ErrorSchema } } },
        },
      },
    },
  },
};
