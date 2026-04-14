import OpenAI from 'openai';
import config from '../config/index.js';
import { createLogger } from '../utils/log.js';
import { Intent, NextAction, Timeouts } from '../utils/constants.js';
import redisService from './redis.js';

const log = createLogger('ai');

const groq = new OpenAI({
  apiKey: config.groqApiKey,
  baseURL: 'https://api.groq.com/openai/v1',
});

const SYSTEM_PROMPT = `You are "Pukar", a high-efficiency professional AI phone assistant for Microsoft.

GOAL:
Your primary goal is to confirm if the caller is a team member or a client of Microsoft.

BEHAVIOR:
- Be concise, professional, and helpful.
- If the caller asks you to repeat, repeat the last question or greeting.
- If the caller asks who you are, explain that you are the Microsoft AI assistant.
- If the caller affirms their association (Team/Client), thank them warmly, say "Goodbye", and set the nextAction to "hangup".
- If the caller is busy or wants a callback, acknowledge politely, ask them for a callback time and set nextAction to "listen".
- If the answer is unclear, politely ask for clarification and set nextAction to "listen".
- If the caller says "I am not available right now" ask them for a callback time and set nextAction to "listen".
- If the caller says "I am available" say "Thank you, Goodbye" and set nextAction to "hangup".
- There could be a possibility that the person that picks up the call could not be the intended person, in that case ask them to connect you to the intended person and set nextAction to "listen".
- Once the intent is clear, set the nextAction to "hangup".
- IMPORTANT: If nextAction is "hangup", do NOT ask another question. The response should be a final closing statement.

RESPONSE FORMAT:
You MUST respond with a JSON object ONLY:
{
  "response": "What you want to say to the caller",
  "intent": "available" | "not_available" | "callback_later" | "unclear",
  "nextAction": "listen" | "hangup"
}

INTENT DEFINITIONS:
- "available": The caller confirmed they are a client or team member, or is willing to talk.
- "not_available": The caller denied association, said wrong number, or is busy/cannot talk.
- "callback_later": The caller explicitly asked to be called back later.
- "unclear": The response is ambiguous or you are still trying to find out.

- "listen": Use this when you expect the caller to respond further.
- "hangup": Use this when the conversation is finished or the caller asked to be called back.

Current Company Name: ${config.companyName}
`;

/**
 * Generate a conversational response and determine the next action.
 */
export async function generateResponse(callId, userTranscript) {
  log.info({ callId, userTranscript }, 'Generating AI response');

  try {
    // 1. Get Conversation History
    const history = await redisService.getHistory(callId);

    // 2. Prepare Messages
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userTranscript },
    ];

    // 3. Call Groq with hard timeout
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: 0.5,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    }, {
      timeout: Timeouts.GROQ_TIMEOUT,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');

    const result = JSON.parse(content);

    // 4. Update History (Async)
    await redisService.addMessageToHistory(callId, 'user', userTranscript);
    await redisService.addMessageToHistory(callId, 'assistant', result.response);

    log.info({ callId, result }, 'AI response generated');
    return result;

  } catch (err) {
    log.error({ callId, err: err.message }, 'AI response generation failed');
    return {
      response: "I'm sorry, I encountered a technical issue. We will follow up with you later. Goodbye.",
      nextAction: 'hangup'
    };
  }
}

export default { generateResponse };
