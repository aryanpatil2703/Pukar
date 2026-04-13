import Redis from 'ioredis';
import config from '../config/index.js';
import { createLogger } from '../utils/log.js';
import { CallState, Timeouts } from '../utils/constants.js';

const log = createLogger('redis');

// ============================================
// Redis Client
// ============================================
const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000);
    log.warn({ attempt: times, delay }, 'Redis reconnecting...');
    return delay;
  },
  lazyConnect: false,
});

redis.on('connect', () => log.info('Redis connected'));
redis.on('error', (err) => log.error({ err }, 'Redis error'));

// ============================================
// Call Session Management
// ============================================

const keyFor = (callId) => `call:${callId}`;
const historyKeyFor = (callId) => `call:${callId}:history`;

/**
 * Create a new call session in Redis.
 */
export async function createCallSession(callId, metadata = {}) {
  const session = {
    callId,
    state: CallState.INIT,
    retryCount: 0,
    intent: '',
    transcript: '',
    nextAction: '',
    direction: metadata.direction || 'inbound',
    from: metadata.from || '',
    to: metadata.to || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const key = keyFor(callId);
  await redis.hmset(key, session);
  await redis.expire(key, Timeouts.CALL_SESSION_TTL);
  log.info({ callId, state: CallState.INIT }, 'Call session created');
  return session;
}

/**
 * Append a message to the call's conversation history.
 */
export async function addMessageToHistory(callId, role, content) {
  const key = historyKeyFor(callId);
  const message = `${role}:${content}`;
  await redis.rpush(key, message);
  await redis.expire(key, Timeouts.CALL_SESSION_TTL);
}

/**
 * Retrieve the full conversation history for a call.
 */
export async function getHistory(callId) {
  const key = historyKeyFor(callId);
  const raw = await redis.lrange(key, 0, -1);
  
  return raw.map(msg => {
    const [role, ...contentParts] = msg.split(':');
    return { role, content: contentParts.join(':') };
  });
}

/**
 * Get the full call session.
 */
export async function getCallSession(callId) {
  const data = await redis.hgetall(keyFor(callId));
  if (!data || !data.callId) return null;

  // Parse numeric fields
  data.retryCount = parseInt(data.retryCount, 10) || 0;
  data.createdAt = parseInt(data.createdAt, 10) || 0;
  data.updatedAt = parseInt(data.updatedAt, 10) || 0;
  return data;
}

/**
 * Update fields on a call session.
 */
export async function updateCallSession(callId, updates) {
  const key = keyFor(callId);
  updates.updatedAt = Date.now();
  await redis.hmset(key, updates);
  log.debug({ callId, updates }, 'Call session updated');
}

/**
 * Get only the current state.
 */
export async function getCallState(callId) {
  return await redis.hget(keyFor(callId), 'state');
}

/**
 * Transition to a new state (with logging).
 */
export async function transitionState(callId, newState) {
  const currentState = await getCallState(callId);
  log.info({ callId, from: currentState, to: newState }, 'State transition');
  await updateCallSession(callId, { state: newState });
}

/**
 * Increment retry count and return new value.
 */
export async function incrementRetry(callId) {
  const val = await redis.hincrby(keyFor(callId), 'retryCount', 1);
  return val;
}

/**
 * Delete a call session (cleanup after logging).
 */
export async function deleteCallSession(callId) {
  await redis.del(keyFor(callId), historyKeyFor(callId));
  log.info({ callId }, 'Call session and history deleted');
}

/**
 * Test Redis connectivity.
 */
export async function testConnection() {
  try {
    await redis.ping();
    log.info('Redis ping OK');
    return true;
  } catch (err) {
    log.error({ err }, 'Redis ping failed');
    return false;
  }
}

export { redis as redisClient };
export default {
  createCallSession,
  addMessageToHistory,
  getHistory,
  getCallSession,
  updateCallSession,
  getCallState,
  transitionState,
  incrementRetry,
  deleteCallSession,
  testConnection,
};
