import express from 'express';
import http from 'http';
import config from './src/config/index.js';
import { createLogger } from './src/utils/log.js';
import { testConnection as testRedis } from './src/services/redis.js';
import { testConnection as testDb } from './src/config/database.js';
import apiRoutes from './src/routes/api.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const log = createLogger('server');

// ============================================
// Express App
// ============================================
const app = express();

// Parse JSON bodies (for Telnyx webhooks)
app.use(express.json());

// Parse URL-encoded bodies (for Twilio webhooks)
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  if (req.path !== '/health') {
    log.info({ method: req.method, path: req.path }, 'Request');
  }
  next();
});

// ============================================
// Mount Routes Based on Provider
// ============================================
async function mountRoutes() {
  if (config.provider === 'twilio') {
    const twilioRoutes = (await import('./src/providers/twilio/routes.js')).default;
    app.use('/', twilioRoutes);
    log.info('📱 Twilio routes mounted');
  } else {
    // Default: Telnyx
    const telnyxRoutes = (await import('./src/routes/webhook.js')).default;
    app.use('/', telnyxRoutes);
    log.info('📡 Telnyx routes mounted');
  }

  // Mount API routes
  app.use('/api', apiRoutes);
  log.info('🔗 API routes mounted');

  // Serve static frontend in production
  app.use(express.static(path.join(__dirname, 'frontend/dist')));
}

// 404 handler (mounted after routes)
function mount404() {
  // SPA support: redirect all other requests to index.html (except for API/webhooks)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
      return next();
    }
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'), (err) => {
      if (err) next();
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    log.error({ err }, 'Unhandled express error');
    res.status(500).json({ error: 'Internal server error' });
  });
}

// ============================================
// Start Server
// ============================================
async function start() {
  log.info('='.repeat(50));
  log.info('🚀 AI Voice Call Agent — Starting...');
  log.info('='.repeat(50));
  log.info({
    provider: config.provider.toUpperCase(),
    company: config.companyName,
    transferNumber: config.transferNumber,
  });

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

  // Mount provider-specific routes
  await mountRoutes();
  mount404();

  // Create HTTP server
  const server = http.createServer(app);

  // Provider-specific initialization
  if (config.provider === 'telnyx') {
    const { initCallHandler } = await import('./src/handlers/callHandler.js');
    initCallHandler();
  }

  // Start listening
  server.listen(config.port, () => {
    log.info('='.repeat(50));
    log.info(`✅ Server running on port ${config.port}`);
    log.info(`🔌 Provider:     ${config.provider.toUpperCase()}`);

    if (config.provider === 'twilio') {
      log.info(`📞 Voice URL:    http://localhost:${config.port}/voice`);
      log.info(`📥 Response:     http://localhost:${config.port}/handle-response`);
      log.info(`📊 Status:       http://localhost:${config.port}/status`);
    } else {
      log.info(`📡 Webhook URL:  http://localhost:${config.port}/webhook`);
    }

    log.info(`❤️  Health:       http://localhost:${config.port}/health`);
    log.info(`📞 Outbound:     POST http://localhost:${config.port}/calls/outbound`);
    log.info('='.repeat(50));
    log.info('');
    log.info('👉 Next steps:');
    log.info('   1. Run ngrok:  ngrok http ' + config.port);

    if (config.provider === 'twilio') {
      log.info('   2. Set PUBLIC_URL in .env to:  https://<ngrok-url>');
      log.info('   3. Set Twilio webhook (Voice URL) to: https://<ngrok-url>/voice');
      log.info('   4. Set Twilio status callback to:     https://<ngrok-url>/status');
    } else {
      log.info('   2. Set Telnyx webhook URL to:   https://<ngrok-url>/webhook');
    }
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
