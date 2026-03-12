'use strict';
const OpenAI = require('openai');

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function createGroqProvider({ apiKey, model }) {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  async function callAPI(messages, temperature = 0.2) {
    const response = await client.chat.completions.create({
      model: model || DEFAULT_MODEL,
      messages,
      temperature,
    });
    const text = response.choices[0].message.content.trim();
    return JSON.parse(text);
  }

  async function chat({ systemPrompt, userContext, userMessage }) {
    const userContent = `${userContext}\n\nRefeição relatada: ${userMessage}`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    try {
      return await callAPI(messages);
    } catch (_err) {
      // Retry once with explicit JSON reinforcement
      return await callAPI([
        ...messages,
        { role: 'user', content: 'Responda APENAS com o objeto JSON, sem texto adicional.' },
      ], 0);
    }
  }

  return { chat };
}

module.exports = { createGroqProvider };
