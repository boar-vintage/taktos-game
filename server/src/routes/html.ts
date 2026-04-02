import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { appendEvent } from '../services/events.js';
import { createUnlockTransaction, getCoreWorldId } from '../services/gameplay.js';
import { authenticateHtmlCookie, buildClearedJwtCookie, buildJwtCookie } from '../services/html/auth.js';
import { markHtmlPresenceOnline, touchPresenceLastSeen } from '../services/html/presence.js';
import { e, link, page } from '../services/html/render.js';
import { buildSignedPath, verifySignedActionToken } from '../services/html/signedLinks.js';
import { isUserBlocked } from '../services/adminAccess.js';
import { findCity, getCityBySlug, SUPPORTED_CITIES, wayfinding } from '../services/location/cities.js';
import { getOrCreateCityWorld, getUserHomeCoords, getUserHomeWorldSlug, importBusinessesForCity, isUserHomeWorldPinned, pinUserHomeWorld, setUserHomeCoords, setUserHomeWorld } from '../services/location/businessImport.js';
import { hashPassword, verifyPassword } from '../utils/auth.js';
import { sanitizeChatInput } from '../utils/sanitize.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(2).max(50)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const idSchema = z.string().uuid();

const sayKeys = {
  hello: 'hello',
  hiring: 'are you hiring?',
  intro: 'nice to meet you'
} as const;

type SayKey = keyof typeof sayKeys;

const dmKeys = {
  are_you_hiring: 'Are you hiring right now?',
  send_resume: 'I can send my resume today.',
  schedule_chat: 'Want to schedule a quick chat?'
} as const;

type DmKey = keyof typeof dmKeys;

function resolveWorldMainstreetPath(slug: string): string {
  return `/html/world/${encodeURIComponent(slug)}/mainstreet`;
}

function toSecondsInterval(value: number): string {
  return `${Math.max(60, Math.min(120, value))}`;
}

function ensureHtml(reply: import('fastify').FastifyReply): void {
  reply.type('text/html; charset=utf-8');
}

function buildLogoImg(logoUrl: string | null, websiteUrl: string | null, size: number, style: string): string {
  let faviconUrl: string | null = null;
  if (websiteUrl) {
    try {
      const hostname = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname;
      faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
    } catch { /* ignore bad URLs */ }
  }

  const src = logoUrl ?? faviconUrl;
  if (!src) return '';

  const fallback = logoUrl && faviconUrl
    ? `this.onerror=null;this.src='${faviconUrl}'`
    : 'this.remove()';

  return `<img src="${e(src)}" width="${size}" height="${size}" alt="" style="${e(style)}" onerror="${e(fallback)}">`;
}

function safeRedirectPath(input: string | undefined, fallback: string): string {
  if (!input) {
    return fallback;
  }

  if (!input.startsWith('/html/')) {
    return fallback;
  }

  return input;
}

function getSignedActionLink(input: {
  path: string;
  userId: string;
  action: string;
  params: Record<string, string>;
}): string {
  return buildSignedPath({
    path: input.path,
    userId: input.userId,
    action: input.action,
    params: input.params,
    secret: env.ACTION_LINK_SECRET,
    ttlSeconds: 60
  });
}

function validateSignature(input: {
  userId: string;
  action: string;
  params: Record<string, string>;
  exp: string | undefined;
  sig: string | undefined;
}): boolean {
  if (!input.exp || !input.sig) {
    return false;
  }

  const expNum = Number(input.exp);
  if (!Number.isFinite(expNum)) {
    return false;
  }

  return verifySignedActionToken({
    userId: input.userId,
    action: input.action,
    params: input.params,
    exp: expNum,
    sig: input.sig,
    secret: env.ACTION_LINK_SECRET
  });
}

async function getWorldBySlug(slug: string) {
  const world = await pool.query<{ id: string; slug: string; name: string }>(
    'SELECT id, slug, name FROM worlds WHERE slug = $1 LIMIT 1',
    [slug]
  );
  return world.rows[0] ?? null;
}

