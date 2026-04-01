import WebSocket from 'ws';
import dotenv from 'dotenv';
import { ApiClient } from './api/client.js';
import { parseCommand } from './commands/parser.js';
import { HELP_TEXT } from './commands/help.js';
import { createInitialState } from './state/store.js';
import { createLayout } from './ui/layout.js';
import { loadToken, saveToken } from './utils/storage.js';
import type { MenuMode, NearbyUser, WsEvent } from './types.js';

dotenv.config();

const apiUrl = process.env.TAKTOS_API_URL ?? 'http://localhost:4000/api';
const wsUrl = process.env.TAKTOS_WS_URL ?? 'ws://localhost:4000/ws';

class TerminalClient {
  private api = new ApiClient(apiUrl);
  private ui = createLayout();
  private state = createInitialState(apiUrl, wsUrl);
  private ws: WebSocket | null = null;

  async start() {
    this.render();
    this.log('Booting Taktos Terminal...');

    this.state.token = await loadToken();

    if (this.state.token) {
      try {
        const me = await this.api.me(this.state.token);
        this.state.user = me.user;
      } catch {
        this.state.token = null;
        await saveToken(null);
      }
    }

    try {
      await this.bootstrapWorld();
      this.log('Connected to API.');
    } catch (error) {
      const message = (error as Error).message || 'unknown startup error';
      this.log(`{yellow-fg}Startup warning:{/yellow-fg} ${message}`);
      this.log('{yellow-fg}Backend may be offline. Start server with `pnpm dev` and run WORLD or MAP to retry.{/yellow-fg}');
    }

    this.render();
    this.log('Type HELP for commands.');

    this.ui.input.focus();
    this.ui.input.on('submit', async (value) => {
      this.ui.input.clearValue();
      this.ui.screen.render();
      await this.execute(value);
      this.ui.input.focus();
    });

    this.ui.screen.key('enter', () => {
      this.ui.input.submit();
    });
  }

  private async bootstrapWorld() {
    const worlds = await this.api.worlds();
    this.state.worlds = worlds.worlds;
    this.state.currentWorld = worlds.worlds.find((w) => w.is_core) ?? worlds.worlds[0] ?? null;

    if (this.state.currentWorld) {
      await this.refreshPlaces();
      if (this.state.token) {
        await this.api.joinWorld(this.state.currentWorld.id, this.state.token);
      }
      this.connectWs();
    }
  }

  private connectWs() {
    if (!this.state.token || !this.state.currentWorld) {
      return;
    }

    this.ws?.close();
    this.ws = new WebSocket(`${this.state.wsUrl}?token=${encodeURIComponent(this.state.token)}`);

    this.ws.on('open', () => {
      this.sendSubscription();
    });

    this.ws.on('message', (buf: import('ws').RawData) => {
      try {
        const data = JSON.parse(buf.toString()) as WsEvent;
        this.handleWs(data);
      } catch {
        this.log('{red-fg}Failed to parse websocket event{/red-fg}');
      }
    });

    this.ws.on('close', () => {
      this.log('{yellow-fg}Realtime disconnected{/yellow-fg}');
    });
  }

