import type { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { appendEvent } from '../services/events.js';
import {
  createUnlockTransaction,
  emoteAction,
  enterPlaceAction,
  joinWorldAction,
  leavePlaceAction,
  sayAction
} from '../services/gameplay.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });

const enterSchema = z.object({ worldId: z.string().uuid(), placeId: z.string().uuid() });
const joinWorldSchema = z.object({ worldId: z.string().uuid() });
const leaveSchema = z.object({ worldId: z.string().uuid() });
const chatSchema = z.object({ worldId: z.string().uuid(), placeId: z.string().uuid(), message: z.string().min(1).max(500) });
const emoteSchema = z.object({ worldId: z.string().uuid(), placeId: z.string().uuid(), emote: z.string().min(1).max(32).default('WAVE') });
const unlockSchema = z.object({ worldId: z.string().uuid(), placeId: z.string().uuid(), jobId: z.string().uuid(), originWorldId: z.string().uuid().optional() });

const actionsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/actions/join-world', { preHandler: [app.authenticate] }, async (request) => {
    const body = joinWorldSchema.parse(request.body);
    await joinWorldAction({ app, worldId: body.worldId, userId: request.user.userId });
    return { ok: true };
  });

  app.post('/actions/enter-place', { preHandler: [app.authenticate] }, async (request) => {
    const body = enterSchema.parse(request.body);
    await enterPlaceAction({ app, worldId: body.worldId, placeId: body.placeId, userId: request.user.userId });
    return { ok: true };
  });

  app.post('/actions/leave-place', { preHandler: [app.authenticate] }, async (request) => {
    const body = leaveSchema.parse(request.body);
    await leavePlaceAction({ app, worldId: body.worldId, userId: request.user.userId });
    return { ok: true };
  });

  app.post('/actions/say', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 8, timeWindow: '10 seconds' } }
  }, async (request, reply) => {
    const body = chatSchema.parse(request.body);
    try {
      const normalized = await sayAction({
        app,
        worldId: body.worldId,
        placeId: body.placeId,
        userId: request.user.userId,
        message: body.message
      });
      return { ok: true, message: normalized };
    } catch (error) {
      if ((error as Error).message === 'Message is empty after sanitization') {
        reply.code(400).send({ error: 'Message is empty after sanitization' });
        return;
      }
      throw error;
    }
  });

  app.post('/actions/emote', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '10 seconds' } }
  }, async (request) => {
    const body = emoteSchema.parse(request.body);
    await emoteAction({ app, worldId: body.worldId, placeId: body.placeId, userId: request.user.userId, emote: body.emote });
    return { ok: true };
  });

  // Canonical unlock model for MVP: employers buy contact unlock for a job posting.
  app.post('/actions/unlock', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = unlockSchema.parse(request.body);

    if (!['employer', 'recruiter', 'admin'].includes(request.user.role)) {
      reply.code(403).send({ error: 'Only employers/recruiters can initiate unlocks in MVP' });
      return;
    }

    const transaction = await createUnlockTransaction({
      app,
      worldId: body.worldId,
      placeId: body.placeId,
      jobId: body.jobId,
      buyerUserId: request.user.userId,
      originWorldId: body.originWorldId
    });

    return { transaction };
  });

  app.post('/payments/checkout/:transactionId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { transactionId: string };

    const tx = await pool.query('SELECT * FROM unlock_transactions WHERE id = $1', [params.transactionId]);
    if (!tx.rowCount) {
      reply.code(404).send({ error: 'Transaction not found' });
      return;
    }

    if (tx.rows[0]!.buyer_user_id !== request.user.userId) {
      reply.code(403).send({ error: 'Not your transaction' });
      return;
    }

    if (env.STRIPE_SECRET_KEY.startsWith('sk_test_stub')) {
      return {
        checkoutUrl: `https://example.local/checkout/${params.transactionId}`,
        mode: 'stub',
        message: 'Stripe key is stubbed. Use /payments/simulate/:transactionId to mark paid in dev.'
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: tx.rows[0]!.currency,
            unit_amount: tx.rows[0]!.price_cents,
            product_data: {
              name: 'Taktos Contact Unlock'
            }
          }
        }
      ],
      success_url: 'http://localhost:3000/success',
      cancel_url: 'http://localhost:3000/cancel',
      metadata: { transactionId: params.transactionId }
    });

    await pool.query('UPDATE unlock_transactions SET stripe_session_id = $1 WHERE id = $2', [session.id, params.transactionId]);

    return { checkoutUrl: session.url, mode: 'stripe' };
  });

  app.post('/payments/simulate/:transactionId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { transactionId: string };
    const tx = await pool.query('SELECT * FROM unlock_transactions WHERE id = $1', [params.transactionId]);

    if (!tx.rowCount) {
      reply.code(404).send({ error: 'Transaction not found' });
      return;
    }

    await pool.query("UPDATE unlock_transactions SET status = 'paid' WHERE id = $1", [params.transactionId]);
    const event = await appendEvent({
      worldId: tx.rows[0]!.world_id,
      placeId: tx.rows[0]!.place_id,
      userId: request.user.userId,
      type: 'ContactUnlocked',
      payload: { transactionId: params.transactionId, source: 'simulate' }
    });
    app.wsHub.broadcast(event);

    return { ok: true, status: 'paid' };
  });

  app.post('/payments/webhook', async (request, reply) => {
    // Minimal webhook stub for local/dev integration.
    // Production should validate signature using raw body + Stripe webhook secret.
    const body = z
      .object({
        type: z.string(),
        data: z
          .object({
            object: z.object({
              metadata: z.record(z.string(), z.string()).optional()
            })
          })
          .optional()
      })
      .safeParse(request.body);

    if (!body.success) {
      reply.code(400).send({ error: 'Invalid webhook payload' });
      return;
    }

    if (body.data.type === 'checkout.session.completed') {
      const txId = body.data.data?.object.metadata?.transactionId;
      if (txId) {
        const tx = await pool.query(
          "UPDATE unlock_transactions SET status = 'paid' WHERE id = $1 RETURNING world_id, place_id",
          [txId]
        );

        if (tx.rowCount) {
          const appEvent = await appendEvent({
            worldId: tx.rows[0]!.world_id,
            placeId: tx.rows[0]!.place_id,
            type: 'ContactUnlocked',
            payload: { transactionId: txId, source: 'webhook' }
          });
          app.wsHub.broadcast(appEvent);
        }
      }
    }

    reply.code(204).send();
  });
};

export default actionsRoutes;
