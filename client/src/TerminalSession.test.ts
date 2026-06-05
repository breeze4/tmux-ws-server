import { describe, it, expect, vi, beforeEach } from 'vitest';
import TerminalSession from './TerminalSession';

// --- FakeWebSocket ---

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  binaryType = 'arraybuffer';
  readyState = 1;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
}

// --- Helpers ---

/** Decode a sent frame from FakeWebSocket.send mock call */
function decodeFrame(call: unknown[]): { opcode: number; payload: string } {
  const buf = new Uint8Array(call[0] as ArrayBuffer);
  return {
    opcode: buf[0],
    payload: new TextDecoder().decode(buf.slice(1)),
  };
}

/** Build an incoming OUTPUT frame (opcode 1 + payload bytes) */
function makeOutputFrame(size: number): ArrayBuffer {
  const buf = new Uint8Array(1 + size);
  buf[0] = 1; // OUTPUT opcode
  for (let i = 1; i < buf.length; i++) buf[i] = 65; // fill with 'A'
  return buf.buffer;
}

// --- Setup ---

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  FakeWebSocket.instances = [];
  vi.clearAllMocks();
});

// --- Tests ---

describe('TerminalSession', () => {
  function createSession(sessionName = 'test-session') {
    const onOutput = vi.fn();
    const onEnd = vi.fn();
    const session = new TerminalSession({ sessionName, onOutput, onEnd });
    return { session, onOutput, onEnd };
  }

  function connectAndGetWs(session: TerminalSession, cols = 80, rows = 24) {
    session.connect(cols, rows);
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }

  describe('connect', () => {
    it('creates WebSocket with correct URL containing session name', () => {
      const { session } = createSession('my-session');
      connectAndGetWs(session);
      const ws = FakeWebSocket.instances[0];
      expect(ws.url).toContain('/ws/terminal?session=my-session');
    });

    it('URL-encodes the session name', () => {
      const { session } = createSession('has spaces & stuff');
      connectAndGetWs(session);
      const ws = FakeWebSocket.instances[0];
      expect(ws.url).toContain('session=has%20spaces%20%26%20stuff');
    });

    it('sends RESIZE frame on WebSocket open', async () => {
      const { session } = createSession();
      const ws = connectAndGetWs(session, 100, 50);

      // Wait for async onopen
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      const frame = decodeFrame(ws.send.mock.calls[0]);
      expect(frame.opcode).toBe(2); // RESIZE
      expect(JSON.parse(frame.payload)).toEqual({ cols: 100, rows: 50 });
    });

    it('throws on cols=0, rows=0', () => {
      const { session } = createSession();
      expect(() => session.connect(0, 0)).toThrow('Invalid dimensions');
    });

    it('throws on negative cols', () => {
      const { session } = createSession();
      expect(() => session.connect(-1, 24)).toThrow('Invalid dimensions');
    });
  });

  describe('sendInput', () => {
    it('sends binary frame with opcode 0 and UTF-8 payload', async () => {
      const { session } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      ws.send.mockClear();
      session.sendInput('hello');

      expect(ws.send).toHaveBeenCalledOnce();
      const frame = decodeFrame(ws.send.mock.calls[0]);
      expect(frame.opcode).toBe(0); // INPUT
      expect(frame.payload).toBe('hello');
    });

    it('is a no-op after dispose', async () => {
      const { session } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      ws.send.mockClear();
      session.dispose();
      session.sendInput('hello');

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('resize', () => {
    it('sends binary frame with opcode 2 and JSON payload', async () => {
      const { session } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      ws.send.mockClear();
      session.resize(120, 40);

      expect(ws.send).toHaveBeenCalledOnce();
      const frame = decodeFrame(ws.send.mock.calls[0]);
      expect(frame.opcode).toBe(2); // RESIZE
      expect(JSON.parse(frame.payload)).toEqual({ cols: 120, rows: 40 });
    });

    it('is a no-op after dispose', async () => {
      const { session } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      ws.send.mockClear();
      session.dispose();
      session.resize(120, 40);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('onOutput', () => {
    it('calls onOutput with data and done callback on OUTPUT frame', async () => {
      const { session, onOutput } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      const frame = makeOutputFrame(5);
      ws.onmessage?.({ data: frame });

      expect(onOutput).toHaveBeenCalledOnce();
      const [data, done] = onOutput.mock.calls[0];
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(5);
      expect(typeof done).toBe('function');
    });

    it('ignores empty frames', async () => {
      const { session, onOutput } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      ws.onmessage?.({ data: new ArrayBuffer(0) });
      expect(onOutput).not.toHaveBeenCalled();
    });
  });

  describe('backpressure', () => {
    it('sends PAUSE when bytesInFlight exceeds HIGH_WATER', async () => {
      const { session, onOutput } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
      ws.send.mockClear();

      // Send 101KB in one frame (exceeds HIGH_WATER of 100KB)
      const frame = makeOutputFrame(101 * 1024);
      ws.onmessage?.({ data: frame });

      expect(onOutput).toHaveBeenCalledOnce();
      // Should have sent a PAUSE frame
      expect(ws.send).toHaveBeenCalledOnce();
      const pauseFrame = decodeFrame(ws.send.mock.calls[0]);
      expect(pauseFrame.opcode).toBe(3); // PAUSE
    });

    it('sends RESUME when bytesInFlight drops below LOW_WATER after calling done', async () => {
      const { session, onOutput } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
      ws.send.mockClear();

      // Send 101KB to trigger PAUSE
      const frame = makeOutputFrame(101 * 1024);
      ws.onmessage?.({ data: frame });

      expect(ws.send).toHaveBeenCalledOnce(); // PAUSE sent

      // Get the done callback and call it to drain all bytes
      const done = onOutput.mock.calls[0][1];
      ws.send.mockClear();
      done();

      // bytesInFlight goes to 0, which is < LOW_WATER (10KB) → RESUME
      expect(ws.send).toHaveBeenCalledOnce();
      const resumeFrame = decodeFrame(ws.send.mock.calls[0]);
      expect(resumeFrame.opcode).toBe(4); // RESUME
    });

    it('does not send RESUME if bytesInFlight is still above LOW_WATER', async () => {
      const { session, onOutput } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
      ws.send.mockClear();

      // Send two chunks: 60KB + 50KB = 110KB total → triggers PAUSE after second
      const frame1 = makeOutputFrame(60 * 1024);
      const frame2 = makeOutputFrame(50 * 1024);
      ws.onmessage?.({ data: frame1 });
      // 60KB < HIGH_WATER, no PAUSE yet
      expect(ws.send).not.toHaveBeenCalled();

      ws.onmessage?.({ data: frame2 });
      // 110KB > HIGH_WATER → PAUSE
      expect(ws.send).toHaveBeenCalledOnce();

      // Call done for the 50KB chunk → bytesInFlight = 60KB, still > LOW_WATER
      const done2 = onOutput.mock.calls[1][1];
      ws.send.mockClear();
      done2();
      expect(ws.send).not.toHaveBeenCalled(); // No RESUME yet

      // Call done for the 60KB chunk → bytesInFlight = 0 < LOW_WATER → RESUME
      const done1 = onOutput.mock.calls[0][1];
      done1();
      expect(ws.send).toHaveBeenCalledOnce();
      const resumeFrame = decodeFrame(ws.send.mock.calls[0]);
      expect(resumeFrame.opcode).toBe(4); // RESUME
    });
  });

  describe('dispose', () => {
    it('closes WebSocket without triggering onEnd', async () => {
      const { session, onEnd } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      session.dispose();

      expect(ws.close).toHaveBeenCalledOnce();
      expect(ws.onclose).toBeNull();
      // Simulate what would happen if close fires after dispose
      // onclose was set to null, so onEnd should not be called
      expect(onEnd).not.toHaveBeenCalled();
    });
  });

  describe('onEnd', () => {
    it('triggers onEnd with reason on unexpected WebSocket close', async () => {
      const { session, onEnd } = createSession();
      const ws = connectAndGetWs(session);
      await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

      ws.onclose?.();

      expect(onEnd).toHaveBeenCalledOnce();
      expect(onEnd).toHaveBeenCalledWith('WebSocket closed');
    });
  });
});
