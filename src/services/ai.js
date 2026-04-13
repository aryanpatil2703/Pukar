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

const SYSTEM_PROMPT = `You are "Pukar", a high-efficiency professional AI phone assistant for SG.

GOAL:
Your primary goal is to confirm if the caller is a team member or a client of SG.

BEHAVIOR:
- Be concise, professional, and helpful.
- If the caller asks you to repeat, repeat the last question or greeting.
- If the caller asks who you are, explain that you are the SG AI assistant.
- If the caller says they are busy or to call back later, acknowledge politely and set the action to "hangup".
- If the caller confirms they are a team member or client, thank them politely and set the action to "hangup" (as human transfer is currently disabled).
- If the answer is unclear, politely ask for clarification.

RESPONSE FORMAT:
You MUST respond with a JSON object ONLY:
{
  "response": "What you want to say to the caller",
  "nextAction": "listen" | "hangup"
}

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
