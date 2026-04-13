import { Router } from 'express';
import { createLogger } from '../utils/log.js';
import { getStats, getCallLogs } from '../services/logger.js';
import config from '../config/index.js';
import redisService from '../services/redis.js';

const log = createLogger('api');
const router = Router();

// ============================================
// GET /api/stats — Aggregate Call Stats
// ============================================
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats || { total_calls: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// GET /api/calls — Call History Logs
// ============================================
router.get('/calls', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const calls = await getCallLogs(limit, offset);
    res.json(calls);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// ============================================
// GET /api/config — Public Config info
// ============================================
router.get('/config', (req, res) => {
  res.json({
    provider: config.provider,
    companyName: config.companyName,
    publicUrl: config.publicUrl,
  });
});

// ============================================
// GET /api/active — Count active sessions in Redis
// ============================================
router.get('/active', async (req, res) => {
  try {
    const activeKeys = await redisService.redisClient.keys('call:*');
    res.json({ active_count: activeKeys.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active calls' });
  }
});

// ============================================
// POST /api/calls/outbound — Trigger an outbound call
// ============================================
router.post('/calls/outbound', async (req, res) => {
  try {
    const { to, from } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Missing "to" phone number' });
    }

    let result;

    if (config.provider === 'twilio') {
      const { makeOutboundCall } = await import('../providers/twilio/callControl.js');
      result = await makeOutboundCall(
        to,
        from || config.twilioPhoneNumber
      );
    } else {
      // Default: Telnyx
      const callControl = (await import('../services/callControl.js')).default;
      result = await callControl.dialOutbound(
        to,
        from || config.telnyxPhoneNumber,
        config.telnyxConnectionId
      );
    }

    log.info({ to, provider: config.provider }, 'Outbound call triggered via Dashboard');
    res.json({
      success: true,
      message: 'Outbound call initiated',
      data: result,
    });
  } catch (err) {
    log.error({ err: err.message }, 'Failed to trigger outbound call via Dashboard');
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
