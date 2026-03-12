'use strict';
jest.mock('openai');
jest.mock('@google/generative-ai');

const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MOCK_JSON = '{"kcal":390,"prot":37,"carbo":32,"fat":11,"dentro_da_dieta":"sim","avaliacao":"Ok","recomendacao":"Continue"}';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Groq provider', () => {
  test('calls API and parses JSON response', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const { createGroqProvider } = require('../../src/llm/groq');
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
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const { createGroqProvider } = require('../../src/llm/groq');
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
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const { createOpenAIProvider } = require('../../src/llm/openai');
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
  test('createLLMProvider returns a provider with chat() for groq', () => {
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: jest.fn() } },
    }));
    const { createLLMProvider } = require('../../src/llm/index');
    const provider = createLLMProvider({ provider: 'groq', apiKey: 'test' });
    expect(typeof provider.chat).toBe('function');
  });

  test('createLLMProvider returns a provider with chat() for openai', () => {
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: jest.fn() } },
    }));
    const { createLLMProvider } = require('../../src/llm/index');
    const provider = createLLMProvider({ provider: 'openai', apiKey: 'test' });
    expect(typeof provider.chat).toBe('function');
  });

  test('throws on unknown provider', () => {
    const { createLLMProvider } = require('../../src/llm/index');
    expect(() => createLLMProvider({ provider: 'unknown', apiKey: 'test' })).toThrow(
      /Unknown LLM provider/
    );
  });
});
