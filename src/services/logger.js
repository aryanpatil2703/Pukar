import pool from '../config/database.js';
import { createLogger } from '../utils/log.js';

const log = createLogger('logger');

/**
 * Log a completed call to PostgreSQL.
 *
 * This is fire-and-forget — logging failures should never
 * affect the call flow itself.
 */
export async function logCall(callData) {
  try {
    const {
      callId,
      direction = 'inbound',
      from = '',
      to = '',
      transcript = '',
      intent = '',
      outcome = 'unknown',
      retryCount = 0,
      createdAt = Date.now(),
      errorMessage = null,
    } = callData;

    const durationMs = Date.now() - createdAt;

    await pool.query(
      `INSERT INTO call_logs
        (call_id, direction, from_number, to_number, transcript, intent, outcome, retry_count, duration_ms, error_message, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (call_id) DO UPDATE SET
        transcript = EXCLUDED.transcript,
        intent = EXCLUDED.intent,
        outcome = EXCLUDED.outcome,
        retry_count = EXCLUDED.retry_count,
        duration_ms = EXCLUDED.duration_ms,
        error_message = EXCLUDED.error_message,
        ended_at = NOW()`,
      [callId, direction, from, to, transcript, intent, outcome, retryCount, durationMs, errorMessage]
    );

    log.info({ callId, outcome, intent, durationMs }, 'Call logged to database');
  } catch (err) {
    // Never let logging failures affect the call
    log.error({ err, callId: callData.callId }, 'Failed to log call');
  }
}

/**
 * Fetch aggregate call statistics.
 */
export async function getStats() {
  try {
    const result = await pool.query('SELECT * FROM call_stats');
    return result.rows[0];
  } catch (err) {
    log.error({ err }, 'Failed to fetch call stats');
    throw err;
  }
}

/**
 * Fetch call history logs.
 */
export async function getCallLogs(limit = 50, offset = 0) {
  try {
    const result = await pool.query(
      'SELECT * FROM call_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  } catch (err) {
    log.error({ err }, 'Failed to fetch call logs');
    throw err;
  }
}

export default { logCall, getStats, getCallLogs };
