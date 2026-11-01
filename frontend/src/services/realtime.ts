import { getApiBaseUrl } from './api';

export interface WorkspaceRealtimeEvent<T = any> {
  type: string;
  event?: string;
  workspace_id?: string;
  data?: T;
  payload?: T;
  timestamp?: string;
}

export type RealtimeEventHandler<T = any> = (event: WorkspaceRealtimeEvent<T>) => void;

/**
 * Resolves the WebSocket endpoint for a given workspace and auth token.
 */
export function getWorkspaceWsUrl(workspaceId: string, token: string): string {
  const apiBase = getApiBaseUrl(); // e.g. http://127.0.0.1:8000/api/v1
  const wsProtocol = apiBase.startsWith('https://') ? 'wss://' : 'ws://';
  const cleanHostPath = apiBase.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${wsProtocol}${cleanHostPath}/workspaces/${workspaceId}/ws?token=${encodeURIComponent(token)}`;
}

export class WorkspaceRealtimeClient {
  private workspaceId: string;
  private ws: WebSocket | null = null;
  private pingIntervalId: any = null;
  private reconnectTimeoutId: any = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;
  private listeners: Set<RealtimeEventHandler> = new Set();
  private reconnectCallbacks: Set<() => void> = new Set();
  private revocationCallbacks: Set<() => void> = new Set();

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  public connect() {
    this.isExplicitlyClosed = false;
    const token = localStorage.getItem('token');
    if (!token || !this.workspaceId) return;

    const wsUrl = getWorkspaceWsUrl(this.workspaceId, token);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const wasReconnecting = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;

        // Start 25s keepalive ping
        this.startPing();

        // If this was a reconnection, inform listeners to reconcile state
        if (wasReconnecting) {
          this.reconnectCallbacks.forEach((cb) => cb());
        }
      };

      this.ws.onmessage = (messageEvent) => {
        try {
          const parsed: WorkspaceRealtimeEvent = JSON.parse(messageEvent.data);
          if (parsed.payload === undefined && parsed.data !== undefined) {
            parsed.payload = parsed.data;
          }
          this.listeners.forEach((handler) => handler(parsed));
        } catch {
          // ignore non-JSON messages (e.g. pong strings)
        }
      };

      this.ws.onclose = (closeEvent) => {
        this.stopPing();
        this.ws = null;

        // If membership was revoked (1008 policy violation or 4403), do not reconnect
        if (closeEvent.code === 1008 || closeEvent.code === 4403) {
          this.revocationCallbacks.forEach((cb) => cb());
          return;
        }

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // WebSocket error will trigger onclose where reconnect logic lives
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private startPing() {
    this.stopPing();
    this.pingIntervalId = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeoutId || this.isExplicitlyClosed) return;

    this.reconnectAttempts += 1;
    // Exponential backoff with jitter: 1s, 2s, 4s, capped at 10s
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 10000) + Math.random() * 500;

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      if (!this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  public on(handler: RealtimeEventHandler) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  public onReconnect(cb: () => void) {
    this.reconnectCallbacks.add(cb);
    return () => this.reconnectCallbacks.delete(cb);
  }

  public onRevoked(cb: () => void) {
    this.revocationCallbacks.add(cb);
    return () => this.revocationCallbacks.delete(cb);
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    this.stopPing();
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.listeners.clear();
    this.reconnectCallbacks.clear();
    this.revocationCallbacks.clear();
  }
}
