import { Router } from 'express';
import { createLogger } from '../utils/log.js';
import { handleWebhookEvent } from '../handlers/callHandler.js';
import webhookValidator from '../middleware/webhookValidator.js';

const log = createLogger('webhook');
const router = Router();

// ============================================
// POST /webhook — Telnyx Call Control Events
// ============================================
router.post('/webhook', webhookValidator, async (req, res) => {
  const event = req.body;

  // Respond immediately (Telnyx requires fast 200)
  res.sendStatus(200);

  // Log the event type
  const eventType = event.data?.event_type || 'unknown';
  const callControlId = event.data?.payload?.call_control_id || 'unknown';
  log.info({ eventType, callControlId }, 'Webhook received');

  // Process asynchronously (don't block the response)
  setImmediate(async () => {
    try {
      await handleWebhookEvent(event);
    } catch (err) {
      log.error({ err, eventType, callControlId }, 'Async webhook processing failed');
    }
  });
});

// ============================================
// POST /calls/outbound — Initiate an outbound call
// ============================================
router.post('/calls/outbound', async (req, res) => {
  try {
    const { to, from } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Missing "to" phone number' });
    }

    const callControl = (await import('../services/callControl.js')).default;
    const config = (await import('../config/index.js')).default;

    const result = await callControl.dialOutbound(
      to,
      from || config.telnyxPhoneNumber, // Use Telnyx number as caller ID
      config.telnyxConnectionId
    );

    log.info({ to, from }, 'Outbound call initiated');
    res.json({
      success: true,
      message: 'Outbound call initiated',
      data: result?.data || {},
    });
  } catch (err) {
    log.error({ err }, 'Failed to initiate outbound call');
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /health — System health check
// ============================================
router.get('/health', async (req, res) => {
  try {
    const redisService = (await import('../services/redis.js')).default;
    const { testConnection: testDb } = await import('../config/database.js');

    const redisOk = await redisService.testConnection();
    const dbOk = await testDb();

    const healthy = redisOk && dbOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisOk ? 'connected' : 'disconnected',
        postgresql: dbOk ? 'connected' : 'disconnected',
      },
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      error: err.message,
    });
  }
});

export default router;
