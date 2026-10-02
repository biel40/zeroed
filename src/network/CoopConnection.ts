import { t } from '../i18n/i18n';
import { RELAY_PROTOCOL_VERSION, type IncomingMessage, type OutgoingMessage } from './Protocol';

const RELAY_HANDSHAKE_TIMEOUT_MS = 4000;
const CONNECTION_TIMEOUT_MS = 8000;

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
      if (this.disposed || this.socket.readyState === WebSocket.CLOSED) {
        reject(new Error(t('coop.serverClosed')));
        return;
      }
      const cleanup = (): void => {
        clearTimeout(timer);
        this.socket.removeEventListener('open', onOpen);
        this.socket.removeEventListener('error', onError);
        this.socket.removeEventListener('close', onClose);
      };
      const onOpen = (): void => { cleanup(); resolve(); };
      const onError = (): void => { cleanup(); reject(new Error(t('coop.serverUnreachable'))); };
      const onClose = (): void => { cleanup(); reject(new Error(t('coop.serverClosed'))); };
      const timer = setTimeout(() => {
        cleanup();
        this.dispose();
        reject(new Error(t('coop.serverNoResponse')));
      }, CONNECTION_TIMEOUT_MS);
      this.socket.addEventListener('open', onOpen);
      this.socket.addEventListener('error', onError);
      this.socket.addEventListener('close', onClose);
    });
  }

  /** Fail in the lobby when a deployed relay still speaks an older protocol. */
  public checkRelay(): Promise<void> {
    if (!this.isOpen || this.disposed) return Promise.reject(new Error(t('coop.serverClosed')));
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.socket.removeEventListener('message', onMessage);
        this.socket.removeEventListener('close', onClose);
      };
      const onClose = (): void => {
        cleanup();
        reject(new Error(t('coop.serverClosed')));
      };
      const onMessage = (event: MessageEvent): void => {
        let response: unknown;
        try { response = JSON.parse(String(event.data)); } catch { return; }
        if (!response || typeof response !== 'object' || !('type' in response)
          || response.type !== 'relayReady') return;
        cleanup();
        if ('version' in response && response.version === RELAY_PROTOCOL_VERSION) resolve();
        else reject(new Error(t('coop.serverVersionMismatch')));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(t('coop.serverVersionUnconfirmed')));
      }, RELAY_HANDSHAKE_TIMEOUT_MS);
      this.socket.addEventListener('message', onMessage);
      this.socket.addEventListener('close', onClose);
      this.send({ type: 'hello', version: RELAY_PROTOCOL_VERSION });
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
