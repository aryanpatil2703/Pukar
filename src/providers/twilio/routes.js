import { Router } from 'express';
import twilio from 'twilio';
import { createLogger } from '../../utils/log.js';
import { classifyIntent } from '../../services/intent.js';
import { decide } from '../../services/decisionEngine.js';
import { logCall } from '../../services/logger.js';
import redisService from '../../services/redis.js';
import { makeOutboundCall } from './callControl.js';
import config from '../../config/index.js';
import { CallState, NextAction, Messages, Intent } from '../../utils/constants.js';

const log = createLogger('twilio:routes');
const router = Router();

const VoiceResponse = twilio.twiml.VoiceResponse;

// ============================================
// POST /voice — Incoming call or outbound call answered
// Twilio hits this when a call starts.
// Returns TwiML: Say intro → Gather speech
// ============================================
router.post('/voice', async (req, res) => {
  const callSid = req.body.CallSid;
  const from = req.body.From || '';
  const to = req.body.To || '';
  const direction = req.body.Direction === 'outbound-api' ? 'outbound' : 'inbound';

  log.info({ callSid, from, to, direction }, 'Call started');

  // Create session in Redis
  await redisService.createCallSession(callSid, { direction, from, to });
  await redisService.transitionState(callSid, CallState.INTRO_PLAYING);

  // Build TwiML response
  const twiml = new VoiceResponse();

  // Say the intro
  twiml.say(
    { voice: 'Polly.Joanna', language: 'en-US' },
    Messages.INTRO
  );

  // Gather speech response from caller
  const gather = twiml.gather({
    input: 'speech',
    action: '/handle-response',
    method: 'POST',
    speechTimeout: '5',
    timeout: 15,
    language: 'en-US',
  });

  gather.say(
    { voice: 'Polly.Joanna' },
    'I\'m listening.'
  );

  // If no input received, redirect to timeout handler
  twiml.redirect('/handle-timeout');

  await redisService.transitionState(callSid, CallState.LISTENING);

  res.type('text/xml');
  res.send(twiml.toString());
});

