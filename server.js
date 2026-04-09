import express from 'express';
import http from 'http';
import config from './src/config/index.js';
import { createLogger } from './src/utils/log.js';
import routes from './src/routes/webhook.js';
import { initAudioBridge } from './src/services/audioBridge.js';
import { initCallHandler } from './src/handlers/callHandler.js';
import { testConnection as testRedis } from './src/services/redis.js';
import { testConnection as testDb } from './src/config/database.js';

const log = createLogger('server');

// ============================================
// Express App
// ============================================
const app = express();

// Parse JSON bodies
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  if (req.path !== '/health') {
    log.info({ method: req.method, path: req.path }, 'Request');
  }
  next();
});

// Mount routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  log.error({ err }, 'Unhandled express error');
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// Start Server
// ============================================
async function start() {
  log.info('='.repeat(50));
  log.info('🚀 AI Voice Call Agent — Starting...');
  log.info('='.repeat(50));
  log.info({ company: config.companyName, transferNumber: config.transferNumber });

  // Test connections
  const redisOk = await testRedis();
  const dbOk = await testDb();

  if (!redisOk) {
    log.error('❌ Redis connection failed — cannot start');
    process.exit(1);
  }

  if (!dbOk) {
    log.warn('⚠️  PostgreSQL connection failed — logging will be disabled');
  }

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize WebSocket audio bridge on the same server
  initAudioBridge(server);

  // Initialize call handler (registers audio bridge callbacks)
  initCallHandler();

  // Start listening
  server.listen(config.port, () => {
    log.info('='.repeat(50));
    log.info(`✅ Server running on port ${config.port}`);
    log.info(`📡 Webhook URL:  http://localhost:${config.port}/webhook`);
    log.info(`🔊 Audio WS:     ws://localhost:${config.port}${config.wsPath}`);
    log.info(`❤️  Health:       http://localhost:${config.port}/health`);
    log.info(`📞 Outbound:     POST http://localhost:${config.port}/calls/outbound`);
    log.info('='.repeat(50));
    log.info('');
    log.info('👉 Next steps:');
    log.info('   1. Run ngrok:  ngrok http ' + config.port);
    log.info('   2. Set STREAM_URL in .env to:  wss://<ngrok-url>/audio');
    log.info('   3. Set Telnyx webhook URL to:   https://<ngrok-url>/webhook');
    log.info('');
  });

  // ============================================
  // Graceful Shutdown
  // ============================================
  const shutdown = async (signal) => {
    log.info({ signal }, 'Shutting down...');

    server.close(() => {
      log.info('HTTP server closed');
    });

    try {
      const { redisClient } = await import('./src/services/redis.js');
      await redisClient.quit();
      log.info('Redis disconnected');
    } catch (e) { /* ignore */ }

    try {
      const pool = (await import('./src/config/database.js')).default;
      await pool.end();
      log.info('PostgreSQL disconnected');
    } catch (e) { /* ignore */ }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Uncaught errors
  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (err) => {
    log.error({ err }, 'Unhandled promise rejection');
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
