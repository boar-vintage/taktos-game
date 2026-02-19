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
  UNLOCK_CURRENCY: z.string().default('usd')
});

export const env = envSchema.parse(process.env);
