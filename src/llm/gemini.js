'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');

const DEFAULT_MODEL = 'gemini-1.5-flash';

function createGeminiProvider({ apiKey, model }) {
  const genAI = new GoogleGenerativeAI(apiKey);

  function getModel(systemInstruction) {
    return genAI.getGenerativeModel({
      model: model || DEFAULT_MODEL,
      systemInstruction,
    });
  }

  function stripMarkdown(text) {
    return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  }

  async function chat({ systemPrompt, userContext, userMessage }) {
    const generativeModel = getModel(systemPrompt);
    const userContent = `${userContext}\n\nRefeição relatada: ${userMessage}`;

    try {
      const result = await generativeModel.generateContent(userContent);
      return JSON.parse(stripMarkdown(result.response.text()));
    } catch (_err) {
      const retry = await generativeModel.generateContent(
        `${userContent}\n\nIMPORTANTE: Responda APENAS com o objeto JSON, sem markdown.`
      );
      return JSON.parse(stripMarkdown(retry.response.text()));
    }
  }

  return { chat };
}

module.exports = { createGeminiProvider };
