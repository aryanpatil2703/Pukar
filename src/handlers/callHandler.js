import { createLogger } from '../utils/log.js';
import { CallState, NextAction, Timeouts, Messages, TelnyxEvent } from '../utils/constants.js';
import redisService from '../services/redis.js';
import callControl from '../services/callControl.js';
import { classifyIntent } from '../services/intent.js';
import { decide } from '../services/decisionEngine.js';
import { logCall } from '../services/logger.js';
import audioBridge from '../services/audioBridge.js';
import config from '../config/index.js';

const log = createLogger('callHandler');

// ============================================
// In-Memory Timer Map (single-server MVP)
// ============================================
const responseTimers = new Map();

// ============================================
// Initialize — Register audio bridge callbacks
// ============================================
export function initCallHandler() {
  // When the audio bridge receives a finished transcript
  audioBridge.onTranscript(handleTranscript);
  audioBridge.onSilence(handleSilenceTimeout);
  log.info('Call handler initialized');
}

// ============================================
// Webhook Event Router
// ============================================
export async function handleWebhookEvent(event) {
  const eventType = event.data?.event_type;
  const payload = event.data?.payload || {};
  const callControlId = payload.call_control_id;

  if (!callControlId) {
    log.warn({ eventType }, 'Webhook event missing call_control_id');
    return;
  }

  log.info({ eventType, callControlId }, 'Processing webhook event');

  try {
    switch (eventType) {
      case TelnyxEvent.CALL_INITIATED:
        await handleCallInitiated(callControlId, payload);
        break;

      case TelnyxEvent.CALL_ANSWERED:
        await handleCallAnswered(callControlId, payload);
        break;

      case TelnyxEvent.SPEAK_ENDED:
        await handleSpeakEnded(callControlId, payload);
        break;

      case TelnyxEvent.STREAMING_STARTED:
        log.info({ callControlId }, 'Audio streaming confirmed');
        break;

      case TelnyxEvent.STREAMING_STOPPED:
        log.info({ callControlId }, 'Audio streaming stopped');
        break;

      case TelnyxEvent.CALL_HANGUP:
        await handleCallHangup(callControlId, payload);
        break;

      case TelnyxEvent.CALL_BRIDGED:
        log.info({ callControlId }, 'Call bridged (transfer connected)');
        break;

      default:
        log.debug({ eventType, callControlId }, 'Unhandled event type');
    }
  } catch (err) {
    log.error({ err, eventType, callControlId }, 'Error handling webhook event');
    // Attempt to clean up on error
    await handleError(callControlId, err);
  }
}

// ============================================
// Event Handlers
// ============================================

/**
 * CALL INITIATED — Create session and answer the call.
 */
async function handleCallInitiated(callControlId, payload) {
  const direction = payload.direction || 'incoming';

  // Create call session in Redis
  await redisService.createCallSession(callControlId, {
    direction: direction === 'incoming' ? 'inbound' : 'outbound',
    from: payload.from || '',
    to: payload.to || '',
  });

  await redisService.transitionState(callControlId, CallState.ANSWERING);

  // Answer the call
  if (direction === 'incoming') {
    await callControl.answerCall(callControlId);
  }
  // For outbound calls, Telnyx auto-sends call.answered when the person picks up
}

/**
 * CALL ANSWERED — Play the intro TTS message.
 */
async function handleCallAnswered(callControlId, payload) {
  const session = await redisService.getCallSession(callControlId);

  // Guard: only proceed if we're in the right state
  if (!session) {
    // Session might not exist for outbound calls — create it
    await redisService.createCallSession(callControlId, {
      direction: 'outbound',
      from: payload.from || '',
      to: payload.to || '',
    });
  }

  await redisService.transitionState(callControlId, CallState.INTRO_PLAYING);

  // Store what to do after intro finishes
  await redisService.updateCallSession(callControlId, {
    nextAction: NextAction.START_LISTENING,
  });

  // Speak the intro
  await callControl.speak(callControlId, Messages.INTRO);
}

/**
 * SPEAK ENDED — Execute the next action based on stored state.
 */
