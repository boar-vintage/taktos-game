import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { handleInboundSms } from '../services/sms/service.js';
import { buildTwimlMessage, validateTwilioSignature } from '../services/sms/twilio.js';

const bodySchema = z.object({
  From: z.string(),
  Body: z.string().default('')
});

const smsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sms/inbound', async (request, reply) => {
    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      reply.header('Content-Type', 'text/xml');
      return buildTwimlMessage(null);
    }

    const signature = request.headers['x-twilio-signature'];
    const sigValue = Array.isArray(signature) ? signature[0] : signature;

    if (env.TWILIO_AUTH_TOKEN) {
      const host = (request.headers['x-forwarded-host'] as string | undefined) ?? request.headers.host ?? 'localhost';
      const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? request.protocol;
      const path = request.raw.url ?? '/sms/inbound';
      const url = `${proto}://${host}${path}`;

      const params = Object.fromEntries(
        Object.entries(request.body as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])
      );

      const valid = validateTwilioSignature({
        authToken: env.TWILIO_AUTH_TOKEN,
        signature: sigValue,
        url,
        params
      });

      if (!valid) {
        reply.code(403);
        reply.header('Content-Type', 'text/xml');
        return buildTwimlMessage(null);
      }
    }

    const result = await handleInboundSms({
      app,
      from: body.data.From,
      body: body.data.Body
    });

    reply.header('Content-Type', 'text/xml');
    return buildTwimlMessage(result.message);
  });
};

export default smsRoutes;
