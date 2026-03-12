import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider, LLMResult } from '../types';

const DEFAULT_MODEL = 'gemini-1.5-flash';

export function createGeminiProvider({ apiKey, model }: { apiKey: string; model?: string }): LLMProvider {
  const genAI = new GoogleGenerativeAI(apiKey);

  function getModel(systemInstruction: string) {
    return genAI.getGenerativeModel({
      model: model || DEFAULT_MODEL,
      systemInstruction,
    });
  }

  function stripMarkdown(text: string): string {
    return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  }

  async function chat({
    systemPrompt,
    userContext,
    userMessage,
  }: {
    systemPrompt: string;
    userContext: string;
    userMessage: string;
  }): Promise<LLMResult> {
    const generativeModel = getModel(systemPrompt);
    const userContent = `${userContext}\n\nRefeição relatada: ${userMessage}`;

    try {
      const result = await generativeModel.generateContent(userContent);
      return JSON.parse(stripMarkdown(result.response.text())) as LLMResult;
    } catch (_err) {
      const retry = await generativeModel.generateContent(
        `${userContent}\n\nIMPORTANTE: Responda APENAS com o objeto JSON, sem markdown.`
      );
      return JSON.parse(stripMarkdown(retry.response.text())) as LLMResult;
    }
  }

  return { chat };
}
