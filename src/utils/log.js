import pino from 'pino';

/**
 * Create a child logger with a given component name.
 * Uses pino for structured JSON logging in production.
 */
const rootLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
});

export function createLogger(component) {
  return rootLogger.child({ component });
}

export default rootLogger;
