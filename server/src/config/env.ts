import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().default('postgres://taktos:taktos@localhost:5432/taktos'),
  JWT_SECRET: z.string().min(16).default('dev-jwt-secret-change-me-123'),
  STRIPE_SECRET_KEY: z.string().default('sk_test_stub'),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_stub'),
  UNLOCK_PRICE_CENTS: z.coerce.number().int().positive().default(2500),
  UNLOCK_CURRENCY: z.string().default('usd'),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_PHONE_NUMBER: z.string().default(''),
  SMS_MAX_INBOUND_PER_DAY: z.coerce.number().int().positive().default(30),
  SMS_MAX_OUTBOUND_PER_DAY: z.coerce.number().int().positive().default(30),
  SMS_BURST_LIMIT_PER_SEC: z.coerce.number().positive().default(1),
  SMS_SUPPORT_URL: z.string().default('https://example.local/support'),
  SMS_UNLOCK_BASE_URL: z.string().default('https://example.local'),
  ACTION_LINK_SECRET: z.string().min(16).default('dev-action-link-secret-123'),
  HTML_ONLINE_WINDOW_SECONDS: z.coerce.number().int().min(60).max(120).default(90)
});

export const env = envSchema.parse(process.env);
