import { buildSystemPrompt, buildUserContext } from '../utils/prompt';
import { formatMealResponse } from '../utils/format';
import type { BotContext, Queries, LLMProvider, Remaining } from '../types';

export function createMealHandler(q: Queries, llm: LLMProvider) {
  return async (ctx: BotContext): Promise<void> => {
    const userMessage = ctx.message!.text!.trim();
    const today       = new Date().toISOString().slice(0, 10);
    const now         = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const dietPlan = q.getDietPlan();
    if (!dietPlan) {
      await ctx.reply(
        '⚠️ Dieta não configurada. Use /dieta para cadastrar sua dieta padrão.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const totals    = q.getDailyTotals(today);
    const profile   = q.getProfile();
    const extraKcal = q.getExtraKcalForDate(today);

    const systemPrompt = buildSystemPrompt(dietPlan);
    const userContext  = buildUserContext(totals, extraKcal, profile);

    // Show typing indicator
    await ctx.replyWithChatAction('typing');

    let llmResult;
    try {
      llmResult = await llm.chat({ systemPrompt, userContext, userMessage });
    } catch (err) {
      console.error('[meal handler] LLM error:', (err as Error).message);
      await ctx.reply(
        '❌ Erro ao consultar o assistente. Tente novamente em instantes.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Validate required fields
    const required = ['kcal', 'prot', 'carbo', 'fat', 'dentro_da_dieta', 'avaliacao', 'recomendacao'] as const;
    const missing  = required.filter(f => llmResult[f] === undefined);
    if (missing.length > 0) {
      console.error('[meal handler] LLM returned incomplete JSON, missing:', missing);
      await ctx.reply(
        '❌ Resposta do assistente incompleta. Tente reformular a refeição.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Save meal to DB
    q.insertMeal(today, now, userMessage, llmResult.kcal, llmResult.prot, llmResult.carbo, llmResult.fat);

    // Compute remaining after this meal
    const newTotals = q.getDailyTotals(today);
    const effectiveKcal = profile.target_kcal + extraKcal;
    const remaining: Remaining = {
      kcal:  Math.max(0, effectiveKcal - newTotals.kcal),
      prot:  Math.max(0, profile.target_prot - newTotals.prot),
      carbo: Math.max(0, profile.target_carbo - newTotals.carbo),
      fat:   Math.max(0, profile.target_fat - newTotals.fat),
    };

    const mealMacros = { kcal: llmResult.kcal, prot: llmResult.prot, carbo: llmResult.carbo, fat: llmResult.fat };
    const reply = formatMealResponse(userMessage, mealMacros, llmResult, remaining);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  };
}
