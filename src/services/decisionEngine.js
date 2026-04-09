import { createLogger } from '../utils/log.js';
import { Intent, NextAction, MAX_RETRIES, Messages } from '../utils/constants.js';

const log = createLogger('decisionEngine');

/**
 * Decide the next action based on classified intent and retry count.
 *
 * Returns an object:
 * {
 *   speakText:  string  — message to speak before acting
 *   nextAction: string  — action to take after TTS finishes (NextAction.*)
 *   final:      boolean — whether this is a terminal decision
 * }
 */
export function decide(intent, retryCount = 0) {
  log.info({ intent, retryCount }, 'Making decision');

  switch (intent) {
    case Intent.AVAILABLE:
      return {
        speakText: Messages.TRANSFER_CONFIRM,
        nextAction: NextAction.TRANSFER,
        final: true,
      };

    case Intent.NOT_AVAILABLE:
      return {
        speakText: Messages.GOODBYE,
        nextAction: NextAction.HANGUP,
        final: true,
      };

    case Intent.CALLBACK_LATER:
      return {
        speakText: Messages.CALLBACK,
        nextAction: NextAction.HANGUP,
        final: true,
      };

    case Intent.UNCLEAR:
      if (retryCount < MAX_RETRIES) {
        // Retry once — ask for clarification
        return {
          speakText: Messages.CLARIFY,
          nextAction: NextAction.START_LISTENING,
          final: false,
        };
      }
      // Max retries reached — transfer as safety net
      return {
        speakText: Messages.ERROR_FALLBACK,
        nextAction: NextAction.TRANSFER,
        final: true,
      };

    default:
      log.warn({ intent }, 'Unknown intent, defaulting to transfer');
      return {
        speakText: Messages.ERROR_FALLBACK,
        nextAction: NextAction.TRANSFER,
        final: true,
      };
  }
}

export default { decide };
