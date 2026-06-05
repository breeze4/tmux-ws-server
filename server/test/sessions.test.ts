import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { app, server } from '../src/index.js';

const PORT = 8098;
const TEST_PREFIX = 'test-sessions-';
const createdSessions: string[] = [];

function uniqueName(): string {
  return `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function api(method: string, path: string, body?: Record<string, unknown>) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`http://localhost:${PORT}${path}`, opts);
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => resolve());
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  // Clean up any test sessions
  for (const name of createdSessions) {
    try {
      execSync(`tmux kill-session -t ${name} 2>/dev/null`);
    } catch {
      // ignore
    }
  }
  // Also sweep any leftover test-sessions- prefixed sessions
  try {
    const list = execSync(`tmux list-sessions -F '#{session_name}' 2>/dev/null`).toString();
    for (const line of list.trim().split('\n')) {
      if (line.startsWith(TEST_PREFIX)) {
        try { execSync(`tmux kill-session -t ${line} 2>/dev/null`); } catch { /* ignore */ }
      }
    }
  } catch {
    // no tmux server
  }
});

describe('Session CRUD API', () => {
  it('lists sessions (empty or existing)', async () => {
    const res = await api('GET', '/api/sessions');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('creates a named session', async () => {
    const name = uniqueName();
    createdSessions.push(name);
    const res = await api('POST', '/api/sessions', { name });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe(name);
    expect(typeof data.id).toBe('string');
    expect(typeof data.windows).toBe('number');
    expect(typeof data.created).toBe('number');
  });

  it('rejects duplicate session name', async () => {
    const name = uniqueName();
    createdSessions.push(name);
    await api('POST', '/api/sessions', { name });
    const res = await api('POST', '/api/sessions', { name });
    expect(res.status).toBe(409);
  });

  it('creates session without name', async () => {
    const res = await api('POST', '/api/sessions', {});
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(typeof data.name).toBe('string');
    createdSessions.push(data.name);
  });

  it('full lifecycle: create → list → rename → list → kill → list', async () => {
    const name = uniqueName();
    createdSessions.push(name);

    // Create
    const createRes = await api('POST', '/api/sessions', { name });
    expect(createRes.status).toBe(201);

    // List — should contain our session
    const list1Res = await api('GET', '/api/sessions');
    const list1: any[] = await list1Res.json();
    expect(list1.some((s: any) => s.name === name)).toBe(true);

    // Rename
    const newName = `${name}-renamed`;
    createdSessions.push(newName);
    const renameRes = await api('PATCH', `/api/sessions/${encodeURIComponent(name)}`, { name: newName });
    expect(renameRes.status).toBe(200);
    const renamed = await renameRes.json();
    expect(renamed.name).toBe(newName);

    // List — old name gone, new name present
    const list2Res = await api('GET', '/api/sessions');
    const list2: any[] = await list2Res.json();
    expect(list2.some((s: any) => s.name === name)).toBe(false);
    expect(list2.some((s: any) => s.name === newName)).toBe(true);

    // Kill
    const killRes = await api('DELETE', `/api/sessions/${encodeURIComponent(newName)}`);
    expect(killRes.status).toBe(204);

    // List — session gone
    const list3Res = await api('GET', '/api/sessions');
    const list3: any[] = await list3Res.json();
    expect(list3.some((s: any) => s.name === newName)).toBe(false);
  });

  it('returns 404 when renaming non-existent session', async () => {
    const res = await api('PATCH', '/api/sessions/nonexistent-session-xyz', { name: 'foo' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when killing non-existent session', async () => {
    const res = await api('DELETE', '/api/sessions/nonexistent-session-xyz');
    expect(res.status).toBe(404);
  });
});
