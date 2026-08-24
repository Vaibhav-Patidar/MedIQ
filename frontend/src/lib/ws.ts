/* ============================================================
   MedIQ WebSocket Client
   Exponential backoff, 4401 handling, event dispatch.
   ============================================================ */
import type { WSEvent } from '../types';
import { useAuthStore } from '../stores/auth';
import { useWsStore } from '../stores/ws';

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000/ws';

type EventHandler = (data: unknown) => void;

export class MediqSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, EventHandler[]> = new Map();
  private retryCount = 0;
  private maxRetries = 10;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;

  constructor(path: string) {
    const token = useAuthStore.getState().token;
    this.url = `${WS_BASE}${path}${path.includes('?') ? '&' : '?'}token=${token}`;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionallyClosed = false;

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.retryCount = 0;
      useWsStore.getState().setConnected(true);
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as WSEvent;
        const handlers = this.handlers.get(msg.event);
        if (handlers) {
          handlers.forEach(h => h(msg.data));
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = (evt) => {
      useWsStore.getState().setConnected(false);

      // 4401: invalid/expired token → redirect to login
      if (evt.code === 4401) {
        useAuthStore.getState().clearToken();
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        return;
      }

      if (!this.intentionallyClosed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, handling reconnect there
    };
  }

  on(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  off(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || [];
    this.handlers.set(event, existing.filter(h => h !== handler));
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= this.maxRetries) return;

    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
    this.retryCount++;

    this.retryTimer = setTimeout(() => {
      // refresh token in case it was updated
      const token = useAuthStore.getState().token;
      if (!token) return;
      const basePath = this.url.split('?')[0].replace(WS_BASE, '');
      this.url = `${WS_BASE}${basePath}?token=${token}`;
      this.connect();
    }, delay);
  }
}
