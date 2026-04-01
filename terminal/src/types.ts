export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: string;
  fraud_score?: string;
  trust_score?: string;
}

export interface World {
  id: string;
  slug: string;
  name: string;
  is_core: boolean;
  status: string;
}

export interface Place {
  id: string;
  world_id: string;
  name: string;
  description: string;
  address_text: string;
  is_featured: boolean;
  online_count: number;
}

export interface Job {
  id: string;
  place_id: string;
  title: string;
  description: string;
  location_text: string;
  is_active: boolean;
}

export interface NearbyUser {
  id: string;
  display_name: string;
  role: string;
}

export type MenuMode = 'places' | 'worlds' | 'jobs' | 'who' | null;

export interface ClientState {
  apiUrl: string;
  wsUrl: string;
  token: string | null;
  user: UserProfile | null;
  worlds: World[];
  currentWorld: World | null;
  places: Place[];
  currentPlace: Place | null;
  jobs: Job[];
  nearbyUsers: NearbyUser[];
  activeMenu: MenuMode;
  onlineWorld: number;
  onlinePlace: number;
}

export interface WsEvent {
  type: string;
  payload: Record<string, unknown>;
}
