import { config } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });
config();

async function migrate(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  const local = /localhost|127\.0\.0\.1|@postgres[:/]/.test(url);
  const sql = postgres(url, { max: 1, ssl: local ? false : { rejectUnauthorized: false } });
  const dir = process.env.MIGRATIONS_DIR
    ? resolve(process.env.MIGRATIONS_DIR)
    : resolve(process.cwd(), '../../infra/database/migrations');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const applied = new Set(
    (await sql<{ id: string }[]>`SELECT id FROM schema_migrations`).map((row) => row.id),
  );
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file}`);
      continue;
    }
    const body = await readFile(resolve(dir, file), 'utf8');
    await sql.unsafe(body);
    await sql`INSERT INTO schema_migrations (id) VALUES (${file}) ON CONFLICT (id) DO NOTHING`;
    console.log(`applied ${file}`);
  }
  await sql.end();
  console.log('migrations complete');
}

void migrate().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
