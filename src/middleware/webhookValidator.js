import { createLogger } from '../utils/log.js';

const log = createLogger('webhookValidator');

/**
 * Middleware to validate Telnyx webhook signatures.
 *
 * If TELNYX_PUBLIC_KEY is not set, validation is skipped
 * (useful for local development).
 */
export function webhookValidator(req, res, next) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;

  // Skip validation if no public key is configured
  if (!publicKey) {
    return next();
  }

  const signature = req.headers['telnyx-signature-ed25519'];
  const timestamp = req.headers['telnyx-timestamp'];

  if (!signature || !timestamp) {
    log.warn('Missing Telnyx signature headers');
    return res.status(403).json({ error: 'Missing signature' });
  }

  // For production, implement full Ed25519 verification here.
  // For now, we check header presence as a basic guard.
  // TODO: Add proper Ed25519 signature verification
  next();
}

export default webhookValidator;
