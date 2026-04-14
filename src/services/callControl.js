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
 * Start native Telnyx transcription.
 */
export async function startTranscription(callControlId) {
  log.info({ callControlId }, 'Starting Telnyx native transcription (Deepgram Flux)');
  return telnyxRequest('post', `/calls/${callControlId}/actions/transcription_start`, {
    language: 'en',
    transcription_engine: 'Deepgram',
    transcription_model: 'flux',
    transcription_tracks: 'inbound',
    transcription_settings: {
      eot_threshold: 0.6,
      eot_timeout_ms: 1500
    }
  });
}

/**
 * Stop native Telnyx transcription.
 */
export async function stopTranscription(callControlId) {
  log.info({ callControlId }, 'Stopping Telnyx native transcription');
  return telnyxRequest('post', `/calls/${callControlId}/actions/transcription_stop`, {});
}

/**
 * Transfer call to the target number.
 */
export async function transferCall(callControlId, toNumber = config.transferNumber, fromNumber = config.telnyxPhoneNumber) {
  log.info({ callControlId, to: toNumber, from: fromNumber }, 'Transferring call');
  return telnyxRequest('post', `/calls/${callControlId}/actions/transfer`, {
    to: toNumber,
    from: fromNumber
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
  startTranscription,
  stopTranscription,
  transferCall,
  hangupCall,
  dialOutbound,
};
