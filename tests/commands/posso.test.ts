jest.mock('../../src/utils/prompt', () => ({
  buildPossoSystemPrompt: jest.fn().mockReturnValue('mocked-posso-prompt'),
  buildUserContext: jest.fn().mockReturnValue('mocked-user-context'),
}));

jest.mock('../../src/utils/format', () => ({
  formatPossoResponse: jest.fn().mockReturnValue('<b>Posso comer!</b>'),
}));

import { createPossoConversation } from '../../src/commands/posso';
import type { Queries, LLMProvider } from '../../src/types';

const MOCK_POSSO_RESPONSE = {
  pode_comer: 'sim' as const,
  porcao_sugerida: '50g (~200 kcal)',
  por_que: 'Cabe no saldo do dia',
  impacto_nos_macros: 'consome ~10g carbo',
};

const MOCK_PROFILE = {
  id: 1,
  weight: null,
  target_kcal: 1100,
  target_prot: 95,
  target_carbo: 90,
  target_fat: 35,
  updated_at: '2026-01-01',
};

function makeMockQueries(): jest.Mocked<Queries> {
  return {
    getDietPlan: jest.fn().mockReturnValue('minha dieta'),
    getDailyTotals: jest.fn().mockReturnValue({ kcal: 0, prot: 0, carbo: 0, fat: 0 }),
    getProfile: jest.fn().mockReturnValue(MOCK_PROFILE),
    getExtraKcalForDate: jest.fn().mockReturnValue(0),
    insertMeal: jest.fn(),
    getMealsForDate: jest.fn(),
    deleteMealsForDate: jest.fn(),
    getWeeklyData: jest.fn(),
    updateProfile: jest.fn(),
    setDietPlan: jest.fn(),
    insertAdjustment: jest.fn(),
    deleteAdjustmentsForDate: jest.fn(),
    insertWeightRecord: jest.fn(),
    getWeightHistory: jest.fn(),
  } as unknown as jest.Mocked<Queries>;
}

function makeMockLLM(): LLMProvider {
  return {
    chat: jest.fn().mockResolvedValue(MOCK_POSSO_RESPONSE),
  };
}

function makeCtx() {
  return {
    reply: jest.fn().mockResolvedValue(undefined),
    replyWithChatAction: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (global as Record<string, unknown>).fetch = undefined;
});

describe('posso conversation - photo guard logic', () => {
  test('no text and no photo replies asking for text or photo and does not call LLM', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM();
    const possoHandler = createPossoConversation(q, llm, 'test-token');

    const ctx = makeCtx();
    const input = {
      message: { text: undefined, photo: undefined, caption: undefined },
      reply: jest.fn().mockResolvedValue(undefined),
    };
    const conversation = { waitFor: jest.fn().mockResolvedValue(input) };

    await possoHandler(conversation as any, ctx as any);

    expect(input.reply).toHaveBeenCalledWith(
      expect.stringContaining('texto ou uma foto'),
      expect.any(Object)
    );
    expect(llm.chat).not.toHaveBeenCalled();
  });

  test('photo without caption: asks for caption then proceeds with follow-up text', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM();
    const possoHandler = createPossoConversation(q, llm, 'test-token');

    const ctx = makeCtx();
    const mockBuf = new ArrayBuffer(8);
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(mockBuf),
    }) as unknown as typeof fetch;

    // First message: photo without caption
    const photoInput = {
      message: {
        text: undefined,
        photo: [{ file_id: 'f_large', file_unique_id: 'u1', width: 800, height: 600 }],
        caption: undefined,
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: {
        getFile: jest.fn().mockResolvedValue({ file_path: 'photos/f_large.jpg' }),
      },
    };

    // Second message: text caption
    const captionInput = {
      message: { text: 'quero comer 100g disso' },
    };

    const conversation = {
      waitFor: jest.fn()
        .mockResolvedValueOnce(photoInput)  // first waitFor('message')
        .mockResolvedValueOnce(captionInput), // second waitFor('message:text')
    };

    await possoHandler(conversation as any, ctx as any);

    // Should have asked for a caption description
    expect(photoInput.reply).toHaveBeenCalledWith(
      expect.stringContaining('Descreva'),
      expect.any(Object)
    );

    // LLM should be called with the photo AND the caption text
    expect(llm.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        imageBase64: expect.any(String),
        imageMimeType: 'image/jpeg',
        userMessage: expect.stringContaining('quero comer 100g disso'),
      })
    );
  });

  test('photo with caption downloads photo and calls LLM with imageBase64', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM();
    const possoHandler = createPossoConversation(q, llm, 'test-token');

    const ctx = makeCtx();
    const mockBuf = new ArrayBuffer(8);
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(mockBuf),
    }) as unknown as typeof fetch;

    const input = {
      message: {
        text: undefined,
        photo: [{ file_id: 'f_large', file_unique_id: 'u1', width: 800, height: 600 }],
        caption: 'quero comer isso',
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: {
        getFile: jest.fn().mockResolvedValue({ file_path: 'photos/f_large.jpg' }),
      },
    };
    const conversation = { waitFor: jest.fn().mockResolvedValue(input) };

    await possoHandler(conversation as any, ctx as any);

    expect(llm.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        imageBase64: expect.any(String),
        imageMimeType: 'image/jpeg',
        userMessage: expect.stringContaining('quero comer isso'),
      })
    );
  });

  test('text message calls LLM without imageBase64', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM();
    const possoHandler = createPossoConversation(q, llm, 'test-token');

    const ctx = makeCtx();
    const input = {
      message: {
        text: 'pipoca',
        photo: undefined,
        caption: undefined,
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };
    const conversation = { waitFor: jest.fn().mockResolvedValue(input) };

    await possoHandler(conversation as any, ctx as any);

    expect(llm.chat).toHaveBeenCalled();
    const chatCall = (llm.chat as jest.Mock).mock.calls[0][0];
    expect(chatCall.imageBase64).toBeUndefined();
    expect(chatCall.userMessage).toContain('pipoca');
  });
});
