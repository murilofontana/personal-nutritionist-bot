'use strict';
const { createGroqProvider }   = require('./groq');
const { createOpenAIProvider } = require('./openai');
const { createGeminiProvider } = require('./gemini');

function createLLMProvider({ provider, apiKey, model }) {
  switch (provider) {
    case 'groq':
      return createGroqProvider({ apiKey, model });
    case 'openai':
      return createOpenAIProvider({ apiKey, model });
    case 'gemini':
      return createGeminiProvider({ apiKey, model });
    default:
      throw new Error(
        `Unknown LLM provider: "${provider}". Valid options: groq, openai, gemini.`
      );
  }
}

module.exports = { createLLMProvider };
