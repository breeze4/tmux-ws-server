import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);
const tmuxSocket = process.env.TMUX_SOCKET;

function tmuxArgs(args: string[]): string[] {
  return tmuxSocket ? ['-S', tmuxSocket, ...args] : args;
}

export interface Session {
  id: string;
  name: string;
  attached: number;
  windows: number;
  created: number;
}

async function tmuxValue(sessionId: string, format: string): Promise<string> {
  const { stdout } = await exec(
    'tmux',
    tmuxArgs(['display-message', '-p', '-t', sessionId, '-F', format]),
  );
  return stdout.trimEnd();
}

async function getSessionById(sessionId: string): Promise<Session> {
  const [name, attached, windows, created] = await Promise.all([
    tmuxValue(sessionId, '#{session_name}'),
    tmuxValue(sessionId, '#{session_attached}'),
    tmuxValue(sessionId, '#{session_windows}'),
    tmuxValue(sessionId, '#{session_created}'),
  ]);
  return {
    id: sessionId,
    name,
    attached: parseInt(attached, 10),
    windows: parseInt(windows, 10),
    created: parseInt(created, 10),
  };
}

async function listSessions(): Promise<Session[]> {
  try {
    const { stdout } = await exec('tmux', tmuxArgs(['list-sessions', '-F', '#{session_id}']));
    const sessionIds = stdout.trim().split('\n').filter((sessionId) => sessionId.length > 0);
    return Promise.all(sessionIds.map((sessionId) => getSessionById(sessionId)));
  } catch (err: any) {
    // tmux exits non-zero when no server is running
    if (err.stderr?.includes('no server running') || err.stderr?.includes('no sessions') || err.stderr?.includes('No such file or directory') || err.stderr?.includes('error connecting')) {
      return [];
    }
    throw err;
  }
}

async function getSession(name: string): Promise<Session | null> {
  const sessions = await listSessions();
  return sessions.find((s) => s.name === name) ?? null;
}

export const sessionRoutes: Router = Router();

// List all sessions
sessionRoutes.get('/sessions', async (_req, res) => {
  try {
    const sessions = await listSessions();
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new session
sessionRoutes.post('/sessions', async (req, res) => {
  try {
    const args = ['new-session', '-d', '-x', '120', '-y', '40', '-P', '-F', '#{session_id}'];
    const name: string | undefined = req.body?.name;
    if (name) {
      args.push('-s', name);
    }
    const { stdout } = await exec('tmux', tmuxArgs(args));
    const session = await getSessionById(stdout.trim());
    res.status(201).json(session);
  } catch (err: any) {
    if (err.stderr?.includes('duplicate session')) {
      res.status(409).json({ error: `Session name already exists` });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Rename a session
sessionRoutes.patch('/sessions/:name', async (req, res) => {
  try {
    const oldName = req.params.name;
    const newName: string = req.body?.name;
    if (!newName) {
      res.status(400).json({ error: 'Missing "name" in request body' });
      return;
    }
    await exec('tmux', tmuxArgs(['rename-session', '-t', oldName, newName]));
    const session = await getSession(newName);
    if (!session) {
      res.status(500).json({ error: 'Session renamed but could not be found' });
      return;
    }
    res.json(session);
  } catch (err: any) {
    if (err.stderr?.includes("can't find session") || err.stderr?.includes('no session')) {
      res.status(404).json({ error: `Session not found` });
      return;
    }
    if (err.stderr?.includes('duplicate session')) {
      res.status(409).json({ error: `Session name already exists` });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Kill a session
sessionRoutes.delete('/sessions/:name', async (req, res) => {
  try {
    await exec('tmux', tmuxArgs(['kill-session', '-t', req.params.name]));
    res.status(204).end();
  } catch (err: any) {
    if (err.stderr?.includes("can't find session") || err.stderr?.includes('no session')) {
      res.status(404).json({ error: `Session not found` });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});
