import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TerminalPane from './TerminalPane';

// --- Mocks ---

vi.mock('@xterm/xterm', () => {
  const Terminal = vi.fn(function (this: Record<string, unknown>) {
    this.open = vi.fn();
    this.loadAddon = vi.fn();
    this.onData = vi.fn(() => ({ dispose: vi.fn() }));
    this.onResize = vi.fn(() => ({ dispose: vi.fn() }));
    this.dispose = vi.fn();
    this.write = vi.fn();
    this.cols = 80;
    this.rows = 24;
  });
  return { Terminal };
});

vi.mock('@xterm/addon-fit', () => {
  const FitAddon = vi.fn(function (this: Record<string, unknown>) {
    this.fit = vi.fn();
  });
  return { FitAddon };
});

vi.mock('@xterm/addon-webgl', () => {
  const WebglAddon = vi.fn(function () {});
  return { WebglAddon };
});

vi.mock('@xterm/addon-canvas', () => {
  const CanvasAddon = vi.fn(function () {});
  return { CanvasAddon };
});

// Fake WebSocket that records calls but doesn't actually connect
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  binaryType = 'arraybuffer';
  readyState = 1;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  FakeWebSocket.instances = [];
  vi.clearAllMocks();
});

// --- Tests ---

describe('TerminalPane render states', () => {
  it('shows placeholder when sessionName is null', () => {
    render(<TerminalPane sessionName={null} />);
    expect(screen.getByText('No session selected')).toBeTruthy();
  });

  it('renders terminal container when sessionName is provided', () => {
    const { container } = render(<TerminalPane sessionName="my-session" />);
    // Should NOT show the null-state or disconnected messages
    expect(screen.queryByText('No session selected')).toBeNull();
    expect(screen.queryByText('Disconnected from')).toBeNull();
    // Container div should exist
    expect(container.querySelector('div[style]')).toBeTruthy();
  });

  it('shows disconnected UI when WebSocket closes', async () => {
    render(<TerminalPane sessionName="my-session" />);

    // Wait for the 150ms connect timer + WS creation
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    }, { timeout: 500 });

    const ws = FakeWebSocket.instances[0];
    // Simulate WS close
    act(() => ws.onclose?.());

    expect(await screen.findByText('Reconnect')).toBeTruthy();
    expect(screen.getByText('my-session')).toBeTruthy();
  });

  it('shows Detach button only when onDetach is provided', async () => {
    const onDetach = vi.fn();
    render(<TerminalPane sessionName="my-session" onDetach={onDetach} />);

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    }, { timeout: 500 });

    act(() => FakeWebSocket.instances[0].onclose?.());

    expect(await screen.findByText('Reconnect')).toBeTruthy();
    expect(screen.getByText('Detach')).toBeTruthy();
  });

  it('does not show Detach button when onDetach is not provided', async () => {
    render(<TerminalPane sessionName="my-session" />);

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    }, { timeout: 500 });

    act(() => FakeWebSocket.instances[0].onclose?.());

    expect(await screen.findByText('Reconnect')).toBeTruthy();
    expect(screen.queryByText('Detach')).toBeNull();
  });

  it('calls onDetach when Detach button is clicked', async () => {
    const onDetach = vi.fn();
    render(<TerminalPane sessionName="my-session" onDetach={onDetach} />);

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    }, { timeout: 500 });

    act(() => FakeWebSocket.instances[0].onclose?.());

    const btn = await screen.findByText('Detach');
    fireEvent.click(btn);
    expect(onDetach).toHaveBeenCalledOnce();
  });

  it('reconnects when Reconnect button is clicked', async () => {
    render(<TerminalPane sessionName="my-session" />);

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(1);
    }, { timeout: 500 });

    act(() => FakeWebSocket.instances[0].onclose?.());

    const btn = await screen.findByText('Reconnect');
    fireEvent.click(btn);

    // After reconnect, disconnected UI should disappear
    expect(screen.queryByText('Reconnect')).toBeNull();
    // Terminal container should be back — a new WS will be created after 150ms
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.length).toBe(2);
    }, { timeout: 500 });
  });
});
