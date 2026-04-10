import twilio from 'twilio';
import config from '../../config/index.js';
import { createLogger } from '../../utils/log.js';

const log = createLogger('twilio:callControl');

// ============================================
// Twilio Client
// ============================================
let client = null;

function getClient() {
  if (!client) {
    client = twilio(config.twilioAccountSid, config.twilioAuthToken);
  }
  return client;
}

/**
 * Initiate an outbound call via Twilio.
 * Twilio will hit the /voice webhook when the call is answered.
 */
export async function makeOutboundCall(toNumber, fromNumber = config.twilioPhoneNumber) {
  log.info({ to: toNumber, from: fromNumber }, 'Initiating outbound call via Twilio');

  try {
    const call = await getClient().calls.create({
      to: toNumber,
      from: fromNumber,
      url: `${config.publicUrl}/voice`,
      statusCallback: `${config.publicUrl}/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    });

    log.info({ callSid: call.sid, to: toNumber }, 'Outbound call created');
    return { callSid: call.sid, status: call.status };
  } catch (err) {
    log.error({ err: err.message, to: toNumber }, 'Failed to create outbound call');
    throw err;
  }
}

export default { makeOutboundCall };
