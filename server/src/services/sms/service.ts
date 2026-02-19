import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { hashPassword } from '../../utils/auth.js';
import {
  createUnlockTransaction,
  enterPlaceAction,
  getCoreWorldId,
  getPresenceSnapshot,
  joinWorldAction,
  leavePlaceAction,
  listJobs,
  listPlaces,
  sayAction
} from '../gameplay.js';
import { detectComplianceCommand, parseSmsCommand } from './commands.js';
import { exceedsInboundLimit, exceedsOutboundLimit, shouldWarnBurst } from './policy.js';

const E164_SCHEMA = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone number must be E.164 format');

type MenuType = 'map' | 'place' | 'jobs' | null;

interface SmsSession {
  phone_e164: string;
  user_id: string;
  world_id: string;
  place_id: string | null;
  last_menu_type: MenuType;
  last_menu_items_json: unknown;
  updated_at: string;
}

interface SmsUsageRow {
  inbound_count: number;
  outbound_count: number;
}

interface PlaceMenuRow {
  id: string;
  name: string;
  hiring_count: number;
}

export function normalizePhoneE164(input: string): string | null {
  const normalized = input.trim();
  const parsed = E164_SCHEMA.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function short(text: string, max = 280): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

function parseMenuItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((v): v is string => typeof v === 'string');
}

async function getSession(phone: string): Promise<SmsSession | null> {
  const row = await pool.query<SmsSession>('SELECT * FROM sms_sessions WHERE phone_e164 = $1', [phone]);
  return row.rows[0] ?? null;
}

async function upsertSession(input: {
  phone: string;
  userId: string;
  worldId: string;
  placeId?: string | null;
  lastMenuType?: MenuType;
  lastMenuItems?: string[] | null;
}) {
  await pool.query(
    `INSERT INTO sms_sessions (phone_e164, user_id, world_id, place_id, last_menu_type, last_menu_items_json, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (phone_e164)
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       world_id = EXCLUDED.world_id,
       place_id = EXCLUDED.place_id,
       last_menu_type = EXCLUDED.last_menu_type,
       last_menu_items_json = EXCLUDED.last_menu_items_json,
       updated_at = NOW()`,
    [
      input.phone,
      input.userId,
      input.worldId,
      input.placeId ?? null,
      input.lastMenuType ?? null,
      JSON.stringify(input.lastMenuItems ?? [])
    ]
  );
}

