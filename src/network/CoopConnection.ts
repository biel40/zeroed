import type { IncomingMessage, OutgoingMessage } from './Protocol';

/**
 * Socket to the room relay. The relay only pairs two peers and forwards
 * their messages; the host browser owns the match simulation. dispose()
 * detaches every consumer before closing, so a finished match can never
 * receive late callbacks from its old socket.
 */
export class CoopConnection {
  public onMessage: ((message: IncomingMessage) => void) | null = null;
  public onClose: (() => void) | null = null;
  private readonly socket: WebSocket;
  private disposed = false;

  public constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', this.handleMessage);
    this.socket.addEventListener('close', this.handleClose);
  }

  public get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  public open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isOpen) {
        resolve();
        return;
      }
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Could not connect to the room server.')), { once: true });
    });
  }

  public send(message: OutgoingMessage): void {
    if (!this.disposed && this.isOpen) this.socket.send(JSON.stringify(message));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onMessage = null;
    this.onClose = null;
    this.socket.removeEventListener('message', this.handleMessage);
    this.socket.removeEventListener('close', this.handleClose);
    this.socket.close();
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    let message: unknown;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message && typeof message === 'object' && typeof (message as { type?: unknown }).type === 'string') {
      this.onMessage?.(message as IncomingMessage);
    }
  };

  private readonly handleClose = (): void => {
    this.onClose?.();
  };
}
