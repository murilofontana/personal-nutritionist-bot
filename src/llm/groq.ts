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
    effectiveModel?: string,
  ): Promise<LLMResult> {
    const response = await client.chat.completions.create({
      model: effectiveModel ?? model ?? DEFAULT_MODEL,
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
    imageBase64,
    imageMimeType,
  }: {
    systemPrompt: string;
    userContext: string;
    userMessage: string;
    imageBase64?: string;
    imageMimeType?: string;
  }): Promise<LLMResult> {
    const effectiveModel = model ?? (imageBase64 ? 'llama-3.2-11b-vision-preview' : DEFAULT_MODEL);
    const textContent = `${userContext}\n\nRefeição relatada: ${userMessage}`;
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] | string = imageBase64 && imageMimeType
      ? [
          { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
          { type: 'text', text: textContent },
        ]
      : textContent;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    try {
      return await callAPI(messages, 0.2, effectiveModel);
    } catch (_err) {
      // Retry once with explicit JSON reinforcement
      return await callAPI([
        ...messages,
        { role: 'user', content: 'Responda APENAS com o objeto JSON, sem texto adicional.' },
      ], 0, effectiveModel);
    }
  }

  return { chat };
}