async function getOrCreateSmsUser(phone: string): Promise<string> {
  const existing = await pool.query<{ user_id: string | null }>('SELECT user_id FROM sms_allowlist WHERE phone_e164 = $1', [phone]);
  const userId = existing.rows[0]?.user_id;
  if (userId) {
    return userId;
  }

  const suffix = phone.slice(-4);
  const passwordHash = await hashPassword(crypto.randomUUID());
  const email = `sms+${Date.now()}-${suffix}@sms.taktos.local`;
  const displayName = `SMS User ${suffix}`;

  const created = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'jobseeker')
     RETURNING id`,
    [email, passwordHash, displayName]
  );

  await pool.query('UPDATE sms_allowlist SET user_id = $1 WHERE phone_e164 = $2', [created.rows[0]!.id, phone]);
  return created.rows[0]!.id;
}

async function consumeInbound(phone: string): Promise<SmsUsageRow> {
  const usage = await pool.query<SmsUsageRow>(
    `INSERT INTO sms_usage_daily (phone_e164, day_date, inbound_count, outbound_count)
     VALUES ($1, CURRENT_DATE, 1, 0)
     ON CONFLICT (phone_e164, day_date)
     DO UPDATE SET inbound_count = sms_usage_daily.inbound_count + 1
     RETURNING inbound_count, outbound_count`,
    [phone]
  );

  return usage.rows[0]!;
}

async function getUsage(phone: string): Promise<SmsUsageRow> {
  const usage = await pool.query<SmsUsageRow>(
    `SELECT inbound_count, outbound_count
     FROM sms_usage_daily
     WHERE phone_e164 = $1 AND day_date = CURRENT_DATE`,
    [phone]
  );

  return usage.rows[0] ?? { inbound_count: 0, outbound_count: 0 };
}

async function consumeOutbound(phone: string): Promise<void> {
  await pool.query(
    `INSERT INTO sms_usage_daily (phone_e164, day_date, inbound_count, outbound_count)
     VALUES ($1, CURRENT_DATE, 0, 1)
     ON CONFLICT (phone_e164, day_date)
     DO UPDATE SET outbound_count = sms_usage_daily.outbound_count + 1`,
    [phone]
  );
}

async function sendSmsIfAllowed(phone: string, message: string): Promise<string | null> {
  const usage = await getUsage(phone);
  if (exceedsOutboundLimit(
    { inboundCount: usage.inbound_count, outboundCount: usage.outbound_count },
    { maxInboundPerDay: env.SMS_MAX_INBOUND_PER_DAY, maxOutboundPerDay: env.SMS_MAX_OUTBOUND_PER_DAY }
  )) {
    return null;
  }

  await consumeOutbound(phone);
  return short(message);
}

async function checkBurst(phone: string): Promise<{ blocked: boolean; warn: boolean }> {
  const row = await pool.query<{ last_inbound_at: string; last_warned_at: string | null }>(
    'SELECT last_inbound_at, last_warned_at FROM sms_burst_limits WHERE phone_e164 = $1',
    [phone]
  );

  const now = Date.now();
  if (!row.rowCount) {
    await pool.query('INSERT INTO sms_burst_limits (phone_e164, last_inbound_at) VALUES ($1, NOW())', [phone]);
    return { blocked: false, warn: false };
  }

  const lastInbound = new Date(row.rows[0]!.last_inbound_at).getTime();
  const lastWarn = row.rows[0]!.last_warned_at ? new Date(row.rows[0]!.last_warned_at).getTime() : 0;
  const warn = shouldWarnBurst({
    elapsedMs: now - lastInbound,
    burstLimitPerSec: env.SMS_BURST_LIMIT_PER_SEC,
    warnedRecently: now - lastWarn < 10_000
  });

  const minGapMs = Math.max(1, Math.floor(1000 / Math.max(env.SMS_BURST_LIMIT_PER_SEC, 1)));
  const blocked = now - lastInbound < minGapMs;

  await pool.query(
    `UPDATE sms_burst_limits
     SET last_inbound_at = NOW(),
         last_warned_at = CASE WHEN $2 THEN NOW() ELSE last_warned_at END
     WHERE phone_e164 = $1`,
    [phone, warn]
  );

  return { blocked, warn };
}

async function shouldSendInviteOnlyNotice(phone: string): Promise<boolean> {
  const row = await pool.query('SELECT 1 FROM sms_gate_notices WHERE phone_e164 = $1', [phone]);
  if (row.rowCount) {
    return false;
  }

  await pool.query('INSERT INTO sms_gate_notices (phone_e164) VALUES ($1)', [phone]);
  return true;
}

async function handleStop(phone: string): Promise<string> {
  await pool.query(
    `INSERT INTO sms_allowlist (phone_e164, status)
     VALUES ($1, 'blocked')
     ON CONFLICT (phone_e164)
     DO UPDATE SET status = 'blocked'`,
    [phone]
  );

  await pool.query(
    `INSERT INTO sms_consent (phone_e164, consented_at, consent_source, stopped_at)
     VALUES ($1, NOW(), 'JOIN', NOW())
     ON CONFLICT (phone_e164)
     DO UPDATE SET stopped_at = NOW()`,
    [phone]
  );

  return 'You have been unsubscribed from Taktos SMS. Reply START to re-subscribe.';
}

async function handleStart(phone: string): Promise<string> {
  const allow = await pool.query<{ status: 'invited' | 'active' | 'blocked' }>(
    'SELECT status FROM sms_allowlist WHERE phone_e164 = $1',
    [phone]
  );

  if (!allow.rowCount) {
    return 'No invite found for this number. Text JOIN <CODE> to request access.';
  }

  await pool.query(
    `UPDATE sms_allowlist
     SET status = 'active', activated_at = COALESCE(activated_at, NOW())
     WHERE phone_e164 = $1`,
    [phone]
  );

  await pool.query(
    `INSERT INTO sms_consent (phone_e164, consented_at, consent_source, stopped_at)
     VALUES ($1, NOW(), 'JOIN', NULL)
     ON CONFLICT (phone_e164)
     DO UPDATE SET stopped_at = NULL`,
    [phone]
  );

  return 'Taktos SMS reactivated. Reply MAP to see places.';
}

async function handleJoin(app: FastifyInstance, phone: string, code: string | undefined): Promise<string> {
  if (!code) {
    return 'Usage: JOIN <CODE>';
  }

  const invite = await pool.query<{ world_id: string }>(
    `UPDATE sms_invite_codes
     SET uses_count = uses_count + 1
     WHERE code = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       AND uses_count < max_uses
     RETURNING world_id`,
    [code.toUpperCase()]
  );

  if (!invite.rowCount) {
    return 'Invalid or expired invite code.';
  }

  await pool.query(
    `INSERT INTO sms_allowlist (phone_e164, status, activated_at)
     VALUES ($1, 'active', NOW())
     ON CONFLICT (phone_e164)
     DO UPDATE SET status = 'active', activated_at = COALESCE(sms_allowlist.activated_at, NOW())`,
    [phone]
  );

  const userId = await getOrCreateSmsUser(phone);
  await pool.query(
    `INSERT INTO sms_consent (phone_e164, consented_at, consent_source, stopped_at)
     VALUES ($1, NOW(), 'JOIN', NULL)
     ON CONFLICT (phone_e164)
     DO UPDATE SET consented_at = NOW(), consent_source = 'JOIN', stopped_at = NULL`,
    [phone]
  );

  const worldId = invite.rows[0]!.world_id;
  await joinWorldAction({ app, worldId, userId });
  await upsertSession({ phone, userId, worldId, placeId: null, lastMenuType: null, lastMenuItems: [] });

  return 'Welcome to Taktos SMS. Reply MAP to see Main Street.';
}

async function listPlacesForMenu(worldId: string): Promise<PlaceMenuRow[]> {
  const rows = await pool.query<PlaceMenuRow>(
    `SELECT p.id, p.name, COUNT(j.id)::int AS hiring_count
     FROM places p
     LEFT JOIN jobs j ON j.place_id = p.id AND j.is_active = TRUE
     WHERE p.world_id = $1
     GROUP BY p.id
     ORDER BY p.is_featured DESC, p.created_at ASC`,
    [worldId]
  );

  return rows.rows;
}

function buildMapReply(places: PlaceMenuRow[]): { text: string; ids: string[] } {
  const items = places.slice(0, 6).map((p, idx) => {
    const hiring = p.hiring_count > 0 ? ' (Hiring)' : '';
    return `${idx + 1}) ${p.name}${hiring}`;
  });
  const text = places.length
    ? `Main St: ${items.join(' ')}. Reply ENTER <#> or number.`
    : 'Main St is quiet right now. Reply HELP for commands.';

  return { text, ids: places.map((p) => p.id) };
}

