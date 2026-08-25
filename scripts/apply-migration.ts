/**
 * Applies an arbitrary file from supabase/migrations/ against the production
 * Supabase Postgres instance. One-off admin tool, same connection style as
 * scripts/migrate.ts (which only knows schema.sql/seed.sql).
 *
 * Usage: npx tsx scripts/apply-migration.ts 004_agent_strategy.sql
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

async function run(file: string) {
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', file), 'utf-8');

  const client = new Client({
    host: process.env.SUPABASE_DB_HOST,
    port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
    database: process.env.SUPABASE_DB_NAME,
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log(`Connected. Applying migrations/${file}...`);
  try {
    await client.query(sql);
    console.log(`✓ ${file} applied successfully.`);
  } finally {
    await client.end();
  }
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: tsx scripts/apply-migration.ts <filename in supabase/migrations/>');
  process.exit(1);
}

run(target).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
