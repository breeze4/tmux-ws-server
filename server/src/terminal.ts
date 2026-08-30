import * as pty from 'node-pty';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { INPUT, OUTPUT, RESIZE, PAUSE, RESUME } from './protocol.js';

const activePtys = new Set<pty.IPty>();
const tmuxSocket = process.env.TMUX_SOCKET;

function tmuxArgs(args: string[]): string[] {
  return tmuxSocket ? ['-S', tmuxSocket, ...args] : args;
}

export function getActivePtys(): Set<pty.IPty> {
  return activePtys;
}

export function handleTerminalConnection(ws: WebSocket, req: IncomingMessage): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const sessionName = url.searchParams.get('session') ?? 'main';

  let term: pty.IPty | null = null;
  let exited = false;
  const pendingInput: string[] = [];

  function spawnPty(cols: number, rows: number) {
    if (term) return; // already spawned

    term = pty.spawn('tmux', tmuxArgs(['new-session', '-A', '-s', sessionName]), {
      name: 'xterm-256color',
      cols,
      rows,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
    });

    activePtys.add(term);

    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        const payload = Buffer.from(data, 'utf-8');
        const msg = Buffer.alloc(1 + payload.length);
        msg[0] = OUTPUT;
        payload.copy(msg, 1);
        ws.send(msg);
      }
    });

    term.onExit(() => {
      exited = true;
      if (term) activePtys.delete(term);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    // Flush any input that arrived before the PTY was ready
    for (const data of pendingInput) {
      term.write(data);
    }
    pendingInput.length = 0;
  }

  ws.on('message', (raw: ArrayBuffer | Buffer) => {
    const buf = Buffer.from(raw as ArrayBuffer);
    if (buf.length === 0) return;

    const cmd = buf[0];
    const payload = buf.subarray(1);

    switch (cmd) {
      case INPUT:
        if (term) {
          term.write(payload.toString('utf-8'));
        } else {
          pendingInput.push(payload.toString('utf-8'));
        }
        break;
      case RESIZE: {
        try {
          const { cols, rows } = JSON.parse(payload.toString('utf-8'));
          if (typeof cols === 'number' && typeof rows === 'number' && cols > 0 && rows > 0) {
            if (!term) {
              // First resize — spawn PTY at the correct dimensions
              spawnPty(cols, rows);
            } else {
              term.resize(cols, rows);
            }
          }
        } catch {
          // ignore malformed resize
        }
        break;
      }
      case PAUSE:
        if (term) term.pause();
        break;
      case RESUME:
        if (term) term.resume();
        break;
    }
  });

  ws.on('close', () => {
    if (!exited) {
      exited = true;
      if (term) {
        activePtys.delete(term);
        term.kill();
      }
    }
  });

  ws.on('error', () => {
    if (!exited) {
      exited = true;
      if (term) {
        activePtys.delete(term);
        term.kill();
      }
    }
  });
}
