import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { authenticateHtmlCookie } from '../services/html/auth.js';
import { e } from '../services/html/render.js';
import { hashPassword } from '../utils/auth.js';

const idSchema = z.string().uuid();
const searchSchema = z.object({
  q: z.string().trim().max(120).default(''),
  notice: z.string().trim().max(200).optional(),
  temp_password: z.string().trim().max(80).optional(),
  god: z.enum(['0', '1']).default('0')
});

const roleSchema = z.object({
  role: z.enum(['jobseeker', 'employer', 'recruiter', 'admin'])
});

const blockSchema = z.object({
  reason: z.string().trim().max(240).default('Blocked by admin')
});

function ensureHtml(reply: import('fastify').FastifyReply): void {
  reply.type('text/html; charset=utf-8');
}

function jsonForScript(input: unknown): string {
  return JSON.stringify(input).replace(/</g, '\\u003c');
}

function randomTempPassword(): string {
  return `Temp!${crypto.randomBytes(6).toString('base64url')}`;
}

function redirectToAdmin(reply: import('fastify').FastifyReply, input: {
  notice: string;
  tempPassword?: string;
  q?: string;
  god?: '0' | '1';
}): void {
  const params = new URLSearchParams({ notice: input.notice });
  if (input.tempPassword) {
    params.set('temp_password', input.tempPassword);
  }
  if (input.q) {
    params.set('q', input.q);
  }
  params.set('god', input.god ?? '0');
  reply.code(302).header('Location', `/admin?${params.toString()}`).send();
}