  private sendSubscription() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.state.currentWorld) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'subscribe',
        worldId: this.state.currentWorld.id,
        placeId: this.state.currentPlace?.id ?? null
      })
    );
  }

  private handleWs(event: WsEvent) {
    if (event.type === 'presence.snapshot') {
      this.state.onlineWorld = Number(event.payload.onlineWorld ?? 0);
      this.state.onlinePlace = Number(event.payload.onlinePlace ?? 0);
      this.render();
      return;
    }

    if (event.type === 'event') {
      const payload = event.payload;
      const type = String(payload.type ?? 'Event');
      const data = (payload.data ?? {}) as Record<string, unknown>;

      if (type === 'ChatMessageSent') {
        this.log(`{cyan-fg}[CHAT]{/cyan-fg} ${String(data.normalized ?? '')}`);
      } else if (type === 'TakTakSent') {
        this.log(`{magenta-fg}[TAK TAK]{/magenta-fg} ${String(data.toUserId ?? '')}`);
      } else if (type === 'ResumeDropped') {
        this.log(`{green-fg}[RESUME]{/green-fg} Resume dropped at ${String(data.placeId ?? '')}`);
      } else if (type === 'EmoteSent') {
        this.log(`{magenta-fg}[EMOTE]{/magenta-fg} ${String(data.emote ?? 'WAVE')}`);
      } else if (type === 'PlayerEnteredPlace') {
        this.log('{green-fg}[PRESENCE] Someone entered{/green-fg}');
      } else if (type === 'PlayerLeftPlace') {
        this.log('{yellow-fg}[PRESENCE] Someone left{/yellow-fg}');
      } else if (type === 'ContactUnlocked') {
        this.log('{green-fg}[UNLOCK] Contact unlocked{/green-fg}');
      }
    }
  }

  private async execute(raw: string) {
    const parsed = parseCommand(raw);
    const args = parsed.args;

    try {
      switch (parsed.name) {
        case 'HELP':
          this.log(HELP_TEXT.join('\n'));
          break;
        case 'SIGNUP':
          await this.handleSignup(args);
          break;
        case 'LOGIN':
          await this.handleLogin(args);
          break;
        case 'LOGOUT':
          await this.handleLogout();
          break;
        case 'WORLD':
          await this.handleWorld();
          break;
        case 'PORTAL':
          await this.handlePortal(args);
          break;
        case 'MAP':
          await this.handleMap();
          break;
        case 'ENTER':
          await this.handleEnter(args);
          break;
        case 'LEAVE':
          await this.handleLeave();
          break;
        case 'LOOK':
          await this.handleLook();
          break;
        case 'JOBS':
          await this.handleJobs();
          break;
        case 'WHO':
          await this.handleWho();
          break;
        case 'TAK':
          await this.handleTak(args);
          break;
        case 'DROP':
          await this.handleDrop();
          break;
        case 'SAY':
          await this.handleSay(args);
          break;
        case 'WAVE':
          await this.handleWave();
          break;
        case 'UNLOCK':
          await this.handleUnlock(args);
          break;
        case 'PROFILE':
          await this.handleProfile();
          break;
        case 'NUMERIC':
          await this.handleNumeric(args);
          break;
        default:
          this.log('{red-fg}Unknown command{/red-fg}');
      }
    } catch (error) {
      this.log(`{red-fg}Error:{/red-fg} ${(error as Error).message}`);
    }

    this.render();
  }

  private requireAuth() {
    if (!this.state.token) {
      throw new Error('Login required. Use LOGIN or SIGNUP first.');
    }
    return this.state.token;
  }

  private async handleSignup(args: string[]) {
    if (args.length < 3) {
      this.log('Usage: SIGNUP <email> <password> <display_name> [role]');
      return;
    }

    const [email, password, displayName, roleInput] = args as [string, string, string, string?];
    const allowedRoles = new Set(['jobseeker', 'employer', 'recruiter', 'admin']);
    const normalizedRole = (roleInput ?? 'jobseeker').toLowerCase();
    const role = allowedRoles.has(normalizedRole) ? normalizedRole : 'jobseeker';
    const res = await this.api.signup({ email, password, displayName, role });
    this.state.token = res.token;
    this.state.user = res.user;
    await saveToken(res.token);
    this.log(`Signed up as ${res.user.display_name}`);

    if (this.state.currentWorld) {
      await this.api.joinWorld(this.state.currentWorld.id, res.token);
      this.connectWs();
    }
  }

  private async handleLogin(args: string[]) {
    if (args.length < 2) {
      this.log('Usage: LOGIN <email> <password>');
      return;
    }

    const [email, password] = args as [string, string];
    const res = await this.api.login({ email, password });
    this.state.token = res.token;
    this.state.user = res.user;
    await saveToken(res.token);
    this.log(`Logged in as ${res.user.display_name}`);

    if (this.state.currentWorld) {
      await this.api.joinWorld(this.state.currentWorld.id, res.token);
      this.connectWs();
    }
  }

  private async handleLogout() {
    this.state.token = null;
    this.state.user = null;
    await saveToken(null);
    this.ws?.close();
    this.ws = null;
    this.log('Logged out');
  }

  private async handleWorld() {
    const worlds = await this.api.worlds();
    this.state.worlds = worlds.worlds;
    this.state.activeMenu = 'worlds';
    this.log(worlds.worlds.map((w, i) => `${i + 1}. ${w.name} (${w.slug})`).join('\n'));
  }

  private async handlePortal(args: string[]) {
    if (!args.length) {
      this.log('Usage: PORTAL <world#>');
      return;
    }

    const idx = Number(args[0]) - 1;
    const world = this.state.worlds[idx];
    if (!world) {
      this.log('Invalid world index');
      return;
    }

    this.state.currentWorld = world;
    this.state.currentPlace = null;
    this.state.jobs = [];
    await this.refreshPlaces();

    if (this.state.token) {
      await this.api.joinWorld(world.id, this.state.token);
      this.connectWs();
    }

    this.log(`Portaled to ${world.name}`);
  }

  private async handleMap() {
    await this.refreshPlaces();
    this.state.activeMenu = 'places';
    this.log(this.state.places.map((p, i) => `${i + 1}. ${p.name} [${p.online_count} online]`).join('\n'));
  }

  private async handleEnter(args: string[]) {
    if (!args.length) {
      this.log('Usage: ENTER <place#>');
      return;
    }

    const idx = Number(args[0]) - 1;
    const place = this.state.places[idx];
    if (!place || !this.state.currentWorld) {
      this.log('Invalid place index');
      return;
    }

    const token = this.requireAuth();
    await this.api.enterPlace(this.state.currentWorld.id, place.id, token);
    this.state.currentPlace = place;
    this.sendSubscription();
    this.log(`Entered ${place.name}`);
  }

  private async handleLeave() {
    if (!this.state.currentWorld) {
      return;
    }

    const token = this.requireAuth();
    await this.api.leavePlace(this.state.currentWorld.id, token);
    this.state.currentPlace = null;
    this.state.jobs = [];
    this.sendSubscription();
    this.log('Left current place');
  }

  private async handleLook() {
    if (!this.state.currentPlace) {
      this.log('Not inside a place');
      return;
    }

    const place = await this.api.place(this.state.currentPlace.id);
    this.log(`${place.place.name}\n${place.place.description}\n${place.place.address_text}`);
  }

  private async handleJobs() {
    if (!this.state.currentPlace) {
      this.log('Enter a place first');
      return;
    }

    const token = this.requireAuth();
    const jobs = await this.api.jobs(this.state.currentPlace.id, token);
    this.state.jobs = jobs.jobs;
    this.state.activeMenu = 'jobs';
    this.log(jobs.jobs.map((j, i) => `${i + 1}. ${j.title} - ${j.location_text}`).join('\n') || 'No jobs');
  }

  private async handleSay(args: string[]) {
    if (!this.state.currentWorld || !this.state.currentPlace) {
      this.log('Enter a place first');
      return;
    }

    const msg = args[0] ?? '';
    if (!msg) {
      this.log('Usage: SAY <msg>');
      return;
    }

    const token = this.requireAuth();
    await this.api.say(this.state.currentWorld.id, this.state.currentPlace.id, msg, token);
  }

  private async handleWho() {
    if (!this.state.currentWorld) {
      this.log('Not in a world');
      return;
    }

    const token = this.requireAuth();
    const result = await this.api.presence(
      this.state.currentWorld.id,
      token,
      this.state.currentPlace?.id
    );
    this.state.nearbyUsers = result.users as NearbyUser[];
    this.state.activeMenu = 'who';

    if (!result.users.length) {
      this.log('No one nearby right now.');
      return;
    }

    this.log(result.users.map((u, i) => `${i + 1}. ${u.display_name} (${u.role})`).join('\n'));
  }

  private async handleTak(args: string[]) {
    if (!this.state.currentWorld) {
      this.log('Not in a world');
      return;
    }

    if (!args.length) {
      this.log('Usage: TAK <who#>  (run WHO first to list nearby users)');
      return;
    }

    const idx = Number(args[0]) - 1;
    const target = this.state.nearbyUsers[idx];
    if (!target) {
      this.log('Invalid user index. Run WHO to refresh the list.');
      return;
    }

    const token = this.requireAuth();
    await this.api.takTak(
      this.state.currentWorld.id,
      target.id,
      token,
      this.state.currentPlace?.id
    );
    this.log(`Tak tak → ${target.display_name}`);
  }

  private async handleDrop() {
    if (!this.state.currentWorld || !this.state.currentPlace) {
      this.log('Enter a place first');
      return;
    }

    const token = this.requireAuth();
    await this.api.dropResume(this.state.currentWorld.id, this.state.currentPlace.id, token);
    this.log(`Resume dropped at ${this.state.currentPlace.name}`);
  }

  private async handleWave() {
    if (!this.state.currentWorld || !this.state.currentPlace) {
      this.log('Enter a place first');
      return;
    }

    const token = this.requireAuth();
    await this.api.emote(this.state.currentWorld.id, this.state.currentPlace.id, 'WAVE', token);
  }

  private async handleUnlock(args: string[]) {
    if (!this.state.currentWorld || !this.state.currentPlace) {
      this.log('Enter a place first');
      return;
    }

    if (!args.length) {
      this.log('Usage: UNLOCK <job#>');
      return;
    }

    const idx = Number(args[0]) - 1;
    const job = this.state.jobs[idx];
    if (!job) {
      this.log('Invalid job index');
      return;
    }

    const token = this.requireAuth();
    const res = await this.api.unlock(this.state.currentWorld.id, this.state.currentPlace.id, job.id, token);
    await this.api.simulatePayment(res.transaction.id, token);
    this.log(`Unlock completed for ${job.title}`);
  }

  private async handleProfile() {
    const token = this.requireAuth();
    const me = await this.api.me(token);
    this.state.user = me.user;
    this.log(`User: ${me.user.display_name} (${me.user.role}) trust=${me.user.trust_score ?? '-'} fraud=${me.user.fraud_score ?? '-'}`);
  }

  private async handleNumeric(args: string[]) {
    const value = Number(args[0]);
    if (!Number.isFinite(value) || value < 1) {
      return;
    }

    switch (this.state.activeMenu as MenuMode) {
      case 'places':
        await this.handleEnter([String(value)]);
        break;
      case 'worlds':
        await this.handlePortal([String(value)]);
        break;
      case 'jobs':
        await this.handleUnlock([String(value)]);
        break;
      case 'who':
        await this.handleTak([String(value)]);
        break;
      default:
        this.log('No active menu for numeric shortcut');
    }
  }

  private async refreshPlaces() {
    if (!this.state.currentWorld) {
      return;
    }

    const places = await this.api.places(this.state.currentWorld.id);
    this.state.places = places.places;
  }

  private render() {
    const world = this.state.currentWorld?.name ?? 'none';
    const place = this.state.currentPlace?.name ?? 'none';
    const user = this.state.user?.display_name ?? 'guest';

    this.ui.header.setContent(` {bold}Taktos Core{/bold} | User: ${user} | World: ${world} | Place: ${place} `);
    this.ui.side.setContent(
      [
        '{bold}State{/bold}',
        `World: ${world}`,
        `Place: ${place}`,
        `Online world: ${this.state.onlineWorld}`,
        `Online place: ${this.state.onlinePlace}`,
        `Places loaded: ${this.state.places.length}`,
        `Jobs loaded: ${this.state.jobs.length}`,
        `Nearby users: ${this.state.nearbyUsers.length}`,
        `Active menu: ${this.state.activeMenu ?? '-'}`
      ].join('\n')
    );

    this.ui.screen.render();
  }

  private log(message: string) {
    this.ui.log.log(message);
    this.ui.screen.render();
  }
}

new TerminalClient().start().catch((error) => {
  console.error(error);
  process.exit(1);
});
