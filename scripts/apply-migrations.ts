/**
 * Apply SQL migration files against POSTGRES_URL.
 * Run: npx tsx scripts/apply-migrations.ts scripts/0002_agentic_upgrade.sql scripts/0003_seed_skills.sql
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { Client } from 'pg';

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: tsx scripts/apply-migrations.ts <file.sql> [...]');
    process.exit(1);
  }
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('POSTGRES_URL is not set');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected to Postgres.');

  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    process.stdout.write(`Applying ${file} … `);
    await client.query(sql); // simple-query protocol runs all statements
    console.log('✅');
  }

  await client.end();
  console.log('All migrations applied.');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
