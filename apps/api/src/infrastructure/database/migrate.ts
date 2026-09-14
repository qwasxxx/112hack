import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../../.env') });

async function migrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL is not set; skip migrate');
    return;
  }
  console.log('Apply SQL from infra/database/migrations with your Postgres client.');
}

void migrate();
