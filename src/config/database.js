import pkg from 'pg';
const { Pool } = pkg;
import config from './index.js';
import { createLogger } from '../utils/log.js';

const log = createLogger('database');

// ============================================
// PostgreSQL Connection Pool
// ============================================
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  log.error({ err }, 'Unexpected PostgreSQL pool error');
});

/**
 * Test database connectivity
 */
export async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    log.info('PostgreSQL connected successfully');
    return true;
  } catch (err) {
    log.error({ err }, 'PostgreSQL connection failed');
    return false;
  }
}

export default pool;
