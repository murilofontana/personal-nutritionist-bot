jest.mock('../../src/utils/prompt', () => ({
  buildSystemPrompt: jest.fn().mockReturnValue('mocked-system-prompt'),
  buildUserContext: jest.fn().mockReturnValue('mocked-user-context'),
  buildImageContext: jest.fn().mockReturnValue('mocked-image-context'),
}));

jest.mock('../../src/utils/format', () => ({
  formatMealResponse: jest.fn().mockReturnValue('<b>Refeição registrada</b>'),
}));

import { createMealHandler } from '../../src/handlers/meal';
import type { Queries, LLMProvider, LLMResult } from '../../src/types';

const MOCK_LLM_RESULT: LLMResult = {
  kcal: 200,
  prot: 10,
  carbo: 30,
  fat: 5,
  dentro_da_dieta: 'sim',
  avaliacao: 'Ok',
  recomendacao: 'Continue',
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

function makeMockQueries(overrides: Partial<Record<keyof Queries, unknown>> = {}): jest.Mocked<Queries> {
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
    ...overrides,
  } as unknown as jest.Mocked<Queries>;
}

function makeMockLLM(result: Partial<LLMResult> = {}): LLMProvider {
  return {
    chat: jest.fn().mockResolvedValue({ ...MOCK_LLM_RESULT, ...result }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset global fetch between tests
  (global as Record<string, unknown>).fetch = undefined;
});

describe('createMealHandler - photo messages', () => {
  test('photo without caption (undefined) replies with prompt and returns early', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM();
    const handler = createMealHandler(q, llm, 'test-token');

    const ctx = {
      message: {
        photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 800, height: 600 }],
        caption: undefined,
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: { getFile: jest.fn() },
      replyWithChatAction: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('legenda'),
      expect.any(Object)
    );
    expect(llm.chat).not.toHaveBeenCalled();
    expect(q.insertMeal).not.toHaveBeenCalled();
  });

  test('photo with empty string caption replies with prompt and returns early', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM();
    const handler = createMealHandler(q, llm, 'test-token');

    const ctx = {
      message: {
        photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 800, height: 600 }],
        caption: '',
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: { getFile: jest.fn() },
      replyWithChatAction: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('legenda'),
      expect.any(Object)
    );
    expect(llm.chat).not.toHaveBeenCalled();
    expect(q.insertMeal).not.toHaveBeenCalled();
  });

  test('photo download failure replies with error message and does not call LLM', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM();
    const handler = createMealHandler(q, llm, 'test-token');

    const ctx = {
      message: {
        photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 800, height: 600 }],
        caption: 'comi 3 biscoitos',
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: {
        getFile: jest.fn().mockRejectedValue(new Error('Network error')),
      },
      replyWithChatAction: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('baixar a imagem'),
      expect.any(Object)
    );
    expect(llm.chat).not.toHaveBeenCalled();
    expect(q.insertMeal).not.toHaveBeenCalled();
  });

  test('photo with caption calls LLM with imageBase64 and imageMimeType', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM({ descricao: '3 biscoitos Crackers (~45g)' });
    const handler = createMealHandler(q, llm, 'test-token');

    const mockBuf = new ArrayBuffer(8);
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(mockBuf),
    }) as unknown as typeof fetch;

    const ctx = {
      message: {
        photo: [
          { file_id: 'f_small', file_unique_id: 'u0', width: 100, height: 100 },
          { file_id: 'f_large', file_unique_id: 'u1', width: 800, height: 600 },
        ],
        caption: 'comi 3 biscoitos',
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: {
        getFile: jest.fn().mockResolvedValue({ file_path: 'photos/f_large.jpg' }),
      },
      replyWithChatAction: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx as any);

    // Verify the largest photo was used
    expect(ctx.api.getFile).toHaveBeenCalledWith('f_large');

    // Verify LLM was called with imageBase64 and imageMimeType
    expect(llm.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        imageBase64: expect.any(String),
        imageMimeType: 'image/jpeg',
        userMessage: 'comi 3 biscoitos',
      })
    );
  });

  test('photo with caption saves LLM descricao to DB (not raw caption)', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM({ descricao: '3 biscoitos Crackers (~45g)' });
    const handler = createMealHandler(q, llm, 'test-token');

    const mockBuf = new ArrayBuffer(8);
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(mockBuf),
    }) as unknown as typeof fetch;

    const ctx = {
      message: {
        photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 800, height: 600 }],
        caption: 'comi 3 biscoitos',
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: {
        getFile: jest.fn().mockResolvedValue({ file_path: 'photos/f1.jpg' }),
      },
      replyWithChatAction: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx as any);

    expect(q.insertMeal).toHaveBeenCalledWith(
      expect.any(String), // date
      expect.any(String), // time
      '3 biscoitos Crackers (~45g)', // LLM-generated descricao
      200, 10, 30, 5
    );
  });

  test('photo with caption falls back to caption when LLM returns no descricao', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM(); // MOCK_LLM_RESULT has no descricao
    const handler = createMealHandler(q, llm, 'test-token');

    const mockBuf = new ArrayBuffer(8);
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(mockBuf),
    }) as unknown as typeof fetch;

    const ctx = {
      message: {
        photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 800, height: 600 }],
        caption: 'legenda do usuário',
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: {
        getFile: jest.fn().mockResolvedValue({ file_path: 'photos/f1.jpg' }),
      },
      replyWithChatAction: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx as any);

    expect(q.insertMeal).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'legenda do usuário', // fallback to caption
      200, 10, 30, 5
    );
  });

  test('text message flow remains unchanged (saves text to DB)', async () => {
    const q = makeMockQueries();
    const llm = makeMockLLM();
    const handler = createMealHandler(q, llm, 'test-token');

    const ctx = {
      message: {
        text: 'frango grelhado 150g',
        photo: undefined,
      },
      reply: jest.fn().mockResolvedValue(undefined),
      api: { getFile: jest.fn() },
      replyWithChatAction: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx as any);

    expect(llm.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: 'frango grelhado 150g',
      })
    );
    // imageBase64 should not be present (undefined)
    const chatCall = (llm.chat as jest.Mock).mock.calls[0][0];
    expect(chatCall.imageBase64).toBeUndefined();

    expect(q.insertMeal).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'frango grelhado 150g',
      200, 10, 30, 5
    );
  });
});