async function handleSpeakEnded(callControlId, payload) {
  const session = await redisService.getCallSession(callControlId);
  if (!session) {
    log.warn({ callControlId }, 'speak.ended for unknown session');
    return;
  }

  const nextAction = session.nextAction;
  log.info({ callControlId, nextAction, state: session.state }, 'Speak ended, executing next action');

  // Clear next action
  await redisService.updateCallSession(callControlId, { nextAction: '' });

  switch (nextAction) {
    case NextAction.START_LISTENING:
      await startListening(callControlId);
      break;

    case NextAction.TRANSFER:
      await executeTransfer(callControlId);
      break;

    case NextAction.HANGUP:
      await executeHangup(callControlId);
      break;

    default:
      log.warn({ callControlId, nextAction }, 'Unknown or empty nextAction after speak.ended');
      // Default: start listening if we're in intro phase
      if (session.state === CallState.INTRO_PLAYING) {
        await startListening(callControlId);
      }
  }
}

/**
 * CALL HANGUP — Log the call and clean up.
 */
async function handleCallHangup(callControlId, payload) {
  clearResponseTimer(callControlId);

  const session = await redisService.getCallSession(callControlId);
  if (!session) {
    log.info({ callControlId }, 'Hangup for already-cleaned session');
    return;
  }

  await redisService.transitionState(callControlId, CallState.ENDED);

  // Determine outcome
  let outcome = 'ended';
  if (session.state === CallState.TRANSFERRING) outcome = 'transferred';
  else if (session.state === CallState.ENDING) outcome = 'ended';
  else outcome = 'caller_hangup';

  // Log to PostgreSQL
  await logCall({
    callId: callControlId,
    direction: session.direction,
    from: session.from,
    to: session.to,
    transcript: session.transcript,
    intent: session.intent,
    outcome,
    retryCount: session.retryCount,
    createdAt: session.createdAt,
  });

  await redisService.transitionState(callControlId, CallState.LOGGED);

  // Cleanup
  audioBridge.cleanupCall(callControlId);
  await redisService.deleteCallSession(callControlId);
  log.info({ callControlId, outcome }, 'Call fully processed and cleaned up');
}

// ============================================
// Core Flow Actions
// ============================================

/**
 * Start listening for caller response.
 * Begins audio streaming and sets response timeout.
 */
async function startListening(callControlId) {
  await redisService.transitionState(callControlId, CallState.LISTENING);

  // Build the WebSocket URL for Telnyx to stream audio to
  // This will be the public URL (ngrok in dev) + ws path
  const wsUrl = buildStreamUrl();

  await callControl.startStreaming(callControlId, wsUrl);

  // Set response timeout
  setResponseTimer(callControlId);
  log.info({ callControlId, timeout: Timeouts.RESPONSE_TIMEOUT }, 'Listening for response');
}

/**
 * Handle transcript received from STT.
 */
async function handleTranscript(callControlId, text) {
  log.info({ callControlId, text }, 'Transcript received');

  clearResponseTimer(callControlId);

  const session = await redisService.getCallSession(callControlId);
  if (!session || session.state !== CallState.LISTENING) {
    log.warn({ callControlId, state: session?.state }, 'Transcript received in wrong state');
    return;
  }

  // Stop streaming since we got the response
  try {
    await callControl.stopStreaming(callControlId);
  } catch (err) {
    log.warn({ callControlId, err: err.message }, 'Failed to stop streaming (non-critical)');
  }

  await redisService.transitionState(callControlId, CallState.PROCESSING_INTENT);

  // Store transcript
  const existingTranscript = session.transcript || '';
  const fullTranscript = existingTranscript ? `${existingTranscript} | ${text}` : text;
  await redisService.updateCallSession(callControlId, { transcript: fullTranscript });

  // Classify intent
  const intent = await classifyIntent(text);
  await redisService.updateCallSession(callControlId, { intent });
  await redisService.transitionState(callControlId, CallState.DECISION_MADE);

  log.info({ callControlId, intent, text }, 'Intent classified');

  // Make decision
  const decision = decide(intent, session.retryCount);
  log.info({ callControlId, decision }, 'Decision made');

  // If retrying, increment retry count
  if (!decision.final) {
    await redisService.incrementRetry(callControlId);
  }

  // Store next action and speak the response
  await redisService.transitionState(callControlId, CallState.RESPONDING);
  await redisService.updateCallSession(callControlId, {
    nextAction: decision.nextAction,
  });

  await callControl.speak(callControlId, decision.speakText);
}

