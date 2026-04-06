import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import '@xterm/xterm/css/xterm.css';

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const CTRL_KEYS = [
  { label: 'Ctrl+C', char: '\x03' },
  { label: 'Ctrl+D', char: '\x04' },
  { label: 'Ctrl+Z', char: '\x1a' },
  { label: 'Tab', char: '\t' },
  { label: 'Esc', char: '\x1b' },
  { label: '↑', char: '\x1b[A' },
  { label: '↓', char: '\x1b[B' },
  { label: 'Enter', char: '\r' },
];

const INPUT = 0;
const OUTPUT = 1;
const RESIZE = 2;
const PAUSE = 3;
const RESUME = 4;

const HIGH_WATER = 100 * 1024;
const LOW_WATER = 10 * 1024;

interface Props {
  sessionName: string | null;
  onDetach?: () => void;
}

export default function TerminalPane({ sessionName, onDetach }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [disconnected, setDisconnected] = useState(false);

  const sendCtrl = useCallback((char: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = new TextEncoder().encode(char);
    const msg = new Uint8Array(1 + payload.length);
    msg[0] = INPUT;
    msg.set(payload, 1);
    ws.send(msg.buffer);
  }, []);

  const reconnect = useCallback(() => setDisconnected(false), []);

  useEffect(() => {
    if (!sessionName || !containerRef.current || disconnected) return;

    const container = containerRef.current;
    const fontSize = IS_TOUCH ? 12 : 14;

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontSize,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      try {
        terminal.loadAddon(new CanvasAddon());
      } catch {
        // fall back to default renderer
      }
    }

    terminal.open(container);

    // Helper to build and send a binary protocol message
    function sendMessage(ws: WebSocket, cmd: number, data?: string) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const payload = data ? new TextEncoder().encode(data) : new Uint8Array(0);
      const msg = new Uint8Array(1 + payload.length);
      msg[0] = cmd;
      msg.set(payload, 1);
      ws.send(msg.buffer);
    }

    // Delay WebSocket connection so the container has final dimensions.
    // This way the first resize message sent to the PTY has the correct cols/rows.
    let ws: WebSocket | null = null;
    let bytesInFlight = 0;
    let paused = false;
    let disposed = false;

    const connectTimer = setTimeout(() => {
      if (disposed) return;
      fitAddon.fit();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/terminal?session=${encodeURIComponent(sessionName)}`
      );
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        fitAddon.fit();
        const { cols, rows } = terminal;
        sendMessage(ws!, RESIZE, JSON.stringify({ cols, rows }));
      };

      ws.onmessage = (event: MessageEvent) => {
        const buf = new Uint8Array(event.data as ArrayBuffer);
        if (buf.length === 0) return;
        if (buf[0] === OUTPUT) {
          const data = buf.slice(1);
          bytesInFlight += data.length;

          if (!paused && bytesInFlight > HIGH_WATER) {
            paused = true;
            sendMessage(ws!, PAUSE);
          }

          terminal.write(data, () => {
            bytesInFlight -= data.length;
            if (paused && bytesInFlight < LOW_WATER) {
              paused = false;
              if (ws) sendMessage(ws, RESUME);
            }
          });
        }
      };

      ws.onclose = () => {
        if (!disposed) setDisconnected(true);
      };
    }, 150);

    const onDataDisposable = terminal.onData((data: string) => {
      if (ws) sendMessage(ws, INPUT, data);
    });

    const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (ws) sendMessage(ws, RESIZE, JSON.stringify({ cols, rows }));
    });

    // ResizeObserver with debounce
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => fitAddon.fit(), 150);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      clearTimeout(connectTimer);
      resizeObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      if (ws) {
        ws.onclose = null; // prevent onDisconnect firing during cleanup
        ws.close();
      }
      wsRef.current = null;
      terminal.dispose();
    };
  }, [sessionName, disconnected]);

  if (!sessionName) {
    return <div style={{ color: '#666', padding: 20 }}>No session selected</div>;
  }

  if (disconnected) {
    return (
      <div style={{ color: '#888', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
        <div>Disconnected from <strong style={{ color: '#c8c8d0' }}>{sessionName}</strong></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reconnect} style={{ background: '#2a5a2a', color: '#e0e0e0', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>
            Reconnect
          </button>
          {onDetach && (
            <button onClick={onDetach} style={{ background: '#333', color: '#c8c8d0', border: '1px solid #555', borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>
              Detach
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
      />
      {IS_TOUCH && (
        <div style={toolbarStyles.bar}>
          {CTRL_KEYS.map((k) => (
            <button
              key={k.label}
              style={toolbarStyles.btn}
              onTouchStart={(e) => { e.preventDefault(); sendCtrl(k.char); }}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const toolbarStyles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: 4,
    padding: '4px 6px',
    backgroundColor: '#16162a',
    borderTop: '1px solid #333',
    overflowX: 'auto',
    flexShrink: 0,
  },
  btn: {
    background: '#2a2a3e',
    color: '#c8c8d0',
    border: '1px solid #444',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
};
