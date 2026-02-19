import type { Job, Place, UserProfile, World } from '../types.js';

interface RequestOptions {
  method?: 'GET' | 'POST';
  token?: string | null;
  body?: unknown;
}

export class ApiClient {
  constructor(private apiUrl: string) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return res.json() as Promise<T>;
  }

  signup(input: { email: string; password: string; displayName: string; role: string }) {
    return this.request<{ token: string; user: UserProfile }>('/auth/signup', { method: 'POST', body: input });
  }

  login(input: { email: string; password: string }) {
    return this.request<{ token: string; user: UserProfile }>('/auth/login', { method: 'POST', body: input });
  }

  me(token: string) {
    return this.request<{ user: UserProfile }>('/auth/me', { token });
  }

  worlds() {
    return this.request<{ worlds: World[] }>('/worlds');
  }

  places(worldId: string) {
    return this.request<{ places: Place[] }>(`/worlds/${worldId}/places`);
  }

  place(placeId: string) {
    return this.request<{ place: Place }>(`/places/${placeId}`);
  }

  jobs(placeId: string, token: string) {
    return this.request<{ jobs: Job[] }>(`/places/${placeId}/jobs`, { token });
  }

  joinWorld(worldId: string, token: string) {
    return this.request<{ ok: boolean }>('/actions/join-world', { method: 'POST', token, body: { worldId } });
  }

  enterPlace(worldId: string, placeId: string, token: string) {
    return this.request<{ ok: boolean }>('/actions/enter-place', { method: 'POST', token, body: { worldId, placeId } });
  }

  leavePlace(worldId: string, token: string) {
    return this.request<{ ok: boolean }>('/actions/leave-place', { method: 'POST', token, body: { worldId } });
  }

  say(worldId: string, placeId: string, message: string, token: string) {
    return this.request<{ ok: boolean }>('/actions/say', { method: 'POST', token, body: { worldId, placeId, message } });
  }

  emote(worldId: string, placeId: string, emote: string, token: string) {
    return this.request<{ ok: boolean }>('/actions/emote', { method: 'POST', token, body: { worldId, placeId, emote } });
  }

  unlock(worldId: string, placeId: string, jobId: string, token: string) {
    return this.request<{ transaction: { id: string } }>('/actions/unlock', {
      method: 'POST',
      token,
      body: { worldId, placeId, jobId }
    });
  }

  simulatePayment(transactionId: string, token: string) {
    return this.request<{ ok: boolean; status: string }>(`/payments/simulate/${transactionId}`, {
      method: 'POST',
      token
    });
  }
}
