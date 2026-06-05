import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import '@xterm/xterm/css/xterm.css';
import TerminalSession from '../TerminalSession';

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

interface Props {
  sessionName: string | null;
  onDetach?: () => void;
}

export default function TerminalPane({ sessionName, onDetach }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const [disconnected, setDisconnected] = useState(false);

  const sendCtrl = useCallback((char: string) => {
    sessionRef.current?.sendInput(char);
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

    let disposed = false;

    const session = new TerminalSession({
      sessionName,
      onOutput: (data, done) => terminal.write(data, done),
      onEnd: () => {
        if (!disposed) setDisconnected(true);
      },
    });
    sessionRef.current = session;

    // Delay WebSocket connection so the container has final dimensions.
    const connectTimer = setTimeout(() => {
      if (disposed) return;
      fitAddon.fit();
      session.connect(terminal.cols, terminal.rows);
    }, 150);

    const onDataDisposable = terminal.onData((data: string) => {
      session.sendInput(data);
    });

    const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
      session.resize(cols, rows);
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
      session.dispose();
      sessionRef.current = null;
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
