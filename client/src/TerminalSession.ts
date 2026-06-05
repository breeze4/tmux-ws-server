const INPUT = 0;
const OUTPUT = 1;
const RESIZE = 2;
const PAUSE = 3;
const RESUME = 4;

const HIGH_WATER = 100 * 1024;
const LOW_WATER = 10 * 1024;

interface TerminalSessionOptions {
  sessionName: string;
  onOutput: (data: Uint8Array, done: () => void) => void;
  onEnd: (reason: string) => void;
}

export default class TerminalSession {
  private sessionName: string;
  private onOutput: (data: Uint8Array, done: () => void) => void;
  private onEnd: (reason: string) => void;
  private ws: WebSocket | null = null;
  private disposed = false;
  private bytesInFlight = 0;
  private paused = false;

  constructor({ sessionName, onOutput, onEnd }: TerminalSessionOptions) {
    this.sessionName = sessionName;
    this.onOutput = onOutput;
    this.onEnd = onEnd;
  }

  connect(cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) {
      throw new Error(`Invalid dimensions: cols=${cols}, rows=${rows}`);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/terminal?session=${encodeURIComponent(this.sessionName)}`
    );
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.sendFrame(RESIZE, JSON.stringify({ cols, rows }));
    };

    ws.onmessage = (event: MessageEvent) => {
      const buf = new Uint8Array(event.data as ArrayBuffer);
      if (buf.length === 0) return;
      if (buf[0] === OUTPUT) {
        const data = buf.slice(1);
        this.bytesInFlight += data.length;

        if (!this.paused && this.bytesInFlight > HIGH_WATER) {
          this.paused = true;
          this.sendFrame(PAUSE);
        }

        this.onOutput(data, () => {
          this.bytesInFlight -= data.length;
          if (this.paused && this.bytesInFlight < LOW_WATER) {
            this.paused = false;
            this.sendFrame(RESUME);
          }
        });
      }
    };

    ws.onclose = () => {
      if (!this.disposed) {
        this.onEnd('WebSocket closed');
      }
    };
  }

  sendInput(data: string): void {
    this.sendFrame(INPUT, data);
  }

  resize(cols: number, rows: number): void {
    this.sendFrame(RESIZE, JSON.stringify({ cols, rows }));
  }

  dispose(): void {
    this.disposed = true;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private sendFrame(cmd: number, data?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = data ? new TextEncoder().encode(data) : new Uint8Array(0);
    const msg = new Uint8Array(1 + payload.length);
    msg[0] = cmd;
    msg.set(payload, 1);
    this.ws.send(msg.buffer);
  }
}
