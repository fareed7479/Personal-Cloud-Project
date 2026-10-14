import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  STORAGE_ROOT: z.string().default('./storage_root'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  CORS_ORIGIN: z.string().default('*'),
  SERVER_NAME: z.string().default('Personal Cloud Server'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  HTTPS_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),
  SSL_KEY_PATH: z.string().optional(),
  SSL_CERT_PATH: z.string().optional(),
  SSL_CA_PATH: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment configuration:', parsedEnv.error.format());
  throw new Error('Invalid environment configuration');
}

const rawConfig = parsedEnv.data;

export const config = {
  ...rawConfig,
  isDev: rawConfig.NODE_ENV === 'development',
  isProd: rawConfig.NODE_ENV === 'production',
  isTest: rawConfig.NODE_ENV === 'test',
  resolvedStorageRoot: path.isAbsolute(rawConfig.STORAGE_ROOT)
    ? path.normalize(rawConfig.STORAGE_ROOT)
    : path.resolve(process.cwd(), rawConfig.STORAGE_ROOT),
};

export type AppConfig = typeof config;
