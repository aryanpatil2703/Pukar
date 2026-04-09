import axios from 'axios';
import config from '../config/index.js';
import { createLogger } from '../utils/log.js';
import { TelnyxApiError } from '../utils/errors.js';

const log = createLogger('callControl');

// ============================================
// Axios instance for Telnyx API
// ============================================
const telnyx = axios.create({
  baseURL: config.telnyxApiBase,
  headers: {
    'Authorization': `Bearer ${config.telnyxApiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Wrap Telnyx API calls with error handling + retry.
 */
async function telnyxRequest(method, url, data = {}, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await telnyx({ method, url, data });
      return response.data;
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.errors?.[0]?.detail || err.message;
      log.error({ url, status, msg, attempt }, 'Telnyx API error');

      if (attempt < retries && status !== 404 && status !== 422) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw new TelnyxApiError(`Telnyx ${url} failed: ${msg}`, err);
    }
  }
}

// ============================================
// Call Control Actions
// ============================================

/**
 * Answer an incoming call.
 */
export async function answerCall(callControlId) {
  log.info({ callControlId }, 'Answering call');
  return telnyxRequest('post', `/calls/${callControlId}/actions/answer`, {});
}

/**
 * Speak text to the caller via TTS.
 */
export async function speak(callControlId, text) {
  log.info({ callControlId, textLength: text.length }, 'Speaking TTS');
  return telnyxRequest('post', `/calls/${callControlId}/actions/speak`, {
    payload: text,
    payload_type: 'text',
    voice: 'female',
    language: 'en-US',
  });
}

/**
 * Start media streaming (audio fork) to our WebSocket server.
 */
export async function startStreaming(callControlId, streamUrl) {
  log.info({ callControlId, streamUrl }, 'Starting audio stream');
  return telnyxRequest('post', `/calls/${callControlId}/actions/streaming_start`, {
    stream_url: streamUrl,
    stream_track: 'inbound_track',
  });
}

/**
 * Stop media streaming.
 */
export async function stopStreaming(callControlId) {
  log.info({ callControlId }, 'Stopping audio stream');
  return telnyxRequest('post', `/calls/${callControlId}/actions/streaming_stop`, {});
}

/**
 * Transfer call to the target number.
 */
export async function transferCall(callControlId, toNumber = config.transferNumber) {
  log.info({ callControlId, to: toNumber }, 'Transferring call');
  return telnyxRequest('post', `/calls/${callControlId}/actions/transfer`, {
    to: toNumber,
  });
}

/**
 * Hang up the call.
 */
export async function hangupCall(callControlId) {
  log.info({ callControlId }, 'Hanging up call');
  return telnyxRequest('post', `/calls/${callControlId}/actions/hangup`, {});
}

/**
 * Initiate an outbound call.
 */
export async function dialOutbound(toNumber, fromNumber, connectionId = config.telnyxConnectionId) {
  log.info({ to: toNumber, from: fromNumber }, 'Dialing outbound call');
  return telnyxRequest('post', '/calls', {
    connection_id: connectionId,
    to: toNumber,
    from: fromNumber,
    timeout_secs: 30,
  });
}

export default {
  answerCall,
  speak,
  startStreaming,
  stopStreaming,
  transferCall,
  hangupCall,
  dialOutbound,
};