function renderAdminPage(input: {
  adminEmail: string;
  notice?: string;
  tempPassword?: string;
  search: string;
  godMode: boolean;
  stats: {
    totalUsers: number;
    onlineUsers: number;
    blockedUsers: number;
    worlds: number;
    places: number;
    events24h: number;
    unlockRevenueCents: number;
  };
  roleBreakdown: Array<{ role: string; count: number }>;
  eventBuckets: Array<{ label: string; count: number }>;
  onlineUsers: Array<{
    id: string;
    display_name: string;
    email: string;
    role: string;
    world_name: string;
    place_name: string | null;
    status: string;
    last_seen_at: string;
    last_event_type: string | null;
    last_event_at: string | null;
  }>;
  userRows: Array<{
    id: string;
    email: string;
    display_name: string;
    role: string;
    fraud_score: string;
    trust_score: string;
    created_at: string;
    status: string | null;
    last_seen_at: string | null;
    is_blocked: boolean;
  }>;
  recentEvents: Array<{
    id: number;
    type: string;
    created_at: string;
    display_name: string | null;
    world_name: string;
    place_name: string | null;
  }>;
}): string {
  const unlockRevenue = (input.stats.unlockRevenueCents / 100).toFixed(2);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taktos Admin Control Center</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  <style>
    :root {
      --bg: #f4f7fb;
      --card: #ffffff;
      --ink: #152033;
      --accent: #0f6eb1;
      --warn: #a15b00;
      --danger: #a61d24;
      --ok: #06703b;
    }
    body { background: radial-gradient(circle at 20% 0%, #eaf3ff 0%, var(--bg) 42%, #eef1f6 100%); color: var(--ink); }
    .card { border: 0; box-shadow: 0 8px 20px rgba(21, 32, 51, 0.08); }
    .metric-value { font-size: 1.5rem; font-weight: 700; }
    .table-wrap { max-height: 520px; overflow: auto; }
    .tag-online { color: var(--ok); font-weight: 600; }
    .tag-offline { color: var(--warn); font-weight: 600; }
    .hero {
      background: linear-gradient(120deg, #123d7a, #0b5e9a 56%, #1983ba);
      color: #fff;
      border-radius: 14px;
      padding: 1.2rem 1.25rem;
      margin-bottom: 1rem;
    }
    .chip { font-size: .75rem; border-radius: 999px; padding: .15rem .6rem; background: rgba(255,255,255,.18); }
  </style>
</head>
<body>
  <div class="container-fluid py-3 px-3 px-lg-4">
    ${adminNav('dashboard', input.adminEmail)}

    ${input.notice ? `<div class="alert alert-info">${e(input.notice)}${input.tempPassword ? ` Temporary password: <code>${e(input.tempPassword)}</code>` : ''}</div>` : ''}

    <div class="row g-3 mb-3">
      <div class="col-6 col-xl-2"><div class="card p-3"><div class="text-muted small">Users</div><div class="metric-value">${input.stats.totalUsers}</div></div></div>
      <div class="col-6 col-xl-2"><div class="card p-3"><div class="text-muted small">Online now</div><div class="metric-value">${input.stats.onlineUsers}</div></div></div>
      <div class="col-6 col-xl-2"><div class="card p-3"><div class="text-muted small">Blocked</div><div class="metric-value text-danger">${input.stats.blockedUsers}</div></div></div>
      <div class="col-6 col-xl-2"><div class="card p-3"><div class="text-muted small">Worlds</div><div class="metric-value">${input.stats.worlds}</div></div></div>
      <div class="col-6 col-xl-2"><div class="card p-3"><div class="text-muted small">Events (24h)</div><div class="metric-value">${input.stats.events24h}</div></div></div>
      <div class="col-6 col-xl-2"><div class="card p-3"><div class="text-muted small">Revenue paid</div><div class="metric-value">$${unlockRevenue}</div></div></div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-lg-8">
        <div class="card p-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="h5 m-0">Event Throughput (last 24h)</h2>
            <span class="text-muted small">D3 histogram</span>
          </div>
          <div id="events-chart"></div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="card p-3 h-100">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="h5 m-0">Role Distribution</h2>
            <span class="text-muted small">D3 donut</span>
          </div>
          <div id="roles-chart"></div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-lg-8">
        <div class="card p-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="h5 m-0">Online Users (God Mode)</h2>
            <form method="GET" action="/admin" class="d-flex gap-2 align-items-center">
              <input type="hidden" name="q" value="${e(input.search)}" />
              <input type="hidden" name="god" value="${input.godMode ? '0' : '1'}" />
              <button class="btn btn-sm ${input.godMode ? 'btn-danger' : 'btn-primary'}" type="submit">${input.godMode ? 'Disable' : 'Enable'} God Mode</button>
            </form>
          </div>
          <div class="table-wrap">
            <table class="table table-sm table-hover align-middle">
              <thead><tr><th>User</th><th>Role</th><th>Where</th><th>Status</th><th>Last action</th></tr></thead>
              <tbody>
                ${input.onlineUsers.map((row) => `
                  <tr>
                    <td><div>${e(row.display_name)}</div><div class="small text-muted">${e(row.email)}</div></td>
                    <td>${e(row.role)}</td>
                    <td>${e(row.world_name)}${row.place_name ? ` / ${e(row.place_name)}` : ''}</td>
                    <td><span class="${row.status === 'online' ? 'tag-online' : 'tag-offline'}">${e(row.status)}</span><div class="small text-muted">${e(row.last_seen_at)}</div></td>
                    <td>${row.last_event_type ? `${e(row.last_event_type)}<div class="small text-muted">${e(row.last_event_at ?? '')}</div>` : '<span class="text-muted">-</span>'}</td>
                  </tr>`).join('') || '<tr><td colspan="5" class="text-muted">No online users in the active window.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="card p-3">
          <h2 class="h5">Recent Event Feed</h2>
          <div class="table-wrap" style="max-height:520px;">
            <table class="table table-sm align-middle">
              <tbody>
                ${input.recentEvents.map((evt) => `<tr><td><div><strong>${e(evt.type)}</strong></div><div class="small">${e(evt.display_name ?? 'System')} in ${e(evt.world_name)}${evt.place_name ? ` / ${e(evt.place_name)}` : ''}</div><div class="small text-muted">${e(evt.created_at)}</div></td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="card p-3 mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h2 class="h5 m-0">User Management</h2>
        <form class="d-flex gap-2" method="GET" action="/admin">
          <input class="form-control form-control-sm" type="search" name="q" value="${e(input.search)}" placeholder="Search name/email" />
          <input type="hidden" name="god" value="${input.godMode ? '1' : '0'}" />
          <button class="btn btn-sm btn-outline-primary" type="submit">Filter</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="table table-sm table-striped align-middle">
          <thead>
            <tr><th>User</th><th>Role</th><th>Risk</th><th>Presence</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${input.userRows.map((user) => `
              <tr>
                <td>
                  <div>${e(user.display_name)}</div>
                  <div class="small text-muted">${e(user.email)}</div>
                  <div class="small text-muted">Joined ${e(user.created_at)}</div>
                </td>
                <td>
                  <form method="POST" action="/admin/users/${user.id}/role" class="d-flex gap-1 align-items-center">
                    <input type="hidden" name="q" value="${e(input.search)}" />
                    <input type="hidden" name="god" value="${input.godMode ? '1' : '0'}" />
                    <select name="role" class="form-select form-select-sm">
                      <option value="jobseeker" ${user.role === 'jobseeker' ? 'selected' : ''}>jobseeker</option>
                      <option value="employer" ${user.role === 'employer' ? 'selected' : ''}>employer</option>
                      <option value="recruiter" ${user.role === 'recruiter' ? 'selected' : ''}>recruiter</option>
                      <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
                    </select>
                    <button class="btn btn-sm btn-outline-secondary" type="submit">Save</button>
                  </form>
                </td>
                <td>
                  <div>Fraud: ${e(user.fraud_score)}</div>
                  <div>Trust: ${e(user.trust_score)}</div>
                  ${user.is_blocked ? '<div class="badge text-bg-danger mt-1">BLOCKED</div>' : ''}
                </td>
                <td>
                  <div>${e(user.status ?? 'offline')}</div>
                  <div class="small text-muted">${e(user.last_seen_at ?? '-')}</div>
                </td>
                <td>
                  <div class="d-flex flex-column gap-1">
                    <form method="POST" action="/admin/users/${user.id}/reset-password">
                      <input type="hidden" name="q" value="${e(input.search)}" />
                      <input type="hidden" name="god" value="${input.godMode ? '1' : '0'}" />
                      <button class="btn btn-sm btn-warning w-100" type="submit">Reset password</button>
                    </form>

                    <form method="POST" action="/admin/users/${user.id}/force-offline">
                      <input type="hidden" name="q" value="${e(input.search)}" />
                      <input type="hidden" name="god" value="${input.godMode ? '1' : '0'}" />
                      <button class="btn btn-sm btn-outline-dark w-100" type="submit">Force offline</button>
                    </form>

                    ${user.is_blocked
                      ? `<form method="POST" action="/admin/users/${user.id}/unblock">
                          <input type="hidden" name="q" value="${e(input.search)}" />
                          <input type="hidden" name="god" value="${input.godMode ? '1' : '0'}" />
                          <button class="btn btn-sm btn-success w-100" type="submit">Unblock user</button>
                         </form>`
                      : `<form method="POST" action="/admin/users/${user.id}/block" class="d-flex gap-1">
                          <input type="hidden" name="q" value="${e(input.search)}" />
                          <input type="hidden" name="god" value="${input.godMode ? '1' : '0'}" />
                          <input class="form-control form-control-sm" name="reason" value="Policy violation" />
                          <button class="btn btn-sm btn-danger" type="submit">Block</button>
                         </form>`}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script>
    const eventBuckets = ${jsonForScript(input.eventBuckets)};
    const roleBreakdown = ${jsonForScript(input.roleBreakdown)};

    (function drawEventsChart() {
      const root = d3.select('#events-chart');
      const width = root.node().clientWidth;
      const height = 260;
      const margin = { top: 12, right: 8, bottom: 26, left: 36 };
      const svg = root.append('svg').attr('width', width).attr('height', height);

      const x = d3.scaleBand().domain(eventBuckets.map(d => d.label)).range([margin.left, width - margin.right]).padding(0.15);
      const y = d3.scaleLinear().domain([0, d3.max(eventBuckets, d => d.count) || 1]).nice().range([height - margin.bottom, margin.top]);

      svg.append('g').attr('fill', '#0f6eb1').selectAll('rect').data(eventBuckets).enter().append('rect')
        .attr('x', d => x(d.label))
        .attr('y', d => y(d.count))
        .attr('height', d => y(0) - y(d.count))
        .attr('width', x.bandwidth())
        .attr('rx', 3);

      svg.append('g').attr('transform', 'translate(0,' + (height - margin.bottom) + ')')
        .call(d3.axisBottom(x).tickValues(eventBuckets.filter((_, i) => i % 3 === 0).map(d => d.label)))
        .call(g => g.selectAll('text').style('font-size', '10px'));

      svg.append('g').attr('transform', 'translate(' + margin.left + ',0)').call(d3.axisLeft(y).ticks(5));
    })();

    (function drawRolesChart() {
      const root = d3.select('#roles-chart');
      const width = root.node().clientWidth;
      const height = 260;
      const radius = Math.min(width, height) / 2 - 14;
      const color = d3.scaleOrdinal()
        .domain(roleBreakdown.map(d => d.role))
        .range(['#0f6eb1', '#0a8f7c', '#f08a24', '#d0435b']);

      const svg = root.append('svg').attr('width', width).attr('height', height)
        .append('g').attr('transform', 'translate(' + (width / 2) + ',' + (height / 2) + ')');

      const pie = d3.pie().value(d => d.count)(roleBreakdown);
      const arc = d3.arc().innerRadius(radius * 0.56).outerRadius(radius);

      svg.selectAll('path').data(pie).enter().append('path').attr('d', arc).attr('fill', d => color(d.data.role));

      const legend = d3.select('#roles-chart').append('div').attr('class', 'mt-2 small');
      roleBreakdown.forEach((row) => {
        const item = legend.append('div').attr('class', 'd-flex justify-content-between');
        item.append('span').text(row.role);
        item.append('span').text(String(row.count));
      });
    })();
  </script>
</body>
</html>`;
}

function adminNav(current: 'dashboard' | 'businesses', adminEmail: string): string {
  return `
    <div class="hero d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div>
        <h1 class="h3 mb-1">Taktos Admin Control Center</h1>
        <div class="small">Signed in as ${e(adminEmail)} <span class="chip ms-2">admin</span></div>
      </div>
      <div class="d-flex gap-2 flex-wrap">
        <a class="btn btn-sm ${current === 'dashboard' ? 'btn-light' : 'btn-outline-light'}" href="/admin">Dashboard</a>
        <a class="btn btn-sm ${current === 'businesses' ? 'btn-light' : 'btn-outline-light'}" href="/admin/businesses">Businesses</a>
        <a class="btn btn-outline-light btn-sm" href="/html">App</a>
        <a class="btn btn-outline-light btn-sm" href="/html/logout">Logout</a>
      </div>
    </div>`;
}

function renderAdminBusinessesPage(input: {
  adminEmail: string;
  notice?: string;
  search: string;
  stats: { total: number; imported: number; categories: Array<{ category: string; count: number }> };
  businesses: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    address_text: string;
    external_id: string | null;
    place_count: string;
    world_names: string;
    created_at: string;
  }>;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Businesses — Taktos Admin</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  <style>
    :root { --bg: #f4f7fb; --card: #ffffff; --ink: #152033; --accent: #0f6eb1; }
    body { background: radial-gradient(circle at 20% 0%, #eaf3ff 0%, var(--bg) 42%, #eef1f6 100%); color: var(--ink); }
    .card { border: 0; box-shadow: 0 8px 20px rgba(21,32,51,.08); }
    .metric-value { font-size: 1.5rem; font-weight: 700; }
    .table-wrap { max-height: 640px; overflow: auto; }
    .hero {
      background: linear-gradient(120deg, #123d7a, #0b5e9a 56%, #1983ba);
      color: #fff; border-radius: 14px; padding: 1.2rem 1.25rem; margin-bottom: 1rem;
    }
    .chip { font-size: .75rem; border-radius: 999px; padding: .15rem .6rem; background: rgba(255,255,255,.18); }
    .source-osm { font-size: .7rem; background: #e8f4fd; color: #0b5e9a; border-radius: 4px; padding: .1rem .4rem; }
    .source-manual { font-size: .7rem; background: #f0faf4; color: #06703b; border-radius: 4px; padding: .1rem .4rem; }
  </style>
</head>
<body>
  <div class="container-fluid py-3 px-3 px-lg-4">
    ${adminNav('businesses', input.adminEmail)}

    ${input.notice ? `<div class="alert alert-info">${e(input.notice)}</div>` : ''}

    <div class="row g-3 mb-3">
      <div class="col-6 col-xl-3"><div class="card p-3"><div class="text-muted small">Total businesses</div><div class="metric-value">${input.stats.total}</div></div></div>
      <div class="col-6 col-xl-3"><div class="card p-3"><div class="text-muted small">OSM imports</div><div class="metric-value">${input.stats.imported}</div></div></div>
      ${input.stats.categories.map((c) => `<div class="col-6 col-xl-3"><div class="card p-3"><div class="text-muted small">${e(c.category)}</div><div class="metric-value">${c.count}</div></div></div>`).join('')}
    </div>

    <div class="card p-3">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 class="h5 m-0">Business Directory</h2>
        <form class="d-flex gap-2" method="GET" action="/admin/businesses">
          <input class="form-control form-control-sm" type="search" name="q" value="${e(input.search)}" placeholder="Search name / address" style="min-width:220px" />
          <button class="btn btn-sm btn-outline-primary" type="submit">Filter</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="table table-sm table-striped align-middle">
          <thead>
            <tr><th>Business</th><th>Category</th><th>Cities</th><th>Places</th><th>Source</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${input.businesses.map((biz) => `
              <tr>
                <td>
                  <div><strong>${e(biz.name)}</strong></div>
                  <div class="small text-muted">${e(biz.address_text || '—')}</div>
                  <div class="small text-muted">Added ${e(biz.created_at)}</div>
                </td>
                <td>${e(biz.category || '—')}</td>
                <td class="small">${e(biz.world_names || '—')}</td>
                <td>${e(biz.place_count)}</td>
                <td>${biz.external_id
                  ? `<span class="source-osm">OSM</span>`
                  : `<span class="source-manual">manual</span>`}</td>
                <td style="min-width:260px">
                  <details>
                    <summary class="btn btn-sm btn-outline-secondary mb-1">Edit</summary>
                    <form method="POST" action="/admin/businesses/${biz.id}/update" class="mt-2 d-flex flex-column gap-2">
                      <input type="hidden" name="q" value="${e(input.search)}" />
                      <input class="form-control form-control-sm" name="name" value="${e(biz.name)}" placeholder="Name" required />
                      <input class="form-control form-control-sm" name="description" value="${e(biz.description)}" placeholder="Description" />
                      <select name="category" class="form-select form-select-sm">
                        <option value="" ${!biz.category ? 'selected' : ''}>— category —</option>
                        <option value="food_bev" ${biz.category === 'food_bev' ? 'selected' : ''}>food &amp; bev</option>
                        <option value="retail" ${biz.category === 'retail' ? 'selected' : ''}>retail</option>
                        <option value="tech" ${biz.category === 'tech' ? 'selected' : ''}>tech</option>
                        <option value="health" ${biz.category === 'health' ? 'selected' : ''}>health</option>
                        <option value="finance" ${biz.category === 'finance' ? 'selected' : ''}>finance</option>
                        <option value="other" ${biz.category === 'other' ? 'selected' : ''}>other</option>
                      </select>
                      <button class="btn btn-sm btn-primary" type="submit">Save</button>
                    </form>
                  </details>
                  <form method="POST" action="/admin/businesses/${biz.id}/delete" class="mt-1"
                        onsubmit="return confirm('Delete ${e(biz.name.replace(/'/g, "\\'"))} and all its places?')">
                    <input type="hidden" name="q" value="${e(input.search)}" />
                    <button class="btn btn-sm btn-outline-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const adminHtmlRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      return;
    }

    const ok = await authenticateHtmlCookie({ app, request, reply });
    if (!ok) {
      return;
    }

    if (request.user.role !== 'admin') {
      ensureHtml(reply);
      return reply.code(403).send('<h1>Admin required</h1>');
    }
  });

  app.get('/admin', async (request, reply) => {
    const parsed = searchSchema.parse(request.query ?? {});
    const onlineWindow = `${Math.max(60, Math.min(300, env.HTML_ONLINE_WINDOW_SECONDS))}`;

    const statsResult = await pool.query<{
      total_users: string;
      online_users: string;
      blocked_users: string;
      worlds: string;
      places: string;
      events_24h: string;
      unlock_revenue_cents: string;
    }>(
      `SELECT
        (SELECT COUNT(*)::text FROM users) AS total_users,
        (SELECT COUNT(*)::text FROM presence WHERE status = 'online' AND last_seen_at > NOW() - ($1 || ' seconds')::interval) AS online_users,
        (SELECT COUNT(*)::text FROM admin_user_blocks WHERE unblocked_at IS NULL) AS blocked_users,
        (SELECT COUNT(*)::text FROM worlds) AS worlds,
        (SELECT COUNT(*)::text FROM places) AS places,
        (SELECT COUNT(*)::text FROM events WHERE created_at > NOW() - interval '24 hours') AS events_24h,
        (SELECT COALESCE(SUM(price_cents), 0)::text FROM unlock_transactions WHERE status = 'paid') AS unlock_revenue_cents`,
      [onlineWindow]
    );

    const roleBreakdown = await pool.query<{ role: string; count: string }>(
      `SELECT role, COUNT(*)::text AS count
       FROM users
       GROUP BY role
       ORDER BY count DESC`
    );

    const eventBuckets = await pool.query<{ label: string; count: string }>(
      `SELECT TO_CHAR(g.bucket, 'HH24:00') AS label, COALESCE(x.cnt, 0)::text AS count
       FROM generate_series(
         date_trunc('hour', NOW()) - interval '23 hours',
         date_trunc('hour', NOW()),
         interval '1 hour'
       ) AS g(bucket)
       LEFT JOIN (
         SELECT date_trunc('hour', created_at) AS bucket, COUNT(*)::int AS cnt
         FROM events
         WHERE created_at > NOW() - interval '24 hours'
         GROUP BY 1
       ) x ON x.bucket = g.bucket
       ORDER BY g.bucket ASC`
    );

    const onlineUsers = await pool.query<{
      id: string;
      display_name: string;
      email: string;
      role: string;
      world_name: string;
      place_name: string | null;
      status: string;
      last_seen_at: string;
      last_event_type: string | null;
      last_event_at: string | null;
    }>(
      `SELECT
        u.id,
        u.display_name,
        u.email,
        u.role,
        w.name AS world_name,
        p.name AS place_name,
        pr.status,
        TO_CHAR(pr.last_seen_at, 'YYYY-MM-DD HH24:MI:SS') AS last_seen_at,
        le.type AS last_event_type,
        CASE WHEN le.created_at IS NULL THEN NULL ELSE TO_CHAR(le.created_at, 'YYYY-MM-DD HH24:MI:SS') END AS last_event_at
       FROM presence pr
       JOIN users u ON u.id = pr.user_id
       JOIN worlds w ON w.id = pr.world_id
       LEFT JOIN places p ON p.id = pr.place_id
       LEFT JOIN LATERAL (
         SELECT e.type, e.created_at
         FROM events e
         WHERE e.user_id = u.id
         ORDER BY e.id DESC
         LIMIT 1
       ) le ON TRUE
       WHERE pr.status = 'online'
         AND pr.last_seen_at > NOW() - ($1 || ' seconds')::interval
       ORDER BY pr.last_seen_at DESC
       LIMIT 120`,
      [onlineWindow]
    );

    const userRows = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      fraud_score: string;
      trust_score: string;
      created_at: string;
      status: string | null;
      last_seen_at: string | null;
      is_blocked: boolean;
    }>(
      `SELECT
        u.id,
        u.email,
        u.display_name,
        u.role,
        u.fraud_score::text,
        u.trust_score::text,
        TO_CHAR(u.created_at, 'YYYY-MM-DD') AS created_at,
        pr.status,
        CASE WHEN pr.last_seen_at IS NULL THEN NULL ELSE TO_CHAR(pr.last_seen_at, 'YYYY-MM-DD HH24:MI:SS') END AS last_seen_at,
        (b.user_id IS NOT NULL) AS is_blocked
       FROM users u
       LEFT JOIN presence pr ON pr.user_id = u.id
       LEFT JOIN admin_user_blocks b ON b.user_id = u.id AND b.unblocked_at IS NULL
       WHERE ($1::text = '' OR u.email ILIKE ('%' || $1 || '%') OR u.display_name ILIKE ('%' || $1 || '%'))
       ORDER BY u.created_at DESC
       LIMIT 200`,
      [parsed.q]
    );

    const recentEvents = await pool.query<{
      id: number;
      type: string;
      created_at: string;
      display_name: string | null;
      world_name: string;
      place_name: string | null;
    }>(
      `SELECT
        e.id,
        e.type,
        TO_CHAR(e.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
        u.display_name,
        w.name AS world_name,
        p.name AS place_name
       FROM events e
       JOIN worlds w ON w.id = e.world_id
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN places p ON p.id = e.place_id
       ORDER BY e.id DESC
       LIMIT 120`
    );

    const stats = statsResult.rows[0]!;

    ensureHtml(reply);
    return renderAdminPage({
      adminEmail: request.user.email,
      notice: parsed.notice,
      tempPassword: parsed.temp_password,
      search: parsed.q,
      godMode: parsed.god === '1',
      stats: {
        totalUsers: Number(stats.total_users),
        onlineUsers: Number(stats.online_users),
        blockedUsers: Number(stats.blocked_users),
        worlds: Number(stats.worlds),
        places: Number(stats.places),
        events24h: Number(stats.events_24h),
        unlockRevenueCents: Number(stats.unlock_revenue_cents)
      },
      roleBreakdown: roleBreakdown.rows.map((row) => ({ role: row.role, count: Number(row.count) })),
      eventBuckets: eventBuckets.rows.map((row) => ({ label: row.label, count: Number(row.count) })),
      onlineUsers: onlineUsers.rows,
      userRows: userRows.rows,
      recentEvents: parsed.god === '1' ? recentEvents.rows : recentEvents.rows.slice(0, 25)
    });
  });

  app.get('/html/admin', async (_request, reply) => {
    reply.code(302).header('Location', '/admin').send();
  });

  app.post('/admin/users/:userId/block', async (request, reply) => {
    const params = request.params as { userId: string };
    const body = blockSchema.parse(request.body ?? {});
    const query = searchSchema.pick({ q: true, god: true }).parse(request.body ?? {});

    if (!idSchema.safeParse(params.userId).success) {
      return redirectToAdmin(reply, { notice: 'Invalid user id', q: query.q, god: query.god });
    }

    if (params.userId === request.user.userId) {
      return redirectToAdmin(reply, { notice: 'Cannot block your own admin account', q: query.q, god: query.god });
    }

    const result = await pool.query(
      `INSERT INTO admin_user_blocks (user_id, blocked_by_user_id, reason, blocked_at, unblocked_at, unblocked_by_user_id)
       VALUES ($1, $2, $3, NOW(), NULL, NULL)
       ON CONFLICT (user_id)
       DO UPDATE SET
         blocked_by_user_id = EXCLUDED.blocked_by_user_id,
         reason = EXCLUDED.reason,
         blocked_at = NOW(),
         unblocked_at = NULL,
         unblocked_by_user_id = NULL`,
      [params.userId, request.user.userId, body.reason || 'Blocked by admin']
    );

    if (!result.command) {
      return redirectToAdmin(reply, { notice: 'Block action failed', q: query.q, god: query.god });
    }

    return redirectToAdmin(reply, { notice: 'User blocked', q: query.q, god: query.god });
  });

  app.post('/admin/users/:userId/unblock', async (request, reply) => {
    const params = request.params as { userId: string };
    const query = searchSchema.pick({ q: true, god: true }).parse(request.body ?? {});

    if (!idSchema.safeParse(params.userId).success) {
      return redirectToAdmin(reply, { notice: 'Invalid user id', q: query.q, god: query.god });
    }

    await pool.query(
      `UPDATE admin_user_blocks
       SET unblocked_at = NOW(), unblocked_by_user_id = $2
       WHERE user_id = $1`,
      [params.userId, request.user.userId]
    );

    return redirectToAdmin(reply, { notice: 'User unblocked', q: query.q, god: query.god });
  });

  app.post('/admin/users/:userId/reset-password', async (request, reply) => {
    const params = request.params as { userId: string };
    const query = searchSchema.pick({ q: true, god: true }).parse(request.body ?? {});

    if (!idSchema.safeParse(params.userId).success) {
      return redirectToAdmin(reply, { notice: 'Invalid user id', q: query.q, god: query.god });
    }

    const tempPassword = randomTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const result = await pool.query(
      'UPDATE users SET password_hash = $2 WHERE id = $1',
      [params.userId, passwordHash]
    );

    if (!result.rowCount) {
      return redirectToAdmin(reply, { notice: 'User not found', q: query.q, god: query.god });
    }

    return redirectToAdmin(reply, {
      notice: 'Password reset complete',
      tempPassword,
      q: query.q,
      god: query.god
    });
  });

  app.post('/admin/users/:userId/role', async (request, reply) => {
    const params = request.params as { userId: string };
    const body = roleSchema.parse(request.body ?? {});
    const query = searchSchema.pick({ q: true, god: true }).parse(request.body ?? {});

    if (!idSchema.safeParse(params.userId).success) {
      return redirectToAdmin(reply, { notice: 'Invalid user id', q: query.q, god: query.god });
    }

    if (params.userId === request.user.userId && body.role !== 'admin') {
      return redirectToAdmin(reply, { notice: 'You cannot remove your own admin role', q: query.q, god: query.god });
    }

    await pool.query('UPDATE users SET role = $2 WHERE id = $1', [params.userId, body.role]);

    return redirectToAdmin(reply, { notice: `Role updated to ${body.role}`, q: query.q, god: query.god });
  });

  app.get('/admin/businesses', async (request, reply) => {
    const q = ((request.query as Record<string, string>).q ?? '').trim().slice(0, 120);
    const notice = ((request.query as Record<string, string>).notice ?? '').trim().slice(0, 200) || undefined;

    const statsResult = await pool.query<{ total: string; imported: string }>(
      `SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE external_id IS NOT NULL)::text AS imported
       FROM businesses`
    );

    const categories = await pool.query<{ category: string; count: number }>(
      `SELECT COALESCE(NULLIF(category,''), 'uncategorised') AS category, COUNT(*)::int AS count
       FROM businesses
       GROUP BY 1
       ORDER BY count DESC
       LIMIT 6`
    );

    const businesses = await pool.query<{
      id: string;
      name: string;
      description: string;
      category: string;
      address_text: string;
      external_id: string | null;
      place_count: string;
      world_names: string;
      created_at: string;
    }>(
      `SELECT
        b.id,
        b.name,
        b.description,
        b.category,
        b.address_text,
        b.external_id,
        COUNT(p.id)::text AS place_count,
        COALESCE(STRING_AGG(DISTINCT w.name, ', ' ORDER BY w.name), '') AS world_names,
        TO_CHAR(b.created_at, 'YYYY-MM-DD') AS created_at
       FROM businesses b
       LEFT JOIN places p ON p.business_id = b.id
       LEFT JOIN worlds w ON w.id = p.world_id
       WHERE ($1::text = '' OR b.name ILIKE ('%' || $1 || '%') OR b.address_text ILIKE ('%' || $1 || '%'))
       GROUP BY b.id
       ORDER BY b.created_at DESC
       LIMIT 300`,
      [q]
    );

    const stats = statsResult.rows[0]!;
    ensureHtml(reply);
    return renderAdminBusinessesPage({
      adminEmail: request.user.email,
      notice,
      search: q,
      stats: {
        total: Number(stats.total),
        imported: Number(stats.imported),
        categories: categories.rows,
      },
      businesses: businesses.rows,
    });
  });

  app.post('/admin/businesses/:businessId/update', async (request, reply) => {
    const params = request.params as { businessId: string };
    const body = request.body as Record<string, string> | undefined ?? {};
    const q = (body.q ?? '').trim().slice(0, 120);

    if (!idSchema.safeParse(params.businessId).success) {
      reply.code(302).header('Location', `/admin/businesses?notice=${encodeURIComponent('Invalid business id')}&q=${encodeURIComponent(q)}`).send();
      return;
    }

    const name = (body.name ?? '').trim().slice(0, 200);
    const description = (body.description ?? '').trim().slice(0, 1000);
    const category = (body.category ?? '').trim().slice(0, 80);

    if (!name) {
      reply.code(302).header('Location', `/admin/businesses?notice=${encodeURIComponent('Name is required')}&q=${encodeURIComponent(q)}`).send();
      return;
    }

    await pool.query(
      `UPDATE businesses SET name = $2, description = $3, category = $4 WHERE id = $1`,
      [params.businessId, name, description, category]
    );

    reply.code(302).header('Location', `/admin/businesses?notice=${encodeURIComponent('Business updated')}&q=${encodeURIComponent(q)}`).send();
  });

  app.post('/admin/businesses/:businessId/delete', async (request, reply) => {
    const params = request.params as { businessId: string };
    const body = request.body as Record<string, string> | undefined ?? {};
    const q = (body.q ?? '').trim().slice(0, 120);

    if (!idSchema.safeParse(params.businessId).success) {
      reply.code(302).header('Location', `/admin/businesses?notice=${encodeURIComponent('Invalid business id')}&q=${encodeURIComponent(q)}`).send();
      return;
    }

    await pool.query(`DELETE FROM businesses WHERE id = $1`, [params.businessId]);

    reply.code(302).header('Location', `/admin/businesses?notice=${encodeURIComponent('Business deleted')}&q=${encodeURIComponent(q)}`).send();
  });

  app.post('/admin/users/:userId/force-offline', async (request, reply) => {
    const params = request.params as { userId: string };
    const query = searchSchema.pick({ q: true, god: true }).parse(request.body ?? {});

    if (!idSchema.safeParse(params.userId).success) {
      return redirectToAdmin(reply, { notice: 'Invalid user id', q: query.q, god: query.god });
    }

    await pool.query(
      `UPDATE presence
       SET status = 'offline', last_seen_at = NOW()
       WHERE user_id = $1`,
      [params.userId]
    );

    return redirectToAdmin(reply, { notice: 'User forced offline', q: query.q, god: query.god });
  });
};

export default adminHtmlRoutes;
