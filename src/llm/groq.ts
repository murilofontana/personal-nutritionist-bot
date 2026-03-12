import OpenAI from 'openai';
import type { LLMProvider, LLMResult } from '../types';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export function createGroqProvider({ apiKey, model }: { apiKey: string; model?: string }): LLMProvider {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  async function callAPI(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    temperature = 0.2,
  ): Promise<LLMResult> {
    const response = await client.chat.completions.create({
      model: model || DEFAULT_MODEL,
      messages,
      temperature,
    });
    const text = response.choices[0].message.content!.trim();
    return JSON.parse(text) as LLMResult;
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
    const userContent = `${userContext}\n\nRefeição relatada: ${userMessage}`;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
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
