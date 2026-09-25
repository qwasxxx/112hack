import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });
config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug']).default('info'),
  DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(8).default('change-me-in-local-dev'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean)),
  STT_HEALTH_URL: z.string().default('http://127.0.0.1:8090/health'),
  LLM_HEALTH_URL: z.string().default('http://127.0.0.1:8091/health'),
  TTS_HEALTH_URL: z.string().default('http://127.0.0.1:8092/health'),
  BACKUP_DIR: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(raw);
}
