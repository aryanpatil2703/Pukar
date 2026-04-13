import OpenAI from 'openai';
import config from '../config/index.js';
import { createLogger } from '../utils/log.js';
import { Intent, Timeouts } from '../utils/constants.js';
import { IntentError } from '../utils/errors.js';

const log = createLogger('intent');

// ============================================
// Groq Client (OpenAI-compatible)
// ============================================
const groq = new OpenAI({
  apiKey: config.groqApiKey,
  baseURL: 'https://api.groq.com/openai/v1',
});

// ============================================
// Rule-Based Quick Matcher (Tier 1)
// ============================================
const RULES = [
  {
    intent: Intent.AVAILABLE,
    patterns: [
      /\b(yes|yeah|yep|yup|sure|ok|okay|correct|right|affirmative)\b/i,
      /\b(i am|i'm|i do|i work|we are|we're|that's me)\b/i,
      /\b(available|can talk|go ahead|speaking|tell me)\b/i,
      /\b(employee|team member|work (for|with|at)|staff|colleague|part of)\b/i,
      /\b(client|customer|we use|we hired|working with)\b/i,
    ],
  },
  {
    intent: Intent.NOT_AVAILABLE,
    patterns: [
      /\b(no|nope|nah|not really|not at all|negative)\b/i,
      /\b(busy|can't talk|not available|in a meeting|driving)\b/i,
      /\b(wrong number|don't know|never heard|not interested)\b/i,
      /\b(stop calling|do not call|remove|unsubscribe)\b/i,
    ],
  },
  {
    intent: Intent.CALLBACK_LATER,
    patterns: [
      /\b(later|call back|call me later|another time|not now|in a bit)\b/i,
      /\b(try again|reach out later|give me a minute|hold on)\b/i,
      /\b(tomorrow|next week|this evening|after lunch)\b/i,
    ],
  },
];

/**
 * Try rule-based classification first (instant, no API call).
 */
function classifyRuleBased(text) {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return null;

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        log.info({ text, intent: rule.intent, method: 'rule' }, 'Rule-based match');
        return rule.intent;
      }
    }
  }
  return null;
}

// ============================================
// Groq LLM Classification (Tier 2 — Fallback)
// ============================================
const SYSTEM_PROMPT = `You are a phone call intent classifier for SG.

The caller was asked: "Are you a team member or a client of SG?"

Classify the caller's response into exactly ONE of these intents:
- "available": The caller confirmed they are associated with SG (employee, client, or willing to talk)
- "not_available": The caller denied association, said wrong number, or is busy
- "callback_later": The caller asked to be called back at another time
- "unclear": The response is too ambiguous to classify

Respond with ONLY a JSON object, no other text:
{"intent": "<intent>"}`;

/**
 * Classify intent using Groq LLM (for ambiguous cases).
 */
async function classifyWithGroq(text) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Timeouts.GROQ_TIMEOUT);

    const response = await groq.chat.completions.create(
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 20,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal }
    );

    clearTimeout(timer);

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return Intent.UNCLEAR;

    const parsed = JSON.parse(content);
    const intent = parsed.intent;

    // Validate that the intent is one of our known intents
    const valid = Object.values(Intent);
    if (!valid.includes(intent)) {
      log.warn({ text, rawIntent: intent }, 'Groq returned unknown intent');
      return Intent.UNCLEAR;
    }

    log.info({ text, intent, method: 'groq' }, 'Groq classification');
    return intent;
  } catch (err) {
    if (err.name === 'AbortError') {
      log.warn({ text }, 'Groq classification timed out');
    } else {
      log.error({ text, err: err.message }, 'Groq classification failed');
    }
    return Intent.UNCLEAR;
  }
}

// ============================================
// Main Classification Entry Point
// ============================================

/**
 * Classify caller intent — tries rules first, falls back to Groq.
 *
 * @param {string} text - Transcribed caller speech
 * @returns {Promise<string>} One of Intent.*
 */
export async function classifyIntent(text) {
  if (!text || !text.trim()) {
    log.info('Empty transcript → UNCLEAR');
    return Intent.UNCLEAR;
  }

  // Tier 1: Rule-based (instant)
  const ruleResult = classifyRuleBased(text);
  if (ruleResult) return ruleResult;

  // Tier 2: Groq LLM (fast fallback)
  log.info({ text }, 'No rule match, falling back to Groq');
  return classifyWithGroq(text);
}

export default { classifyIntent };
