// ============================================
// Call States — Strict State Machine
// ============================================
export const CallState = Object.freeze({
  INIT: 'INIT',
  ANSWERING: 'ANSWERING',
  INTRO_PLAYING: 'INTRO_PLAYING',
  LISTENING: 'LISTENING',
  PROCESSING_INTENT: 'PROCESSING_INTENT',
  DECISION_MADE: 'DECISION_MADE',
  RESPONDING: 'RESPONDING',
  TRANSFERRING: 'TRANSFERRING',
  ENDING: 'ENDING',
  ENDED: 'ENDED',
  LOGGED: 'LOGGED',
});

// Valid state transitions
export const ValidTransitions = Object.freeze({
  [CallState.INIT]: [CallState.ANSWERING],
  [CallState.ANSWERING]: [CallState.INTRO_PLAYING],
  [CallState.INTRO_PLAYING]: [CallState.LISTENING],
  [CallState.LISTENING]: [CallState.PROCESSING_INTENT],
  [CallState.PROCESSING_INTENT]: [CallState.DECISION_MADE],
  [CallState.DECISION_MADE]: [CallState.RESPONDING, CallState.TRANSFERRING, CallState.ENDING],
  [CallState.RESPONDING]: [CallState.LISTENING, CallState.TRANSFERRING, CallState.ENDING],
  [CallState.TRANSFERRING]: [CallState.ENDED],
  [CallState.ENDING]: [CallState.ENDED],
  [CallState.ENDED]: [CallState.LOGGED],
  [CallState.LOGGED]: [],
});

// ============================================
// Intents
// ============================================
export const Intent = Object.freeze({
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not_available',
  CALLBACK_LATER: 'callback_later',
  UNCLEAR: 'unclear',
});

// ============================================
// Next Actions (stored in Redis after speak)
// ============================================
export const NextAction = Object.freeze({
  START_LISTENING: 'start_listening',
  TRANSFER: 'transfer',
  HANGUP: 'hangup',
});

// ============================================
// Timeouts (ms)
// ============================================
export const Timeouts = Object.freeze({
  RESPONSE_TIMEOUT: 10000,   // Max wait for caller response (Reduced from 15s)
  SILENCE_TIMEOUT: 3000,   // Silence detection threshold
  GROQ_TIMEOUT: 5000,    // Max wait for LLM response (5s safety)
  CALL_SESSION_TTL: 3600,    // Redis key TTL (1 hour)
  TRANSFER_TIMEOUT: 30000,   // Max wait for transfer to connect
});

// ============================================
// Retry Limits
// ============================================
export const MAX_RETRIES = 1;

// ============================================
// TTS Messages
// ============================================
export const Messages = Object.freeze({
  INTRO: `Hi, this is the Microsoft AI assistant. I'm reaching out to quickly confirm your association with Microsoft. Are you a team member or a client of Microsoft? Please let me know.`,

  CLARIFY: `I'm sorry, I didn't quite catch that. Could you please let me know if you're associated with Microsoft, either as a team member or a client?`,

  TRANSFER_CONFIRM: `Thank you for confirming your association. We have successfully logged your response. Have a great day. Goodbye.`,

  GOODBYE: `Thank you for your time. Your response has been recorded. Have a great day. Goodbye.`,

  CALLBACK: `No problem at all. We'll reach out to you again at a better time. Goodbye.`,

  ERROR_FALLBACK: `I apologize, but I'm having trouble processing your response. We will follow up with you later. Thank you and goodbye.`,

  TIMEOUT: `I didn't hear a response. We will reach out to you again at a more convenient time. Goodbye.`,
});

// ============================================
// Telnyx Event Types
// ============================================
export const TelnyxEvent = Object.freeze({
  CALL_INITIATED: 'call.initiated',
  CALL_ANSWERED: 'call.answered',
  CALL_HANGUP: 'call.hangup',
  SPEAK_STARTED: 'call.speak.started',
  SPEAK_ENDED: 'call.speak.ended',
  STREAMING_STARTED: 'streaming.started',
  STREAMING_STOPPED: 'streaming.stopped',
  CALL_BRIDGED: 'call.bridged',
  CALL_MACHINE_DETECTION_ENDED: 'call.machine.detection.ended',
  TRANSCRIPTION: 'call.transcription',
});
