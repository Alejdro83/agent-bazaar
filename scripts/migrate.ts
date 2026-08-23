/**
 * Applies supabase/schema.sql (and optionally seed.sql) directly against the
 * Supabase Postgres instance via the session pooler (IPv4). One-off admin
 * tool — not part of the app's runtime.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts schema
 *   npx tsx scripts/migrate.ts seed
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

async function run(file: string) {
  const sql = readFileSync(join(__dirname, '..', 'supabase', file), 'utf-8');

  const client = new Client({
    host: process.env.SUPABASE_DB_HOST,
    port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
    database: process.env.SUPABASE_DB_NAME,
    user: process.env.SUPABASE_DB_USER,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log(`Connected. Applying ${file}...`);
  try {
    await client.query(sql);
    console.log(`✓ ${file} applied successfully.`);
  } finally {
    await client.end();
  }
}

const target = process.argv[2];
if (!target || !['schema', 'seed'].includes(target)) {
  console.error('Usage: tsx scripts/migrate.ts <schema|seed>');
  process.exit(1);
}

run(`${target}.sql`).catch((err) => {
  console.error('✗ Migration failed:', err.message);
  process.exit(1);
});
