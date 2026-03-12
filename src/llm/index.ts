import { createGroqProvider }   from './groq';
import { createOpenAIProvider } from './openai';
import { createGeminiProvider } from './gemini';
import type { LLMProvider } from '../types';

export function createLLMProvider({
  provider,
  apiKey,
  model,
}: {
  provider: string;
  apiKey: string;
  model?: string;
}): LLMProvider {
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
