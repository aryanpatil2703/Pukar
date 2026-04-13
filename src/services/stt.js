import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import config from '../config/index.js';
import { createLogger } from '../utils/log.js';

const log = createLogger('stt');

const deepgram = createClient(config.deepgramApiKey);

/**
 * Active Deepgram connections mapped by callId.
 * Map<callId, { connection, keepAliveInterval, onTranscript, onSilence, isOpen, buffer }>
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

  try {
    const connection = deepgram.listen.live({
      model: 'phonecall', // Optimized for telephony
      language: 'en-US',
      encoding: 'mulaw',
      sample_rate: 8000,
      channels: 1,
      multichannel: false, // Explicitly disable for pure mono stream
      smart_format: true,

      interim_results: true,
      utterance_end_ms: 1500, // Reduced cutoff risk
      vad_events: true,

      endpointing: 500, // Reduced cutoff risk
    });

    let transcriptBuffer = '';
    // FIX 5: Track whether speech_final already fired for this utterance.
    let speechFinalReceived = false;

    connection.on(LiveTranscriptionEvents.Open, () => {
      log.info({ callId }, 'Deepgram connection opened');

      // FIX 3: Send keepalive every 5 seconds to prevent the 10s idle timeout.
      const keepAliveInterval = setInterval(() => {
        const entry = activeConnections.get(callId);
        if (entry) {
          try {
            connection.keepAlive();
            log.debug({ callId }, 'Keepalive sent');
          } catch (err) {
            log.warn({ callId, err: err.message }, 'Keepalive failed');
          }
        } else {
          clearInterval(keepAliveInterval);
        }
      }, 5000);

      // Store the interval reference
      const entry = activeConnections.get(callId);
      if (entry) {
        entry.keepAliveInterval = keepAliveInterval;
        entry.isOpen = true;

        // Flush buffer if we have pending data
        if (entry.buffer.length > 0) {
          log.info({ callId, packetCount: entry.buffer.length }, 'Deepgram opened — flushing audio buffer');
          while (entry.buffer.length > 0) {
            const chunk = entry.buffer.shift();
            connection.send(chunk);
          }
        }
      }
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data.channel?.alternatives?.[0];
      if (!alt) return;

      const text = alt.transcript.trim();
      if (!text) return;

      if (data.is_final) {
        transcriptBuffer += (transcriptBuffer ? ' ' : '') + text;
        log.info({ callId, text, buffer: transcriptBuffer }, 'Final transcript chunk');

        // Fast-path: use speech_final if detected by endpointing
        if (data.speech_final) {
          log.info({ callId, transcript: transcriptBuffer }, 'speech_final — firing transcript');
          speechFinalReceived = true;
          const finalText = transcriptBuffer;
          transcriptBuffer = '';
          onTranscript(callId, finalText);
        }
      }
    });

    connection.on(LiveTranscriptionEvents.UtteranceEnd, (data) => {
      // FIX 5: Prevent double-firing if endpointing already caught it
      if (speechFinalReceived) {
        log.debug({ callId }, 'UtteranceEnd ignored — speech_final already fired');
        speechFinalReceived = false; // reset for next utterance
        return;
      }

      // Handle stale results
      if (data.last_word_end === -1) {
        log.debug({ callId }, 'UtteranceEnd ignored — last_word_end is -1 (stale)');
        return;
      }

      if (transcriptBuffer) {
        // Fallback: UtteranceEnd caught it when endpointing didn't
        log.info({ callId, transcript: transcriptBuffer }, 'UtteranceEnd — firing transcript');
        const finalText = transcriptBuffer;
        transcriptBuffer = '';
        speechFinalReceived = false;
        onTranscript(callId, finalText);
      } else if (!transcriptBuffer && data.duration > 1000) {
        // FIX 4: Caller said nothing — trigger onSilence behavior
        // Added duration check to avoid firing early on brief pauses
        log.info({ callId, duration: data.duration }, 'UtteranceEnd with empty buffer & high duration — firing onSilence');
        speechFinalReceived = false;
        onSilence(callId);
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      log.error({ callId, err: err.message || err }, 'Deepgram error');
    });

    connection.on(LiveTranscriptionEvents.Close, (event) => {
      log.info({ callId, code: event?.code, reason: event?.reason }, 'Deepgram connection closed');

      // Clear the keepalive interval
      const entry = activeConnections.get(callId);
      if (entry?.keepAliveInterval) {
        clearInterval(entry.keepAliveInterval);
      }

      // Flush buffer on unexpected close
      if (transcriptBuffer) {
        log.warn({ callId, transcript: transcriptBuffer }, 'Flushing buffer on close');
        const finalText = transcriptBuffer;
        transcriptBuffer = '';
        onTranscript(callId, finalText);
      }

      activeConnections.delete(callId);
    });

    activeConnections.set(callId, {
      connection,
      keepAliveInterval: null,
      onTranscript,
      onSilence,
      isOpen: false,
      buffer: [],
    });

    return connection;
  } catch (err) {
    log.error({ callId, err: err.message }, 'Failed to initialize Deepgram client');
    throw err;
  }
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
    if (entry.isOpen) {
      entry.connection.send(audioBuffer);
    } else {
      // Queue audio while connection is warming up
      entry.buffer.push(audioBuffer);
      if (entry.buffer.length % 50 === 0) {
        log.debug({ callId, bufferSize: entry.buffer.length }, 'Buffering audio chunks before STT open');
      }
    }
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

  if (entry.keepAliveInterval) {
    clearInterval(entry.keepAliveInterval);
  }

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

export default { createConnection, sendAudio, closeConnection, hasConnection };
