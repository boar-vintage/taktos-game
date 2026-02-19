import type { ClientState } from '../types.js';

export function createInitialState(apiUrl: string, wsUrl: string): ClientState {
  return {
    apiUrl,
    wsUrl,
    token: null,
    user: null,
    worlds: [],
    currentWorld: null,
    places: [],
    currentPlace: null,
    jobs: [],
    activeMenu: null,
    onlineWorld: 0,
    onlinePlace: 0
  };
}
