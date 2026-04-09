import dotenv from 'dotenv';
import { ConfigError } from '../utils/errors.js';

dotenv.config();

// ============================================
// Validate & Export Configuration
// ============================================
const requiredVars = [
  'TELNYX_API_KEY',
  'DEEPGRAM_API_KEY',
  'GROQ_API_KEY',
  'TRANSFER_NUMBER',
];

const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new ConfigError(
    `Missing required environment variables: ${missing.join(', ')}\n` +
    `Copy .env.example to .env and fill in the values.`
  );
}

const config = Object.freeze({
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,

  // Telnyx
  telnyxApiKey:       process.env.TELNYX_API_KEY,
  telnyxPublicKey:    process.env.TELNYX_PUBLIC_KEY || '',
  telnyxConnectionId: process.env.TELNYX_CONNECTION_ID || '',
  telnyxPhoneNumber:  process.env.TELNYX_PHONE_NUMBER || '',

  // Deepgram
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,

  // Groq
  groqApiKey: process.env.GROQ_API_KEY,

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  // PostgreSQL
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/callbot',

  // Call Config
  transferNumber: process.env.TRANSFER_NUMBER,
  companyName:    process.env.COMPANY_NAME || 'Salesgarners',

  // WebSocket
  wsPath: process.env.WS_PATH || '/audio',

  // Telnyx API Base
  telnyxApiBase: 'https://api.telnyx.com/v2',
});

export default config;
