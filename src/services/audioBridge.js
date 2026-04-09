import { WebSocketServer } from 'ws';
import { createLogger } from '../utils/log.js';
import stt from './stt.js';
import config from '../config/index.js';

const log = createLogger('audioBridge');

/**
 * Map of streamId → callControlId
 * Populated from the Telnyx 'start' event.
 */
const streamCallMap = new Map();

/**
 * Callback to invoke when a transcript is ready.
 * Set by the call handler during initialization.
 */
let transcriptCallback = null;
let silenceCallback = null;

/**
 * Register callbacks for transcript and silence events.
 */
export function onTranscript(cb) {
  transcriptCallback = cb;
}

export function onSilence(cb) {
  silenceCallback = cb;
}

/**
 * Initialize the WebSocket server for Telnyx audio streaming.
 * Attaches to the existing HTTP server at the configured path.
 *
 * @param {http.Server} server - The HTTP server to attach to
 * @returns {WebSocketServer}
 */
export function initAudioBridge(server) {
  const wss = new WebSocketServer({
    server,
    path: config.wsPath,
  });

  log.info({ path: config.wsPath }, 'Audio bridge WebSocket server initialized');

  wss.on('connection', (ws, req) => {
    log.info({ remoteAddress: req.socket.remoteAddress }, 'Audio stream connection opened');

    let callControlId = null;

    ws.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());

        switch (message.event) {
          case 'connected':
            log.info('Telnyx media stream connected');
            break;

          case 'start':
            // Extract call control ID from the start event
            callControlId = message.start?.call_control_id || null;
            const streamId = message.stream_id;

            if (callControlId) {
              streamCallMap.set(streamId, callControlId);
              log.info({ callControlId, streamId }, 'Audio stream started for call');

              // Create a Deepgram connection for this call
              stt.createConnection(
                callControlId,
                // onTranscript callback
                (cid, text) => {
                  if (transcriptCallback) transcriptCallback(cid, text);
                },
                // onSilence callback
                (cid) => {
                  if (silenceCallback) silenceCallback(cid);
                }
              );
            } else {
              log.warn({ message }, 'Start event missing call_control_id');
            }
            break;

          case 'media':
            // Forward audio payload to Deepgram
            if (callControlId && message.media?.payload) {
              const audioBuffer = Buffer.from(message.media.payload, 'base64');
              stt.sendAudio(callControlId, audioBuffer);
            }
            break;

          case 'stop':
            log.info({ callControlId }, 'Audio stream stopped');
            if (callControlId) {
              stt.closeConnection(callControlId);
              streamCallMap.delete(message.stream_id);
            }
            break;

          default:
            log.debug({ event: message.event }, 'Unknown audio bridge event');
        }
      } catch (err) {
        log.error({ err: err.message }, 'Error processing audio bridge message');
      }
    });

    ws.on('close', () => {
      log.info({ callControlId }, 'Audio stream connection closed');
      if (callControlId) {
        stt.closeConnection(callControlId);
      }
    });

    ws.on('error', (err) => {
      log.error({ err: err.message, callControlId }, 'Audio stream WebSocket error');
    });
  });

  return wss;
}

/**
 * Clean up resources for a call.
 */
export function cleanupCall(callId) {
  stt.closeConnection(callId);
  // Remove from stream map
  for (const [streamId, cid] of streamCallMap.entries()) {
    if (cid === callId) {
      streamCallMap.delete(streamId);
      break;
    }
  }
}

export default {
  initAudioBridge,
  onTranscript,
  onSilence,
  cleanupCall,
};
