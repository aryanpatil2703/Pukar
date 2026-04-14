import { createLogger } from '../utils/log.js';
import { CallState, NextAction, Timeouts, Messages, TelnyxEvent } from '../utils/constants.js';
import redisService from '../services/redis.js';
import callControl from '../services/callControl.js';
import ai from '../services/ai.js';
import { logCall } from '../services/logger.js';
import config from '../config/index.js';

const log = createLogger('callHandler');

// ============================================
// In-Memory Timer Map (single-server MVP)
// ============================================
const responseTimers = new Map();

// ============================================
// Initialize
// ============================================
export function initCallHandler() {
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
      case TelnyxEvent.STREAMING_STOPPED:
        // Ignore streaming events as we now use native transcription
        break;

      case TelnyxEvent.TRANSCRIPTION:
        await handleTranscriptionPayload(callControlId, payload);
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

  // Add intro to history so AI knows what it said
  await redisService.addMessageToHistory(callControlId, 'assistant', Messages.INTRO);
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
  await redisService.deleteCallSession(callControlId);
  log.info({ callControlId, outcome }, 'Call fully processed and cleaned up');
}

// ============================================
// Core Flow Actions
// ============================================

/**
 * Start listening for caller response.
 * Begins native Telnyx transcription and sets response timeout.
 */
async function startListening(callControlId) {
  await redisService.transitionState(callControlId, CallState.LISTENING);

  await callControl.startTranscription(callControlId);

  // Store start time for latency tracking
  await redisService.updateCallSession(callControlId, {
    listeningStartTime: Date.now()
  });

  // Set response timeout
  setResponseTimer(callControlId);
  log.info({ callControlId, timeout: Timeouts.RESPONSE_TIMEOUT }, 'Listening for response via Telnyx STT');
}

/**
 * Handle native transcription webhook payloads.
 */
async function handleTranscriptionPayload(callControlId, payload) {
  const data = payload.transcription_data;
  if (!data) return;
  
  if (data.is_final) {
    const text = data.transcript || '';
    await handleTranscript(callControlId, text);
  }
}

/**
 * Handle transcript received from STT.
 */
async function handleTranscript(callControlId, text) {
  const processStart = process.hrtime.bigint();
  const session = await redisService.getCallSession(callControlId);
  
  // Calculate STT Latency (Edge-to-Brain)
  const sttLatency = session?.listeningStartTime ? (Date.now() - session.listeningStartTime) : 0;
  
  log.info({ callControlId, text, sttLatency: `${sttLatency}ms` }, 'Transcript received');

  clearResponseTimer(callControlId);

  // OPTIMIZATION: Start stopTranscription and state transition in background
  // to prioritize start of AI generation.
  Promise.all([
    callControl.stopTranscription(callControlId).catch(() => {}),
    redisService.transitionState(callControlId, CallState.PROCESSING_INTENT).catch(() => {})
  ]);

  // Generate dynamic response using Conversational AI
  const aiStart = process.hrtime.bigint();
  const aiResult = await ai.generateResponse(callControlId, text || '(Silence)');
  const aiEnd = process.hrtime.bigint();
  const llmLatency = Number(aiEnd - aiStart) / 1_000_000;
  
  // FINAL SAFETY CHECK: Is the call still alive after the AI finished thinking?
  const [currentSession] = await Promise.all([
    redisService.getCallSession(callControlId),
    redisService.transitionState(callControlId, CallState.RESPONDING).catch(() => {})
  ]);

  if (!currentSession || currentSession.state === CallState.ENDED || currentSession.state === CallState.LOGGED) {
    log.warn({ callControlId }, 'Call ended while AI was processing — cancelling response');
    return;
  }

  // Determine next action
  const nextAction = aiResult.nextAction === 'listen' 
    ? NextAction.START_LISTENING 
    : aiResult.nextAction;

  // Update session with new intent and accumulated transcript
  const updatedTranscript = session.transcript 
    ? `${session.transcript}\nUser: ${text}` 
    : `User: ${text}`;

  await redisService.updateCallSession(callControlId, {
    intent: aiResult.intent || session.intent,
    transcript: updatedTranscript,
    nextAction: nextAction,
  });

  await callControl.speak(callControlId, aiResult.response);

  const processEnd = process.hrtime.bigint();
  const totalTurnaround = Number(processEnd - processStart) / 1_000_000;

  log.info({
    callControlId,
    metrics: {
      stt_latency: `${sttLatency}ms`,
      llm_latency: `${llmLatency.toFixed(2)}ms`,
      total_processing: `${totalTurnaround.toFixed(2)}ms`
    }
  }, 'Turn completed');
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
      // Stop transcription
      try {
        await callControl.stopTranscription(callControlId);
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
      // The speak.ended handler will hangup
      await redisService.updateCallSession(callControlId, {
        nextAction: NextAction.HANGUP,
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
}

export default {
  initCallHandler,
  handleWebhookEvent,
};
