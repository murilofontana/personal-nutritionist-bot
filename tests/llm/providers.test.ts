jest.mock('openai');
jest.mock('@google/generative-ai');

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;
// GoogleGenerativeAI is used only for typing the mock shape
void GoogleGenerativeAI;

const MOCK_JSON = '{"kcal":390,"prot":37,"carbo":32,"fat":11,"dentro_da_dieta":"sim","avaliacao":"Ok","recomendacao":"Continue"}';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Groq provider', () => {
  test('calls API and parses JSON response', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }) as unknown as OpenAI);

    const { createGroqProvider } = await import('../../src/llm/groq');
    const provider = createGroqProvider({ apiKey: 'test-key', model: 'llama-3.3-70b-versatile' });
    const result = await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
    });

    expect(result.kcal).toBe(390);
    expect(result.prot).toBe(37);
    expect(result.dentro_da_dieta).toBe('sim');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('retries once on JSON parse error', async () => {
    const mockCreate = jest.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: 'texto inválido' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: MOCK_JSON } }] });
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }) as unknown as OpenAI);

    const { createGroqProvider } = await import('../../src/llm/groq');
    const provider = createGroqProvider({ apiKey: 'test-key', model: 'test' });
    const result = await provider.chat({ systemPrompt: 's', userContext: 'c', userMessage: 'm' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.kcal).toBe(390);
  });
});

describe('OpenAI provider', () => {
  test('calls API and parses JSON response', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }) as unknown as OpenAI);

    const { createOpenAIProvider } = await import('../../src/llm/openai');
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-4o-mini' });
    const result = await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
    });

    expect(result.kcal).toBe(390);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('LLM factory', () => {
  test('createLLMProvider returns a provider with chat() for groq', async () => {
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: jest.fn() } },
    }) as unknown as OpenAI);
    const { createLLMProvider } = await import('../../src/llm/index');
    const provider = createLLMProvider({ provider: 'groq', apiKey: 'test' });
    expect(typeof provider.chat).toBe('function');
  });

  test('createLLMProvider returns a provider with chat() for openai', async () => {
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: jest.fn() } },
    }) as unknown as OpenAI);
    const { createLLMProvider } = await import('../../src/llm/index');
    const provider = createLLMProvider({ provider: 'openai', apiKey: 'test' });
    expect(typeof provider.chat).toBe('function');
  });

  test('throws on unknown provider', async () => {
    const { createLLMProvider } = await import('../../src/llm/index');
    expect(() => createLLMProvider({ provider: 'unknown', apiKey: 'test' })).toThrow(
      /Unknown LLM provider/
    );
  });
});
