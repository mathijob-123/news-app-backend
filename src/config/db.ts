import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('[Database Pool Error]:', err.message);
});

export async function testDbConnection(): Promise<boolean> {
  if (!connectionString) {
    console.warn('[Database] DATABASE_URL is not defined in .env. Operating in in-memory fallback mode.');
    return false;
  }
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW() as connected_at, current_database() as db_name');
    client.release();
    console.log(`[Database Connected] Supabase PostgreSQL: ${res.rows[0].db_name} at ${res.rows[0].connected_at}`);
    return true;
  } catch (err: any) {
    console.error('[Database Connection Failed]:', err.message);
    return false;
  }
}
