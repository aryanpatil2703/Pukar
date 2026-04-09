import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/callbot',
});

const MIGRATION_SQL = `
-- ============================================
-- AI Voice Call Agent — Database Schema
-- ============================================

-- Create the database if it doesn't exist
-- (Run manually: CREATE DATABASE callbot;)

-- Call Logs Table
CREATE TABLE IF NOT EXISTS call_logs (
  id            SERIAL PRIMARY KEY,
  call_id       VARCHAR(255) UNIQUE NOT NULL,
  direction     VARCHAR(20) NOT NULL DEFAULT 'inbound',
  from_number   VARCHAR(50),
  to_number     VARCHAR(50),
  transcript    TEXT,
  intent        VARCHAR(50),
  outcome       VARCHAR(50) NOT NULL DEFAULT 'unknown',
  retry_count   INTEGER DEFAULT 0,
  duration_ms   INTEGER,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  ended_at      TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_outcome    ON call_logs(outcome);
CREATE INDEX IF NOT EXISTS idx_call_logs_intent     ON call_logs(intent);
CREATE INDEX IF NOT EXISTS idx_call_logs_direction  ON call_logs(direction);

-- Summary view for quick stats
CREATE OR REPLACE VIEW call_stats AS
SELECT
  COUNT(*)                                          AS total_calls,
  COUNT(*) FILTER (WHERE outcome = 'transferred')   AS transferred,
  COUNT(*) FILTER (WHERE outcome = 'ended')          AS ended,
  COUNT(*) FILTER (WHERE outcome = 'caller_hangup')  AS caller_hangup,
  COUNT(*) FILTER (WHERE outcome = 'error')          AS errors,
  COUNT(*) FILTER (WHERE intent = 'available')       AS intent_available,
  COUNT(*) FILTER (WHERE intent = 'not_available')   AS intent_not_available,
  COUNT(*) FILTER (WHERE intent = 'callback_later')  AS intent_callback,
  COUNT(*) FILTER (WHERE intent = 'unclear')         AS intent_unclear,
  ROUND(AVG(duration_ms))                            AS avg_duration_ms,
  MIN(created_at)                                     AS first_call,
  MAX(created_at)                                     AS last_call
FROM call_logs;
`;

async function migrate() {
  console.log('🔄 Running database migration...');
  console.log(`   Database: ${process.env.DATABASE_URL || 'postgresql://localhost:5432/callbot'}`);

  try {
    await pool.query(MIGRATION_SQL);
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('   Tables created:');
    console.log('   - call_logs (stores all call records)');
    console.log('');
    console.log('   Views created:');
    console.log('   - call_stats (aggregate call statistics)');
    console.log('');

    // Verify
    const result = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'call_logs' ORDER BY ordinal_position`
    );
    console.log('   Columns:');
    result.rows.forEach((row) => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('');
    console.error('   Make sure:');
    console.error('   1. PostgreSQL is running');
    console.error('   2. The database "callbot" exists (CREATE DATABASE callbot;)');
    console.error('   3. DATABASE_URL in .env is correct');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
