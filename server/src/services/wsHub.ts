import { WebSocketServer, WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import type { AppEvent } from './events.js';

interface ClientState {
  socket: WebSocket;
  userId: string;
  worldId: string | null;
  placeId: string | null;
}

interface WsIncoming {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  worldId?: string;
  placeId?: string | null;
}

export class WsHub {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientState>();

  constructor(app: FastifyInstance) {
    this.wss = new WebSocketServer({ noServer: true });

    app.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', 'http://localhost');
      if (url.pathname !== '/ws') {
        return;
      }

      this.wss.handleUpgrade(request, socket, head, async (ws) => {
        try {
          const token = url.searchParams.get('token');
          if (!token) {
            ws.close(1008, 'Missing token');
            return;
          }

          const decoded = await app.jwt.verify<{ userId: string }>(token);
          const state: ClientState = {
            socket: ws,
            userId: decoded.userId,
            worldId: null,
            placeId: null
          };

          this.clients.set(ws, state);
          ws.send(JSON.stringify({ type: 'connected', payload: { userId: decoded.userId } }));

          ws.on('message', (raw) => this.handleMessage(ws, raw.toString()));
          ws.on('close', () => this.clients.delete(ws));
        } catch {
          ws.close(1008, 'Invalid token');
        }
      });
    });
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    const state = this.clients.get(ws);
    if (!state) {
      return;
    }

    let payload: WsIncoming;
    try {
      payload = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }));
      return;
    }

    if (payload.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', payload: { at: new Date().toISOString() } }));
      return;
    }

    if (payload.type === 'subscribe' && payload.worldId) {
      state.worldId = payload.worldId;
      state.placeId = payload.placeId ?? null;

      const counts = await this.fetchCounts(state.worldId, state.placeId);
      ws.send(JSON.stringify({ type: 'presence.snapshot', payload: counts }));
      return;
    }

    if (payload.type === 'unsubscribe') {
      state.worldId = null;
      state.placeId = null;
      ws.send(JSON.stringify({ type: 'unsubscribed', payload: {} }));
    }
  }

  async fetchCounts(worldId: string, placeId: string | null) {
    const worldCount = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM presence WHERE world_id = $1 AND status = 'online'",
      [worldId]
    );

    const placeCountRows = placeId
      ? await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM presence WHERE place_id = $1 AND status = 'online'",
          [placeId]
        )
      : { rows: [{ count: '0' }] };

    return {
      worldId,
      placeId,
      onlineWorld: Number(worldCount.rows[0]?.count ?? '0'),
      onlinePlace: Number(placeCountRows.rows[0]?.count ?? '0')
    };
  }

  broadcast(event: AppEvent): void {
    for (const state of this.clients.values()) {
      const inWorld = state.worldId === event.world_id;
      const inPlace = !event.place_id || state.placeId === event.place_id;

      if (inWorld && inPlace && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(
          JSON.stringify({
            type: 'event',
            payload: {
              id: event.id,
              type: event.type,
              worldId: event.world_id,
              placeId: event.place_id,
              userId: event.user_id,
              data: event.payload_json,
              createdAt: event.created_at
            }
          })
        );
      }
    }
  }
}
