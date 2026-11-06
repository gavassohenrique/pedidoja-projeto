import fs from 'node:fs';
import pg from 'pg';
import { requiredConfig } from './config.js';

let pool;
export function database() {
  if (!pool) {
    const connectionString = requiredConfig('DATABASE_URL');
    const caFile = process.env.PG_SSL_CA_FILE;
    if (process.env.NODE_ENV === 'production' && !caFile) {
      throw new Error('Producao exige PG_SSL_CA_FILE para TLS com CA validada');
    }
    pool = new pg.Pool({
      connectionString,
      ...(caFile ? { ssl: { ca: fs.readFileSync(caFile, 'utf8'), rejectUnauthorized: true } } : {}),
      max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000
    });
  }
  return pool;
}
export async function transaction(fn) {
  const db = database();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}