async function getCurrentPresence(userId: string): Promise<{ world_id: string; place_id: string | null } | null> {
  const presence = await pool.query<{ world_id: string; place_id: string | null }>(
    'SELECT world_id, place_id FROM presence WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return presence.rows[0] ?? null;
}

function formatPlaceEvent(row: {
  type: string;
  payload_json: Record<string, unknown>;
  display_name: string | null;
  created_at: string;
}): string {
  const name = row.display_name ?? 'Someone';
  const payload = row.payload_json;

  if (row.type === 'ChatMessageSent') {
    return `${name}: ${String(payload.normalized ?? payload.raw ?? '')}`;
  }

  if (row.type === 'EmoteSent') {
    return `${name} ${String(payload.emote ?? 'WAVE')}`;
  }

  if (row.type === 'ContactUnlockRequested') {
    return `${name} started a contact unlock`;
  }

  if (row.type === 'ContactUnlocked') {
    return `${name} unlocked contact access`;
  }

  if (row.type === 'TakTakSent') {
    return `${name} sent a tak tak`;
  }

  if (row.type === 'ResumeDropped') {
    return `${name} dropped a resume here`;
  }

  if (row.type === 'DMMessageSent') {
    return `${name} sent a private message`;
  }

  return `${name} did ${row.type}`;
}

const htmlRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    const isPublic = path === '/html/login' || path === '/html/signup' || path === '/html/logout';
    if (isPublic) {
      return;
    }

    const ok = await authenticateHtmlCookie({ app, request, reply });
    if (!ok) {
      return;
    }

    await touchPresenceLastSeen(request.user.userId);
  });

  app.get('/html/login', async (request, reply) => {
    ensureHtml(reply);
    const next = safeRedirectPath((request.query as { next?: string } | undefined)?.next, '/html');
    return page('Blue Link City Login', [
      '<h1>Blue Link City</h1>',
      '<h2>Login</h2>',
      `<form method="POST" action="/html/login?next=${encodeURIComponent(next)}">`,
      '<p><label>Email <input type="email" name="email" required /></label></p>',
      '<p><label>Password <input type="password" name="password" required /></label></p>',
      '<p><button type="submit">Login</button></p>',
      '</form>',
      `<p>${link('/html/signup', 'Create account')}</p>`
    ]);
  });

  app.post('/html/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body ?? {});
    if (!body.success) {
      ensureHtml(reply);
      reply.code(400);
      return page('Login Failed', ['<h1>Login failed</h1>', `<p>${link('/html/login', 'Try again')}</p>`]);
    }

    const user = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      password_hash: string;
    }>('SELECT id, email, display_name, role, password_hash FROM users WHERE email = $1', [body.data.email.toLowerCase()]);

    if (!user.rowCount || !(await verifyPassword(body.data.password, user.rows[0]!.password_hash))) {
      ensureHtml(reply);
      reply.code(401);
      return page('Login Failed', ['<h1>Invalid credentials</h1>', `<p>${link('/html/login', 'Try again')}</p>`]);
    }

    if (await isUserBlocked(user.rows[0]!.id)) {
      ensureHtml(reply);
      reply.code(403);
      return page('Account Blocked', ['<h1>Account blocked by admin</h1>', `<p>${link('/html/login', 'Back to login')}</p>`]);
    }

    const token = await reply.jwtSign({
      userId: user.rows[0]!.id,
      email: user.rows[0]!.email,
      role: user.rows[0]!.role
    });

    reply.header('Set-Cookie', buildJwtCookie(token));
    reply.code(302).header('Location', safeRedirectPath((request.query as { next?: string } | undefined)?.next, '/html')).send();
  });

  app.get('/html/signup', async (_request, reply) => {
    ensureHtml(reply);
    return page('Blue Link City Signup', [
      '<h1>Blue Link City</h1>',
      '<h2>Sign up</h2>',
      '<form method="POST" action="/html/signup">',
      '<p><label>Email <input type="email" name="email" required /></label></p>',
      '<p><label>Password <input type="password" name="password" required /></label></p>',
      '<p><label>Display name <input type="text" name="display_name" required /></label></p>',
      '<p><button type="submit">Create account</button></p>',
      '</form>',
      `<p>${link('/html/login', 'Back to login')}</p>`
    ]);
  });

  app.post('/html/signup', async (request, reply) => {
    const body = signupSchema.safeParse(request.body ?? {});
    if (!body.success) {
      ensureHtml(reply);
      reply.code(400);
      return page('Signup Failed', ['<h1>Signup failed</h1>', `<p>${link('/html/signup', 'Try again')}</p>`]);
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [body.data.email.toLowerCase()]);
    if (existing.rowCount) {
      ensureHtml(reply);
      reply.code(409);
      return page('Signup Failed', ['<h1>Email already registered</h1>', `<p>${link('/html/login', 'Login instead')}</p>`]);
    }

    const passwordHash = await hashPassword(body.data.password);
    const created = await pool.query<{ id: string; email: string; role: string }>(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'jobseeker')
       RETURNING id, email, role`,
      [body.data.email.toLowerCase(), passwordHash, body.data.display_name]
    );

    const token = await reply.jwtSign({
      userId: created.rows[0]!.id,
      email: created.rows[0]!.email,
      role: created.rows[0]!.role
    });

    reply.header('Set-Cookie', buildJwtCookie(token));
    reply.code(302).header('Location', '/html').send();
  });

  app.get('/html/logout', async (_request, reply) => {
    reply.header('Set-Cookie', buildClearedJwtCookie());
    reply.code(302).header('Location', '/html/login').send();
  });

  app.get('/html', async (request, reply) => {
    const homeSlug = await getUserHomeWorldSlug(request.user.userId);
    if (homeSlug) {
      reply.code(302).header('Location', resolveWorldMainstreetPath(homeSlug)).send();
    } else {
      reply.code(302).header('Location', '/html/locate').send();
    }
  });

  app.get('/html/locate', async (_request, reply) => {
    ensureHtml(reply);
    const cityButtons = SUPPORTED_CITIES.map(
      (c) => `<p><button name="city" value="${e(c.slug)}">${e(c.name)}</button></p>`
    ).join('');
    return page('Blue Link City — Find Your City', [
      '<h1>Blue Link City</h1>',
      '<h2>Finding businesses near you&hellip;</h2>',
      '<p id="status">Requesting your location&hellip;</p>',
      '<form id="loc-form" method="POST" action="/html/locate">',
      '<input type="hidden" name="lat" id="lat" />',
      '<input type="hidden" name="lon" id="lon" />',
      '</form>',
      `<form id="city-form" method="POST" action="/html/locate" style="display:none">`,
      '<p>Or choose your city:</p>',
      cityButtons,
      '</form>',
      `<script>
(function () {
  if (!navigator.geolocation) {
    document.getElementById('status').textContent = 'Geolocation not supported. Choose your city:';
    document.getElementById('city-form').style.display = '';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      document.getElementById('lat').value = pos.coords.latitude;
      document.getElementById('lon').value = pos.coords.longitude;
      document.getElementById('status').textContent = 'Got your location! Loading\u2026';
      document.getElementById('loc-form').submit();
    },
    function () {
      document.getElementById('status').textContent = 'Location access denied. Choose your city:';
      document.getElementById('city-form').style.display = '';
    }
  );
}());
</script>`,
    ]);
  });

  app.post('/html/locate', async (request, reply) => {
    ensureHtml(reply);
    const body = request.body as Record<string, string> | undefined ?? {};

    let city = null;

    if (body.city) {
      city = getCityBySlug(body.city);
    } else if (body.lat && body.lon) {
      const lat = parseFloat(body.lat);
      const lon = parseFloat(body.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        reply.code(400);
        return page('Bad Request', ['<h1>Invalid coordinates</h1>', `<p>${link('/html/locate', 'Try again')}</p>`]);
      }
      city = findCity(lat, lon);
    }

    if (!city) {
      reply.code(200);
      return page('Not in your area yet', [
        '<h1>Blue Link City</h1>',
        '<h2>We&rsquo;re not in your area yet</h2>',
        '<p>Blue Link City is currently available in Los Angeles, San Diego, and Austin.</p>',
        `<p>${link('/html/locate', 'Try again')}</p>`,
      ]);
    }

    const worldId = await getOrCreateCityWorld(city);

    const userLat = body.lat ? parseFloat(body.lat) : city.lat;
    const userLon = body.lon ? parseFloat(body.lon) : city.lon;
    await importBusinessesForCity(city, worldId, userLat, userLon);

    await setUserHomeWorld(request.user.userId, worldId);
    await setUserHomeCoords(request.user.userId, userLat, userLon);
    await pinUserHomeWorld(request.user.userId, 60);

    reply.code(302).header('Location', resolveWorldMainstreetPath(city.slug)).send();
  });

  app.post('/html/update-location', async (request, reply) => {
    const body = request.body as Record<string, string> | undefined ?? {};
    const lat = parseFloat(body.lat ?? '');
    const lon = parseFloat(body.lon ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      reply.code(400).send('bad');
      return;
    }

    await setUserHomeCoords(request.user.userId, lat, lon);

    const pinned = await isUserHomeWorldPinned(request.user.userId);
    if (!pinned) {
      const newCity = findCity(lat, lon);
      if (newCity) {
        const worldId = await getOrCreateCityWorld(newCity);
        const currentSlug = await getUserHomeWorldSlug(request.user.userId);
        if (newCity.slug !== currentSlug) {
          await importBusinessesForCity(newCity, worldId, lat, lon);
          await setUserHomeWorld(request.user.userId, worldId);
          reply.code(200).send(`relocate:${resolveWorldMainstreetPath(newCity.slug)}`);
          return;
        }
      }
    }

    reply.code(200).send('ok');
  });

  app.get('/html/world/:worldSlug/mainstreet', async (request, reply) => {
    const params = request.params as { worldSlug: string };
    const world = await getWorldBySlug(params.worldSlug);
    if (!world) {
      ensureHtml(reply);
      reply.code(404);
      return page('World Not Found', ['<h1>World not found</h1>', `<p>${link('/html', 'Home')}</p>`]);
    }

    await markHtmlPresenceOnline({ userId: request.user.userId, worldId: world.id, placeId: null });

    const onlineWindow = toSecondsInterval(env.HTML_ONLINE_WINDOW_SECONDS);

    const places = await pool.query<{
      id: string;
      name: string;
      online_count: number;
      biz_lat: number | null;
      biz_lon: number | null;
      logo_url: string | null;
      website_url: string | null;
    }>(
      `SELECT p.id, p.name,
              COUNT(pr.user_id) FILTER (
                WHERE pr.status = 'online' AND pr.last_seen_at > NOW() - ($2 || ' seconds')::interval
              )::int AS online_count,
              b.latitude  AS biz_lat,
              b.longitude AS biz_lon,
              b.logo_url,
              b.website_url
       FROM places p
       LEFT JOIN presence pr ON pr.place_id = p.id
       LEFT JOIN businesses b ON b.id = p.business_id
       WHERE p.world_id = $1
       GROUP BY p.id, b.latitude, b.longitude, b.logo_url, b.website_url
       ORDER BY p.is_featured DESC, p.created_at ASC`,
      [world.id, onlineWindow]
    );

    const userCoords = await getUserHomeCoords(request.user.userId);

    const nearby = await pool.query<{ id: string; display_name: string }>(
      `SELECT u.id, u.display_name
       FROM presence pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.world_id = $1
         AND pr.place_id IS NULL
         AND pr.status = 'online'
         AND pr.last_seen_at > NOW() - ($3 || ' seconds')::interval
         AND pr.user_id <> $2
       ORDER BY pr.last_seen_at DESC`,
      [world.id, request.user.userId, onlineWindow]
    );

    const selfPath = resolveWorldMainstreetPath(world.slug);
    const wave = getSignedActionLink({
      path: '/html/act/wave',
      userId: request.user.userId,
      action: 'wave',
      params: { ctx: 'mainstreet', next: selfPath }
    });

    const say = getSignedActionLink({
      path: '/html/act/say',
      userId: request.user.userId,
      action: 'say',
      params: { msg: 'hello', ctx: 'mainstreet', next: selfPath }
    });

    ensureHtml(reply);
    return page('Blue Link City Main Street', [
      '<h1>Blue Link City</h1>',
      `<p>You are on Main Street (${e(world.name)}).</p>`,
      `<p>${request.user.role === 'admin' ? `${link('/admin', 'Admin Control Center')} | ` : ''}${link('/html/logout', 'Logout')}</p>`,
      '<h2>Places</h2>',
      `<ul>${places.rows
        .map((p) => {
          const logo = buildLogoImg(p.logo_url, p.website_url, 20, 'border-radius:3px;vertical-align:middle;margin-right:4px');
          const way = (userCoords && p.biz_lat != null && p.biz_lon != null)
            ? ` <small>${e(wayfinding(userCoords.lat, userCoords.lon, p.biz_lat, p.biz_lon))}</small>`
            : '';
          return `<li>${logo}${link(`/html/place/${p.id}`, `${p.name} (${p.online_count} online)`)}${way}</li>`;
        })
        .join('')}</ul>`,
      '<h2>People nearby</h2>',
      nearby.rows.length
        ? `<ul>${nearby.rows
            .map((person) => `<li>${link(`/html/talk/choose?to=${person.id}&next=${encodeURIComponent(selfPath)}`, `Tak tak → ${person.display_name}`)}</li>`)
            .join('')}</ul>`
        : '<p>No one nearby right now.</p>',
      '<h2>Actions</h2>',
      `<ul><li>${link(wave, 'Wave')}</li><li>${link(say, 'Say: "hello"')}</li></ul>`,
      `<p>${link(selfPath, 'Refresh')} | ${link('/html/debug/location', 'Change location')}</p>`,
      `<script>
(function () {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      fetch('/html/update-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude
      })
      .then(function (r) { return r.text(); })
      .then(function (t) { if (t.startsWith('relocate:')) window.location.href = t.slice(9); })
      .catch(function () {});
    },
    function () {},
    { maximumAge: 300000, timeout: 10000 }
  );
}());
</script>`,
    ]);
  });

  app.get('/html/debug/location', async (request, reply) => {
    ensureHtml(reply);
    const coords = await getUserHomeCoords(request.user.userId);
    const homeSlug = await getUserHomeWorldSlug(request.user.userId);
    const cityButtons = SUPPORTED_CITIES.map(
      (c) => `<p><button name="city" value="${e(c.slug)}">${e(c.name)} (${c.lat}, ${c.lon})</button></p>`
    ).join('');
    return page('Debug: Change Location', [
      '<h1>Debug: Change Location</h1>',
      `<p>Current: <code>${coords ? `${coords.lat}, ${coords.lon}` : 'not set'}</code> | World: <code>${e(homeSlug ?? 'none')}</code></p>`,
      '<h2>Enter coordinates</h2>',
      '<form method="POST" action="/html/locate">',
      '<p><label>Latitude <input type="number" name="lat" step="any" value="" style="width:160px" /></label></p>',
      '<p><label>Longitude <input type="number" name="lon" step="any" value="" style="width:160px" /></label></p>',
      '<p><button type="submit">Set location</button></p>',
      '</form>',
      '<h2>Jump to city center</h2>',
      `<form method="POST" action="/html/locate">${cityButtons}</form>`,
      `<p>${link('/html', 'Back')}</p>`,
    ]);
  });

  app.get('/html/place/:placeId', async (request, reply) => {
    const params = request.params as { placeId: string };
    if (!idSchema.safeParse(params.placeId).success) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Invalid place id</h1>']);
    }

    const place = await pool.query<{
      id: string;
      name: string;
      description: string;
      world_id: string;
      world_slug: string;
      world_name: string;
      logo_url: string | null;
      website_url: string | null;
    }>(
      `SELECT p.id, p.name, p.description, p.world_id, w.slug AS world_slug, w.name AS world_name,
              b.logo_url, b.website_url
       FROM places p
       JOIN worlds w ON w.id = p.world_id
       LEFT JOIN businesses b ON b.id = p.business_id
       WHERE p.id = $1`,
      [params.placeId]
    );

    if (!place.rowCount) {
      ensureHtml(reply);
      reply.code(404);
      return page('Place Not Found', ['<h1>Place not found</h1>', `<p>${link('/html', 'Home')}</p>`]);
    }

    const row = place.rows[0]!;
    await markHtmlPresenceOnline({ userId: request.user.userId, worldId: row.world_id, placeId: row.id });

    const onlineWindow = toSecondsInterval(env.HTML_ONLINE_WINDOW_SECONDS);

    const peopleHere = await pool.query<{ id: string; display_name: string }>(
      `SELECT u.id, u.display_name
       FROM presence pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.place_id = $1
         AND pr.status = 'online'
         AND pr.last_seen_at > NOW() - ($3 || ' seconds')::interval
         AND pr.user_id <> $2
       ORDER BY pr.last_seen_at DESC`,
      [row.id, request.user.userId, onlineWindow]
    );

    const events = await pool.query<{
      id: number;
      type: string;
      payload_json: Record<string, unknown>;
      created_at: string;
      display_name: string | null;
    }>(
      `SELECT e.id, e.type, e.payload_json, e.created_at, u.display_name
       FROM events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.place_id = $1
         AND e.type IN ('ChatMessageSent', 'EmoteSent', 'TakTakSent', 'ResumeDropped', 'ContactUnlockRequested', 'ContactUnlocked', 'DMMessageSent')
       ORDER BY e.id DESC
       LIMIT 20`,
      [row.id]
    );

    const jobs = await pool.query<{ id: string; title: string }>(
      `SELECT id, title
       FROM jobs
       WHERE place_id = $1 AND is_active = TRUE
       ORDER BY created_at ASC`,
      [row.id]
    );

    const back = resolveWorldMainstreetPath(row.world_slug);
    const selfPath = `/html/place/${row.id}`;

    const wave = getSignedActionLink({
      path: '/html/act/wave',
      userId: request.user.userId,
      action: 'wave',
      params: { ctx: 'place', placeId: row.id, next: selfPath }
    });
    const say = getSignedActionLink({
      path: '/html/act/say',
      userId: request.user.userId,
      action: 'say',
      params: { msg: 'hiring', ctx: 'place', placeId: row.id, next: selfPath }
    });
    const dropResume = getSignedActionLink({
      path: '/html/act/drop-resume',
      userId: request.user.userId,
      action: 'drop-resume',
      params: { placeId: row.id, worldId: row.world_id, next: selfPath }
    });

    const logoImg = buildLogoImg(row.logo_url, row.website_url, 64, 'border-radius:8px;display:block;margin-bottom:0.5rem');
    const websiteLink = row.website_url
      ? `<p><a href="${e(row.website_url)}" rel="noopener noreferrer">${e(row.website_url)}</a></p>`
      : '';

    ensureHtml(reply);
    return page(`Place: ${row.name}`, [
      logoImg,
      `<h1>${e(row.name)}</h1>`,
      websiteLink,
      `<p>${e(row.description)}</p>`,
      `<p>${link(back, 'Back to Main Street')}</p>`,
      '<h2>People here now</h2>',
      peopleHere.rows.length
        ? `<ul>${peopleHere.rows
            .map((person) => `<li>${link(`/html/talk/choose?to=${person.id}&next=${encodeURIComponent(selfPath)}`, `Tak tak → ${person.display_name}`)}</li>`)
            .join('')}</ul>`
        : '<p>No one else here now.</p>',
      '<h2>Recent events</h2>',
      events.rows.length
        ? `<ul>${events.rows.map((evt) => `<li>${e(formatPlaceEvent(evt))}</li>`).join('')}</ul>`
        : '<p>No recent events.</p>',
      '<h2>Jobs</h2>',
      jobs.rows.length
        ? `<ul>${jobs.rows.map((job) => `<li>${link(`/html/job/${job.id}`, job.title)}</li>`).join('')}</ul>`
        : '<p>No active jobs.</p>',
      '<h2>Actions</h2>',
      `<ul><li>${link(wave, 'Wave')}</li><li>${link(say, 'Say: "are you hiring?"')}</li><li>${link(dropResume, 'Drop resume here')}</li></ul>`,
      `<p>${link(selfPath, 'Refresh')}</p>`
    ]);
  });

  app.get('/html/job/:jobId', async (request, reply) => {
    const params = request.params as { jobId: string };
    if (!idSchema.safeParse(params.jobId).success) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Invalid job id</h1>']);
    }

    const job = await pool.query<{
      id: string;
      title: string;
      description: string;
      location_text: string;
      place_id: string;
      world_id: string;
      world_slug: string;
      price_cents: number;
      currency: string;
    }>(
      `SELECT j.id, j.title, j.description, j.location_text, j.place_id,
              p.world_id, w.slug AS world_slug,
              $2::int AS price_cents, $3::text AS currency
       FROM jobs j
       JOIN places p ON p.id = j.place_id
       JOIN worlds w ON w.id = p.world_id
       WHERE j.id = $1`,
      [params.jobId, env.UNLOCK_PRICE_CENTS, env.UNLOCK_CURRENCY]
    );

    if (!job.rowCount) {
      ensureHtml(reply);
      reply.code(404);
      return page('Job Not Found', ['<h1>Job not found</h1>', `<p>${link('/html', 'Home')}</p>`]);
    }

    const row = job.rows[0]!;
    await markHtmlPresenceOnline({ userId: request.user.userId, worldId: row.world_id, placeId: row.place_id });

    const back = `/html/place/${row.place_id}`;
    const unlock = getSignedActionLink({
      path: `/html/unlock/${row.id}`,
      userId: request.user.userId,
      action: 'unlock',
      params: { next: back }
    });

    ensureHtml(reply);
    return page(`Job: ${row.title}`, [
      `<h1>${e(row.title)}</h1>`,
      `<p>${e(row.description)}</p>`,
      `<p>Location: ${e(row.location_text)}</p>`,
      `<p>${link(unlock, `Unlock contact ($${(row.price_cents / 100).toFixed(2)} ${row.currency.toUpperCase()})`)}</p>`,
      `<p>${link(back, 'Back to place')}</p>`
    ]);
  });

  app.get('/html/talk/choose', async (request, reply) => {
    const query = request.query as { to?: string; next?: string };
    if (!query.to || !idSchema.safeParse(query.to).success) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Missing recipient</h1>']);
    }

    const target = await pool.query<{ id: string; display_name: string }>('SELECT id, display_name FROM users WHERE id = $1', [query.to]);
    if (!target.rowCount) {
      ensureHtml(reply);
      reply.code(404);
      return page('User Not Found', ['<h1>User not found</h1>']);
    }

    const presence = (await getCurrentPresence(request.user.userId)) ?? { world_id: await getCoreWorldId(), place_id: null };
    await markHtmlPresenceOnline({
      userId: request.user.userId,
      worldId: presence.world_id,
      placeId: presence.place_id
    });

    const fallback = safeRedirectPath(query.next, '/html');

    ensureHtml(reply);
    return page('Talk Menu', [
      `<h1>Tak tak → ${e(target.rows[0]!.display_name)}</h1>`,
      '<ul>',
      ...Object.keys(dmKeys).map((key) => {
        const msgKey = key as DmKey;
        const href = getSignedActionLink({
          path: '/html/talk/send',
          userId: request.user.userId,
          action: 'talk_send',
          params: { to: query.to!, msg: msgKey, next: fallback }
        });
        return `<li>${link(href, dmKeys[msgKey])}</li>`;
      }),
      '</ul>',
      `<p>${link(fallback, 'Back')}</p>`
    ]);
  });

  app.get('/html/talk/send', {
    config: { rateLimit: { max: 8, timeWindow: '10 seconds' } }
  }, async (request, reply) => {
    const query = request.query as { to?: string; msg?: string; next?: string; exp?: string; sig?: string };
    if (!query.to || !query.msg || !idSchema.safeParse(query.to).success || !(query.msg in dmKeys)) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Invalid talk request</h1>']);
    }

    const paramsForSig = {
      to: query.to,
      msg: query.msg,
      next: safeRedirectPath(query.next, '/html')
    };

    if (!validateSignature({ userId: request.user.userId, action: 'talk_send', params: paramsForSig, exp: query.exp, sig: query.sig })) {
      ensureHtml(reply);
      reply.code(403);
      return page('Forbidden', ['<h1>Invalid or expired action link</h1>']);
    }

    const presence = (await getCurrentPresence(request.user.userId)) ?? { world_id: await getCoreWorldId(), place_id: null };

    const event = await appendEvent({
      worldId: presence.world_id,
      placeId: presence.place_id,
      userId: request.user.userId,
      type: 'DMMessageSent',
      payload: {
        toUserId: query.to,
        msgKey: query.msg,
        text: dmKeys[query.msg as DmKey]
      }
    });
    app.wsHub.broadcast(event);

    reply.code(302).header('Location', `/html/dm/${query.to}`).send();
  });

  app.get('/html/dm/:userId', async (request, reply) => {
    const params = request.params as { userId: string };
    if (!idSchema.safeParse(params.userId).success) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Invalid user id</h1>']);
    }

    const target = await pool.query<{ id: string; display_name: string }>('SELECT id, display_name FROM users WHERE id = $1', [params.userId]);
    if (!target.rowCount) {
      ensureHtml(reply);
      reply.code(404);
      return page('User Not Found', ['<h1>User not found</h1>']);
    }

    const presence = (await getCurrentPresence(request.user.userId)) ?? { world_id: await getCoreWorldId(), place_id: null };
    await markHtmlPresenceOnline({ userId: request.user.userId, worldId: presence.world_id, placeId: presence.place_id });

    const dms = await pool.query<{
      id: number;
      user_id: string | null;
      payload_json: Record<string, unknown>;
      created_at: string;
      display_name: string | null;
    }>(
      `SELECT e.id, e.user_id, e.payload_json, e.created_at, u.display_name
       FROM events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.type = 'DMMessageSent'
         AND (
           (e.user_id = $1 AND e.payload_json->>'toUserId' = $2)
           OR
           (e.user_id = $2 AND e.payload_json->>'toUserId' = $1)
         )
       ORDER BY e.id DESC
       LIMIT 30`,
      [request.user.userId, params.userId]
    );

    ensureHtml(reply);
    return page(`DM: ${target.rows[0]!.display_name}`, [
      `<h1>DM with ${e(target.rows[0]!.display_name)}</h1>`,
      dms.rows.length
        ? `<ul>${dms.rows
            .map((row) => {
              const text = String(row.payload_json.text ?? row.payload_json.msgKey ?? 'message');
              const from = row.display_name ?? 'Someone';
              return `<li>${e(from)}: ${e(text)}</li>`;
            })
            .join('')}</ul>`
        : '<p>No messages yet.</p>',
      `<p>${link('/html', 'Back to Main Street')}</p>`,
      `<p>${link(`/html/dm/${params.userId}`, 'Refresh')}</p>`
    ]);
  });

  app.get('/html/act/wave', {
    config: { rateLimit: { max: 10, timeWindow: '10 seconds' } }
  }, async (request, reply) => {
    const query = request.query as { ctx?: string; placeId?: string; next?: string; exp?: string; sig?: string };
    const next = safeRedirectPath(query.next, '/html');
    const paramsForSig: Record<string, string> = {
      ctx: String(query.ctx ?? ''),
      next
    };
    if (query.placeId) {
      paramsForSig.placeId = query.placeId;
    }

    if (!validateSignature({ userId: request.user.userId, action: 'wave', params: paramsForSig, exp: query.exp, sig: query.sig })) {
      ensureHtml(reply);
      reply.code(403);
      return page('Forbidden', ['<h1>Invalid or expired action link</h1>']);
    }

    const presence = (await getCurrentPresence(request.user.userId)) ?? { world_id: await getCoreWorldId(), place_id: null };
    const placeId = query.ctx === 'place' && query.placeId && idSchema.safeParse(query.placeId).success ? query.placeId : null;
    await markHtmlPresenceOnline({ userId: request.user.userId, worldId: presence.world_id, placeId });

    const event = await appendEvent({
      worldId: presence.world_id,
      placeId,
      userId: request.user.userId,
      type: 'EmoteSent',
      payload: { emote: 'WAVE', source: 'html' }
    });
    app.wsHub.broadcast(event);

    reply.code(302).header('Location', next).send();
  });

  app.get('/html/act/say', {
    config: { rateLimit: { max: 8, timeWindow: '10 seconds' } }
  }, async (request, reply) => {
    const query = request.query as { msg?: string; ctx?: string; placeId?: string; next?: string; exp?: string; sig?: string };
    if (!query.msg || !(query.msg in sayKeys)) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Invalid canned message</h1>']);
    }

    const next = safeRedirectPath(query.next, '/html');
    const paramsForSig: Record<string, string> = {
      msg: query.msg,
      ctx: String(query.ctx ?? ''),
      next
    };
    if (query.placeId) {
      paramsForSig.placeId = query.placeId;
    }

    if (!validateSignature({ userId: request.user.userId, action: 'say', params: paramsForSig, exp: query.exp, sig: query.sig })) {
      ensureHtml(reply);
      reply.code(403);
      return page('Forbidden', ['<h1>Invalid or expired action link</h1>']);
    }

    const raw = sayKeys[query.msg as SayKey];
    const sanitized = sanitizeChatInput(raw);
    if (!sanitized.normalized) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Invalid chat payload</h1>']);
    }

    const presence = (await getCurrentPresence(request.user.userId)) ?? { world_id: await getCoreWorldId(), place_id: null };
    const placeId = query.ctx === 'place' && query.placeId && idSchema.safeParse(query.placeId).success ? query.placeId : null;
    await markHtmlPresenceOnline({ userId: request.user.userId, worldId: presence.world_id, placeId });

    const event = await appendEvent({
      worldId: presence.world_id,
      placeId,
      userId: request.user.userId,
      type: 'ChatMessageSent',
      payload: {
        raw: sanitized.raw,
        normalized: sanitized.normalized,
        source: 'html'
      }
    });
    app.wsHub.broadcast(event);

    reply.code(302).header('Location', next).send();
  });

  app.get('/html/act/drop-resume', {
    config: { rateLimit: { max: 5, timeWindow: '30 seconds' } }
  }, async (request, reply) => {
    const query = request.query as { placeId?: string; worldId?: string; next?: string; exp?: string; sig?: string };
    const next = safeRedirectPath(query.next, '/html');

    if (!query.placeId || !query.worldId || !idSchema.safeParse(query.placeId).success || !idSchema.safeParse(query.worldId).success) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Invalid drop resume request</h1>']);
    }

    const paramsForSig: Record<string, string> = {
      placeId: query.placeId,
      worldId: query.worldId,
      next
    };

    if (!validateSignature({ userId: request.user.userId, action: 'drop-resume', params: paramsForSig, exp: query.exp, sig: query.sig })) {
      ensureHtml(reply);
      reply.code(403);
      return page('Forbidden', ['<h1>Invalid or expired action link</h1>']);
    }

    await pool.query(
      `INSERT INTO resume_drops (user_id, place_id, dropped_at, still_interested, expires_at)
       VALUES ($1, $2, NOW(), TRUE, NOW() + INTERVAL '180 days')
       ON CONFLICT (user_id, place_id)
       DO UPDATE SET dropped_at = NOW(), still_interested = TRUE, expires_at = NOW() + INTERVAL '180 days'`,
      [request.user.userId, query.placeId]
    );

    const event = await appendEvent({
      worldId: query.worldId,
      placeId: query.placeId,
      userId: request.user.userId,
      type: 'ResumeDropped',
      payload: { placeId: query.placeId }
    });
    app.wsHub.broadcast(event);

    reply.code(302).header('Location', next).send();
  });

  app.get('/html/unlock/:jobId', async (request, reply) => {
    const params = request.params as { jobId: string };
    const query = request.query as { next?: string; exp?: string; sig?: string };
    if (!idSchema.safeParse(params.jobId).success) {
      ensureHtml(reply);
      reply.code(400);
      return page('Bad Request', ['<h1>Invalid job id</h1>']);
    }

    const next = safeRedirectPath(query.next, '/html');
    if (!validateSignature({
      userId: request.user.userId,
      action: 'unlock',
      params: { next },
      exp: query.exp,
      sig: query.sig
    })) {
      ensureHtml(reply);
      reply.code(403);
      return page('Forbidden', ['<h1>Invalid or expired action link</h1>']);
    }

    const job = await pool.query<{ id: string; place_id: string; world_id: string }>(
      `SELECT j.id, j.place_id, p.world_id
       FROM jobs j
       JOIN places p ON p.id = j.place_id
       WHERE j.id = $1`,
      [params.jobId]
    );

    if (!job.rowCount) {
      ensureHtml(reply);
      reply.code(404);
      return page('Job Not Found', ['<h1>Job not found</h1>']);
    }

    await markHtmlPresenceOnline({
      userId: request.user.userId,
      worldId: job.rows[0]!.world_id,
      placeId: job.rows[0]!.place_id
    });

    await createUnlockTransaction({
      app,
      worldId: job.rows[0]!.world_id,
      placeId: job.rows[0]!.place_id,
      jobId: params.jobId,
      buyerUserId: request.user.userId
    });

    reply.code(302).header('Location', next).send();
  });
};

export default htmlRoutes;