// ============================================
// POST /handle-response — Twilio Gather callback
// Called when the caller finishes speaking.
// SpeechResult contains the transcribed text.
// ============================================
router.post('/handle-response', async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult || '';
  const confidence = req.body.Confidence || '0';

  log.info({ callSid, speechResult, confidence }, 'Speech received');

  const session = await redisService.getCallSession(callSid);
  if (!session) {
    log.warn({ callSid }, 'No session found for handle-response');
    const twiml = new VoiceResponse();
    twiml.say('Sorry, an error occurred. Goodbye.');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Update transcript
  await redisService.transitionState(callSid, CallState.PROCESSING_INTENT);
  const existingTranscript = session.transcript || '';
  const fullTranscript = existingTranscript
    ? `${existingTranscript} | ${speechResult}`
    : speechResult;
  await redisService.updateCallSession(callSid, { transcript: fullTranscript });

  // Classify intent
  const intent = await classifyIntent(speechResult);
  await redisService.updateCallSession(callSid, { intent });
  await redisService.transitionState(callSid, CallState.DECISION_MADE);

  log.info({ callSid, intent, speechResult }, 'Intent classified');

  // Make decision
  const decision = decide(intent, session.retryCount);
  log.info({ callSid, decision }, 'Decision made');

  // Build TwiML response
  const twiml = new VoiceResponse();

  if (decision.nextAction === NextAction.TRANSFER) {
    // Transfer to human agent
    twiml.say({ voice: 'Polly.Joanna' }, decision.speakText);
    twiml.dial(
      { timeout: 30, callerId: req.body.To },
      config.transferNumber
    );
    await redisService.transitionState(callSid, CallState.TRANSFERRING);

  } else if (decision.nextAction === NextAction.HANGUP) {
    // End the call
    twiml.say({ voice: 'Polly.Joanna' }, decision.speakText);
    twiml.hangup();
    await redisService.transitionState(callSid, CallState.ENDING);

  } else if (decision.nextAction === NextAction.START_LISTENING) {
    // Retry — ask again
    await redisService.incrementRetry(callSid);
    twiml.say({ voice: 'Polly.Joanna' }, decision.speakText);

    const gather = twiml.gather({
      input: 'speech',
      action: '/handle-response',
      method: 'POST',
      speechTimeout: '5',
      timeout: 15,
      language: 'en-US',
    });

    gather.say({ voice: 'Polly.Joanna' }, 'I\'m listening.');
    twiml.redirect('/handle-timeout');

    await redisService.transitionState(callSid, CallState.LISTENING);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ============================================
// POST /handle-timeout — No speech detected
// ============================================
router.post('/handle-timeout', async (req, res) => {
  const callSid = req.body.CallSid;
  log.info({ callSid }, 'No speech detected — timeout');

  const session = await redisService.getCallSession(callSid);
  const retryCount = session?.retryCount || 0;

  const twiml = new VoiceResponse();

  if (retryCount < 1) {
    // Retry once
    if (session) await redisService.incrementRetry(callSid);

    twiml.say(
      { voice: 'Polly.Joanna' },
      Messages.CLARIFY
    );

    const gather = twiml.gather({
      input: 'speech',
      action: '/handle-response',
      method: 'POST',
      speechTimeout: '5',
      timeout: 15,
      language: 'en-US',
    });

    gather.say({ voice: 'Polly.Joanna' }, 'I\'m listening.');
    twiml.redirect('/handle-timeout');
  } else {
    // Max retries — transfer to human
    twiml.say({ voice: 'Polly.Joanna' }, Messages.TIMEOUT);
    twiml.dial(
      { timeout: 30, callerId: req.body.To },
      config.transferNumber
    );

    if (session) {
      await redisService.updateCallSession(callSid, { intent: Intent.UNCLEAR });
      await redisService.transitionState(callSid, CallState.TRANSFERRING);
    }
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ============================================
// POST /status — Call status webhook
// Called when the call state changes.
// Used for logging completed calls.
// ============================================
router.post('/status', async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const duration = req.body.CallDuration || '0';

  log.info({ callSid, callStatus, duration }, 'Call status update');

  if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'no-answer' || callStatus === 'busy') {
    const session = await redisService.getCallSession(callSid);

    if (session) {
      // Map Twilio status to our outcomes
      let outcome = 'ended';
      if (session.state === CallState.TRANSFERRING) outcome = 'transferred';
      else if (callStatus === 'failed') outcome = 'error';
      else if (callStatus === 'no-answer') outcome = 'no_answer';
      else if (callStatus === 'busy') outcome = 'busy';

      await logCall({
        callId: callSid,
        direction: session.direction,
        from: session.from,
        to: session.to,
        transcript: session.transcript,
        intent: session.intent,
        outcome,
        retryCount: session.retryCount,
        createdAt: session.createdAt,
      });

      await redisService.transitionState(callSid, CallState.LOGGED);
      await redisService.deleteCallSession(callSid);
      log.info({ callSid, outcome }, 'Call logged and cleaned up');
    }
  }

  res.sendStatus(200);
});

// ============================================
// POST /calls/outbound — Initiate outbound call
// ============================================
router.post('/calls/outbound', async (req, res) => {
  try {
    const { to, from } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Missing "to" phone number' });
    }

    const result = await makeOutboundCall(
      to,
      from || config.twilioPhoneNumber
    );

    log.info({ to, callSid: result.callSid }, 'Outbound call initiated');
    res.json({
      success: true,
      message: 'Outbound call initiated',
      data: result,
    });
  } catch (err) {
    log.error({ err: err.message }, 'Failed to initiate outbound call');
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ============================================
// GET /health — Health check (Twilio version)
// ============================================
router.get('/health', async (req, res) => {
  try {
    const redisOk = await redisService.testConnection();
    const { testConnection: testDb } = await import('../../config/database.js');
    const dbOk = await testDb();

    const healthy = redisOk && dbOk;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      provider: 'twilio',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisOk ? 'connected' : 'disconnected',
        postgresql: dbOk ? 'connected' : 'disconnected',
      },
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

export default router;