/**
 * Handle silence / response timeout.
 */
async function handleSilenceTimeout(callControlId) {
  log.info({ callControlId }, 'Silence timeout — no response detected');
  await handleTranscript(callControlId, '');
}

/**
 * Execute call transfer.
 */
async function executeTransfer(callControlId) {
  await redisService.transitionState(callControlId, CallState.TRANSFERRING);
  log.info({ callControlId, target: config.transferNumber }, 'Executing transfer');

  try {
    await callControl.transferCall(callControlId, config.transferNumber);
  } catch (err) {
    log.error({ callControlId, err }, 'Transfer failed, hanging up');
    await executeHangup(callControlId);
  }
}

/**
 * Execute call hangup.
 */
async function executeHangup(callControlId) {
  await redisService.transitionState(callControlId, CallState.ENDING);
  log.info({ callControlId }, 'Executing hangup');

  try {
    await callControl.hangupCall(callControlId);
  } catch (err) {
    log.error({ callControlId, err }, 'Hangup failed (call may have already ended)');
  }
}

// ============================================
// Timer Management
// ============================================

function setResponseTimer(callControlId) {
  clearResponseTimer(callControlId);

  const timer = setTimeout(async () => {
    log.warn({ callControlId }, 'Response timeout fired');
    responseTimers.delete(callControlId);

    const session = await redisService.getCallSession(callControlId);
    if (session && session.state === CallState.LISTENING) {
      // Stop streaming
      try {
        await callControl.stopStreaming(callControlId);
      } catch (e) { /* ignore */ }

      // Treat timeout as unclear
      await handleTranscript(callControlId, '');
    }
  }, Timeouts.RESPONSE_TIMEOUT);

  responseTimers.set(callControlId, timer);
}

function clearResponseTimer(callControlId) {
  const timer = responseTimers.get(callControlId);
  if (timer) {
    clearTimeout(timer);
    responseTimers.delete(callControlId);
  }
}

// ============================================
// Error Recovery
// ============================================

async function handleError(callControlId, err) {
  log.error({ callControlId, err }, 'Call error — attempting recovery');

  try {
    const session = await redisService.getCallSession(callControlId);

    // Log the error
    await logCall({
      callId: callControlId,
      direction: session?.direction || 'unknown',
      from: session?.from || '',
      to: session?.to || '',
      transcript: session?.transcript || '',
      intent: session?.intent || '',
      outcome: 'error',
      retryCount: session?.retryCount || 0,
      createdAt: session?.createdAt || Date.now(),
      errorMessage: err.message,
    });

    // Try to speak error message and transfer
    try {
      await callControl.speak(callControlId, Messages.ERROR_FALLBACK);
      // The speak.ended handler will transfer
      await redisService.updateCallSession(callControlId, {
        nextAction: NextAction.TRANSFER,
      });
    } catch (speakErr) {
      // If even speaking fails, just try to hangup
      try {
        await callControl.hangupCall(callControlId);
      } catch (hangupErr) {
        log.error({ callControlId }, 'Complete recovery failure');
      }
    }
  } catch (recoveryErr) {
    log.error({ callControlId, recoveryErr }, 'Recovery itself failed');
  }

  // Clean up
  clearResponseTimer(callControlId);
  audioBridge.cleanupCall(callControlId);
}

// ============================================
// Utility
// ============================================

/**
 * Build the WebSocket stream URL.
 * Uses STREAM_URL env var if set, otherwise constructs from ngrok.
 */
function buildStreamUrl() {
  if (process.env.STREAM_URL) {
    return process.env.STREAM_URL;
  }

  // Default: assume ngrok is tunneling the same port
  // User must set STREAM_URL in .env for production
  const host = process.env.NGROK_URL || `localhost:${config.port}`;
  const protocol = host.includes('localhost') ? 'ws' : 'wss';
  return `${protocol}://${host}${config.wsPath}`;
}

export default {
  initCallHandler,
  handleWebhookEvent,
};
