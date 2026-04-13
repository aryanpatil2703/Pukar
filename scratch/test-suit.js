import ai from '../src/services/ai.js';
import redis from '../src/services/redis.js';
import config from '../src/config/index.js';

async function test() {
  console.log('--- STARTING AI SYSTEM TEST ---');
  try {
    const callId = 'test-suit-' + Date.now();
    
    // Test 1: Cross-question handling
    console.log('\n[TEST 1] Testing Cross-Question (Who are you?)');
    const r1 = await ai.generateResponse(callId, 'Wait, who am I speaking with?');
    console.log('User: "Wait, who am I speaking with?"');
    console.log('AI:', r1.response);

    // Test 2: Contextual follow-up
    console.log('\n[TEST 2] Testing Context Retention (Repeat last question)');
    const r2 = await ai.generateResponse(callId, 'Can you repeat that please?');
    console.log('User: "Can you repeat that please?"');
    console.log('AI:', r2.response);

    // Test 3: Intent confirmation
    console.log('\n[TEST 3] Testing Intent Confirmation');
    const r3 = await ai.generateResponse(callId, 'Yes, I am a client of SG.');
    console.log('User: "Yes, I am a client of SG."');
    console.log('AI:', r3.response);
    console.log('Next Action:', r3.nextAction);

    // Test 4: Deepgram Key Check
    console.log('\n[TEST 4] Connectivity Check');
    console.log('Groq Key:', config.groqApiKey ? 'OK' : 'MISSING');
    console.log('Deepgram Key:', config.deepgramApiKey ? 'OK' : 'MISSING');

    await redis.deleteCallSession(callId);
    console.log('\n--- TEST COMPLETE ---');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

test();
