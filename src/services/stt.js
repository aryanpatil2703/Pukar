import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import config from '../config/index.js';
import { createLogger } from '../utils/log.js';

const log = createLogger('stt');

// ============================================
// Deepgram Client
// ============================================
const deepgram = createClient(config.deepgramApiKey);

/**
 * Active Deepgram connections mapped by callId.
 * Map<callId, { connection, buffer, onTranscript, onSilence }>
 */
const activeConnections = new Map();

/**
 * Create a new Deepgram streaming connection for a call.
 *
 * @param {string} callId
 * @param {Function} onTranscript - (callId, text) => void
 * @param {Function} onSilence   - (callId) => void
 */
export function createConnection(callId, onTranscript, onSilence) {
  if (activeConnections.has(callId)) {
    log.warn({ callId }, 'Deepgram connection already exists, closing old one');
    closeConnection(callId);
  }

  log.info({ callId }, 'Creating Deepgram streaming connection');

  const connection = deepgram.listen.live({
    model: 'nova-3',
    language: 'en',
    encoding: 'mulaw',
    sample_rate: 8000,
    channels: 1,
    punctuate: true,
    interim_results: false,
    endpointing: 500,
    utterance_end_ms: 1500,
    smart_format: true,
  });

  let transcriptBuffer = '';
  let utteranceTimer = null;

  connection.on(LiveTranscriptionEvents.Open, () => {
    log.info({ callId }, 'Deepgram connection opened');
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data.channel?.alternatives?.[0];
    if (!alt) return;

    const text = alt.transcript.trim();
    if (!text) return;

    if (data.is_final) {
      transcriptBuffer += (transcriptBuffer ? ' ' : '') + text;
      log.info({ callId, text, buffer: transcriptBuffer }, 'Final transcript chunk');
    }
  });

  connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    if (transcriptBuffer) {
      log.info({ callId, transcript: transcriptBuffer }, 'Utterance complete');
      const finalText = transcriptBuffer;
      transcriptBuffer = '';
      onTranscript(callId, finalText);
    }
  });

  connection.on(LiveTranscriptionEvents.Error, (err) => {
    log.error({ callId, err }, 'Deepgram error');
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    log.info({ callId }, 'Deepgram connection closed');
    // If there's a buffered transcript, flush it
    if (transcriptBuffer) {
      const finalText = transcriptBuffer;
      transcriptBuffer = '';
      onTranscript(callId, finalText);
    }
    activeConnections.delete(callId);
  });

  activeConnections.set(callId, {
    connection,
    onTranscript,
    onSilence,
  });

  return connection;
}

/**
 * Send audio data to an active Deepgram connection.
 */
export function sendAudio(callId, audioBuffer) {
  const entry = activeConnections.get(callId);
  if (!entry) {
    log.warn({ callId }, 'No active Deepgram connection for audio');
    return;
  }

  try {
    entry.connection.send(audioBuffer);
  } catch (err) {
    log.error({ callId, err: err.message }, 'Failed to send audio to Deepgram');
  }
}

/**
 * Close and clean up a Deepgram connection.
 */
export function closeConnection(callId) {
  const entry = activeConnections.get(callId);
  if (!entry) return;

  log.info({ callId }, 'Closing Deepgram connection');
  try {
    entry.connection.finish();
  } catch (err) {
    log.warn({ callId, err: err.message }, 'Error closing Deepgram connection');
  }
  activeConnections.delete(callId);
}

/**
 * Check if a connection exists for a call.
 */
export function hasConnection(callId) {
  return activeConnections.has(callId);
}

export default {
  createConnection,
  sendAudio,
  closeConnection,
  hasConnection,
};