function buildJobsReply(jobs: Array<{ id: string; title: string }>): { text: string; ids: string[] } {
  if (!jobs.length) {
    return { text: 'No active jobs here. Reply LEAVE or MAP.', ids: [] };
  }

  const top = jobs.slice(0, 6).map((j, idx) => `${idx + 1}) ${j.title}`);
  return {
    text: `Jobs: ${top.join(' ')}. Reply UNLOCK <#> or number.`,
    ids: jobs.map((j) => j.id)
  };
}

function pickByNumber(ids: string[], value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const idx = Number(value) - 1;
  if (idx < 0 || idx >= ids.length) {
    return null;
  }
  return ids[idx] ?? null;
}

async function getAllowlist(phone: string): Promise<{ user_id: string | null; status: 'invited' | 'active' | 'blocked' } | null> {
  const allow = await pool.query<{ user_id: string | null; status: 'invited' | 'active' | 'blocked' }>(
    'SELECT user_id, status FROM sms_allowlist WHERE phone_e164 = $1',
    [phone]
  );

  return allow.rows[0] ?? null;
}

export async function handleInboundSms(input: {
  app: FastifyInstance;
  from: string;
  body: string;
}): Promise<{ message: string | null }> {
  const phone = normalizePhoneE164(input.from);
  if (!phone) {
    return { message: null };
  }

  const burst = await checkBurst(phone);
  if (burst.blocked) {
    if (!burst.warn) {
      return { message: null };
    }

    return { message: await sendSmsIfAllowed(phone, 'Slow down. Try again in a second.') };
  }

  const usage = await consumeInbound(phone);
  const limits = {
    maxInboundPerDay: env.SMS_MAX_INBOUND_PER_DAY,
    maxOutboundPerDay: env.SMS_MAX_OUTBOUND_PER_DAY
  };

  if (exceedsInboundLimit({ inboundCount: usage.inbound_count, outboundCount: usage.outbound_count }, limits)) {
    return {
      message: await sendSmsIfAllowed(phone, 'Daily SMS limit reached. Use the terminal client for unlimited access.')
    };
  }

  const compliance = detectComplianceCommand(input.body);
  if (compliance === 'STOP') {
    return { message: await sendSmsIfAllowed(phone, await handleStop(phone)) };
  }
  if (compliance === 'START') {
    return { message: await sendSmsIfAllowed(phone, await handleStart(phone)) };
  }
  if (compliance === 'HELP') {
    return {
      message: await sendSmsIfAllowed(
        phone,
        `Taktos SMS commands: JOIN <CODE>, MAP, ENTER <#>, JOBS, SAY <msg>, LEAVE, WHO, UNLOCK <#>. Support: ${env.SMS_SUPPORT_URL}`
      )
    };
  }

  const parsed = parseSmsCommand(input.body);
  if (parsed.name === 'JOIN') {
    return { message: await sendSmsIfAllowed(phone, await handleJoin(input.app, phone, parsed.args[0])) };
  }

  const allow = await getAllowlist(phone);
  if (!allow || allow.status !== 'active') {
    if (!(await shouldSendInviteOnlyNotice(phone))) {
      return { message: null };
    }
    return { message: await sendSmsIfAllowed(phone, 'SMS is invite-only. To join, text: JOIN <CODE>') };
  }

  const userId = allow.user_id ?? (await getOrCreateSmsUser(phone));
  let session = await getSession(phone);
  if (!session) {
    const coreWorldId = await getCoreWorldId();
    await joinWorldAction({ app: input.app, worldId: coreWorldId, userId });
    await upsertSession({ phone, userId, worldId: coreWorldId, placeId: null, lastMenuType: null, lastMenuItems: [] });
    session = await getSession(phone);
  }

  if (!session) {
    return { message: await sendSmsIfAllowed(phone, 'Unable to initialize SMS session. Try again.') };
  }

  const menuItems = parseMenuItems(session.last_menu_items_json);
  let normalizedCommand = parsed;

  if (parsed.name === 'NUMERIC') {
    if (session.last_menu_type === 'map') {
      normalizedCommand = { name: 'ENTER', args: [parsed.args[0] ?? ''], raw: parsed.raw };
    } else if (session.last_menu_type === 'jobs') {
      normalizedCommand = { name: 'UNLOCK', args: [parsed.args[0] ?? ''], raw: parsed.raw };
    } else if (session.last_menu_type === 'place') {
      const selected = pickByNumber(menuItems, parsed.args[0]);
      if (selected === 'jobs') {
        normalizedCommand = { name: 'JOBS', args: [], raw: parsed.raw };
      } else if (selected === 'who') {
        normalizedCommand = { name: 'WHO', args: [], raw: parsed.raw };
      } else if (selected === 'leave') {
        normalizedCommand = { name: 'LEAVE', args: [], raw: parsed.raw };
      }
    }
  }

  if (normalizedCommand.name === 'HELP' || normalizedCommand.name === 'UNKNOWN') {
    const prompt = session.place_id
      ? 'At place: 1) JOBS 2) WHO 3) LEAVE. Reply number or SAY <msg>.'
      : 'Commands: MAP, ENTER <#>, WHO, HELP. Reply MAP to begin.';

    const items = session.place_id ? ['jobs', 'who', 'leave'] : [];
    await upsertSession({
      phone,
      userId,
      worldId: session.world_id,
      placeId: session.place_id,
      lastMenuType: session.place_id ? 'place' : null,
      lastMenuItems: items
    });

    return { message: await sendSmsIfAllowed(phone, prompt) };
  }

  if (normalizedCommand.name === 'MAP') {
    const places = await listPlacesForMenu(session.world_id);
    const menu = buildMapReply(places);
    await upsertSession({
      phone,
      userId,
      worldId: session.world_id,
      placeId: session.place_id,
      lastMenuType: 'map',
      lastMenuItems: menu.ids
    });
    return { message: await sendSmsIfAllowed(phone, menu.text) };
  }

  if (normalizedCommand.name === 'ENTER') {
    const placeIdFromMenu = pickByNumber(menuItems, normalizedCommand.args[0]);
    const places = placeIdFromMenu ? await listPlaces(session.world_id) : await listPlaces(session.world_id);
    const fallback = pickByNumber(
      places.map((p) => p.id),
      normalizedCommand.args[0]
    );

    const placeId = placeIdFromMenu ?? fallback;
    if (!placeId) {
      return { message: await sendSmsIfAllowed(phone, 'Invalid place number. Reply MAP to list places.') };
    }

    await enterPlaceAction({ app: input.app, worldId: session.world_id, placeId, userId });
    const place = places.find((p) => p.id === placeId);

    await upsertSession({
      phone,
      userId,
      worldId: session.world_id,
      placeId,
      lastMenuType: 'place',
      lastMenuItems: ['jobs', 'who', 'leave']
    });

    return {
      message: await sendSmsIfAllowed(
        phone,
        `Entered ${place?.name ?? 'place'}. 1) JOBS 2) WHO 3) LEAVE. Reply number or SAY <msg>.`
      )
    };
  }

  if (normalizedCommand.name === 'LEAVE') {
    await leavePlaceAction({ app: input.app, worldId: session.world_id, userId });
    await upsertSession({
      phone,
      userId,
      worldId: session.world_id,
      placeId: null,
      lastMenuType: 'map',
      lastMenuItems: []
    });
    return { message: await sendSmsIfAllowed(phone, 'Left place. Reply MAP to see places.') };
  }

  if (normalizedCommand.name === 'WHO') {
    const counts = await getPresenceSnapshot(session.world_id, session.place_id);
    const placePart = session.place_id ? `, Place online: ${counts.onlinePlace}` : '';
    return { message: await sendSmsIfAllowed(phone, `World online: ${counts.onlineWorld}${placePart}.`) };
  }

  if (normalizedCommand.name === 'JOBS') {
    if (!session.place_id) {
      return { message: await sendSmsIfAllowed(phone, 'Enter a place first. Reply MAP then ENTER <#>.') };
    }

    const jobs = await listJobs(session.place_id, { app: input.app, userId });
    const menu = buildJobsReply(jobs.map((j) => ({ id: j.id, title: j.title })));
    await upsertSession({
      phone,
      userId,
      worldId: session.world_id,
      placeId: session.place_id,
      lastMenuType: 'jobs',
      lastMenuItems: menu.ids
    });

    return { message: await sendSmsIfAllowed(phone, menu.text) };
  }

  if (normalizedCommand.name === 'SAY') {
    if (!session.place_id) {
      return { message: await sendSmsIfAllowed(phone, 'Enter a place first. Reply MAP then ENTER <#>.') };
    }

    if (!normalizedCommand.args[0]) {
      return { message: await sendSmsIfAllowed(phone, 'Usage: SAY <message>') };
    }

    try {
      const message = await sayAction({
        app: input.app,
        worldId: session.world_id,
        placeId: session.place_id,
        userId,
        message: normalizedCommand.args[0]
      });
      return { message: await sendSmsIfAllowed(phone, `You: ${message}`) };
    } catch {
      return { message: await sendSmsIfAllowed(phone, 'Message is empty after sanitization.') };
    }
  }

  if (normalizedCommand.name === 'UNLOCK') {
    if (!session.place_id) {
      return { message: await sendSmsIfAllowed(phone, 'Enter a place first. Reply MAP then ENTER <#>.') };
    }

    let jobId = pickByNumber(menuItems, normalizedCommand.args[0]);
    if (!jobId) {
      const jobs = await listJobs(session.place_id, { app: input.app, userId });
      jobId = pickByNumber(
        jobs.map((j) => j.id),
        normalizedCommand.args[0]
      );
    }

    if (!jobId) {
      return { message: await sendSmsIfAllowed(phone, 'Invalid job number. Reply JOBS for the menu.') };
    }

    const tx = await createUnlockTransaction({
      app: input.app,
      worldId: session.world_id,
      placeId: session.place_id,
      jobId,
      buyerUserId: userId
    });

    return {
      message: await sendSmsIfAllowed(
        phone,
        `Unlock started: ${tx.id}. Pay: ${env.SMS_UNLOCK_BASE_URL}/checkout/${tx.id}`
      )
    };
  }

  return { message: await sendSmsIfAllowed(phone, 'Reply HELP for commands.') };
}
