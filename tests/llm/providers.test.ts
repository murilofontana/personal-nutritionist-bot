jest.mock('openai');
jest.mock('@google/generative-ai');

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;
const MockedGoogleGenerativeAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>;

const MOCK_JSON = '{"kcal":390,"prot":37,"carbo":32,"fat":11,"dentro_da_dieta":"sim","avaliacao":"Ok","recomendacao":"Continue"}';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Groq provider
// ---------------------------------------------------------------------------

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

  test('passes multimodal content block when imageBase64 is present', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }) as unknown as OpenAI);

    const { createGroqProvider } = await import('../../src/llm/groq');
    const provider = createGroqProvider({ apiKey: 'test-key' });
    const result = await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
    });

    expect(result.kcal).toBe(390);
    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages.find((m: { role: string }) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,abc123' },
    });
  });

  test('uses vision model when imageBase64 is present and no model override', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }) as unknown as OpenAI);

    const { createGroqProvider } = await import('../../src/llm/groq');
    const provider = createGroqProvider({ apiKey: 'test-key' }); // no model override
    await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('llama-3.2-11b-vision-preview');
  });

  test('keeps user-specified model even when imageBase64 is present', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }) as unknown as OpenAI);

    const { createGroqProvider } = await import('../../src/llm/groq');
    const provider = createGroqProvider({ apiKey: 'test-key', model: 'my-custom-model' });
    await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('my-custom-model');
  });
});

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

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

  test('passes image_url content block when imageBase64 is present', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    MockedOpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }) as unknown as OpenAI);

    const { createOpenAIProvider } = await import('../../src/llm/openai');
    const provider = createOpenAIProvider({ apiKey: 'test-key' });
    const result = await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
    });

    expect(result.kcal).toBe(390);
    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages.find((m: { role: string }) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,abc123' },
    });
    expect(userMsg.content).toContainEqual(
      expect.objectContaining({ type: 'text', text: expect.stringContaining('comi frango') })
    );
  });
});

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------

describe('Gemini provider', () => {
  test('calls API and parses JSON response', async () => {
    const mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => MOCK_JSON },
    });
    const mockGetGenerativeModel = jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });
    MockedGoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }) as unknown as GoogleGenerativeAI);

    const { createGeminiProvider } = await import('../../src/llm/gemini');
    const provider = createGeminiProvider({ apiKey: 'test-key' });
    const result = await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
    });

    expect(result.kcal).toBe(390);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    // Text-only call should pass a string, not a parts object
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(typeof callArg).toBe('string');
  });

  test('passes multimodal parts structure when imageBase64 is present', async () => {
    const mockGenerateContent = jest.fn().mockResolvedValue({
      response: { text: () => MOCK_JSON },
    });
    const mockGetGenerativeModel = jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });
    MockedGoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }) as unknown as GoogleGenerativeAI);

    const { createGeminiProvider } = await import('../../src/llm/gemini');
    const provider = createGeminiProvider({ apiKey: 'test-key' });
    const result = await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
    });

    expect(result.kcal).toBe(390);
    const callArg = mockGenerateContent.mock.calls[0][0];
    // Should pass a parts object, not a plain string
    expect(typeof callArg).toBe('object');
    expect(callArg).toMatchObject({
      contents: [{
        role: 'user',
        parts: expect.arrayContaining([
          { inlineData: { mimeType: 'image/jpeg', data: 'abc123' } },
          expect.objectContaining({ text: expect.stringContaining('comi frango') }),
        ]),
      }],
    });
  });
});

// ---------------------------------------------------------------------------
// LLM factory
// ---------------------------------------------------------------------------

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
