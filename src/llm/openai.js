'use strict';
const OpenAI = require('openai');

const DEFAULT_MODEL = 'gpt-4o-mini';

function createOpenAIProvider({ apiKey, model }) {
  const client = new OpenAI({ apiKey });

  async function callAPI(messages, temperature = 0.2) {
    const response = await client.chat.completions.create({
      model: model || DEFAULT_MODEL,
      messages,
      temperature,
      response_format: { type: 'json_object' },
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
      return await callAPI([
        ...messages,
        { role: 'user', content: 'Responda APENAS com o objeto JSON.' },
      ], 0);
    }
  }

  return { chat };
}

module.exports = { createOpenAIProvider };
