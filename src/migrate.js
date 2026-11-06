import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { database } from './lib/db.js';

export async function migrate() {
  const db = database();
  const client = await db.connect();
  try {
    // Mesma conexao durante lock, consultas e desbloqueio.
    await client.query('SELECT pg_advisory_lock(42509173)');
    await client.query('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');
    const files = (await fs.readdir(root)).filter(x => /^\d+_.+\.sql$/.test(x)).sort();
    for (const name of files) {
      const exists = await client.query('SELECT 1 FROM migrations WHERE name=$1', [name]);
      if (exists.rowCount) continue;
      try {
        await client.query('BEGIN');
        await client.query(await fs.readFile(path.join(root, name), 'utf8'));
        await client.query('INSERT INTO migrations(name) VALUES($1)', [name]);
        await client.query('COMMIT');
        console.log(`Migration aplicada: ${name}`);
      } catch (err) { await client.query('ROLLBACK'); throw err; }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(42509173)');
    client.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => database().end()).catch(e => { console.error(e); process.exit(1); });
}
