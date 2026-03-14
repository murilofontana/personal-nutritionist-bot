import { buildSystemPrompt, buildUserContext, buildImageContext } from '../utils/prompt';
import { formatMealResponse } from '../utils/format';
import { withTyping } from '../utils/typing';
import type { BotContext, Queries, LLMProvider, Remaining } from '../types';

export function createMealHandler(q: Queries, llm: LLMProvider, botToken?: string) {
  return async (ctx: BotContext): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10);
    const now   = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const isPhoto = !!ctx.message?.photo?.length;

    let userMessage: string;
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;

    if (isPhoto) {
      const caption = ctx.message!.caption?.trim() ?? '';
      if (!caption) {
        await ctx.reply(
          'Adicione uma legenda descrevendo o que você comeu (ex: \'comi 2 unidades\').',
          { parse_mode: 'HTML' }
        );
        return;
      }
      userMessage = caption;

      // Download the largest available photo size
      try {
        const photo = ctx.message!.photo![ctx.message!.photo!.length - 1];
        const file  = await ctx.api.getFile(photo.file_id);
        const url   = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
        const buf   = await fetch(url).then(r => r.arrayBuffer());
        imageBase64   = Buffer.from(buf).toString('base64');
        imageMimeType = 'image/jpeg'; // Telegram always returns JPEG for photos
      } catch (err) {
        console.error('[meal handler] Photo download error:', (err as Error).message);
        await ctx.reply(
          '❌ Não consegui baixar a imagem. Tente novamente.',
          { parse_mode: 'HTML' }
        );
        return;
      }
    } else {
      userMessage = ctx.message!.text!.trim();
    }

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
    let userContext    = buildUserContext(totals, extraKcal, profile);
    if (isPhoto) {
      userContext += '\n\n' + buildImageContext(userMessage);
    }

    let llmResult;
    try {
      llmResult = await withTyping(ctx, () =>
        llm.chat({ systemPrompt, userContext, userMessage, imageBase64, imageMimeType })
      );
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

    // For photos, use the LLM-generated description (falls back to caption)
    const description = isPhoto ? (llmResult.descricao ?? userMessage) : userMessage;

    // Save meal to DB
    q.insertMeal(today, now, description, llmResult.kcal, llmResult.prot, llmResult.carbo, llmResult.fat);

    // Compute remaining after this meal
    const newTotals     = q.getDailyTotals(today);
    const effectiveKcal = profile.target_kcal + extraKcal;
    const remaining: Remaining = {
      kcal:  Math.max(0, effectiveKcal - newTotals.kcal),
      prot:  Math.max(0, profile.target_prot - newTotals.prot),
      carbo: Math.max(0, profile.target_carbo - newTotals.carbo),
      fat:   Math.max(0, profile.target_fat - newTotals.fat),
    };

    const mealMacros = { kcal: llmResult.kcal, prot: llmResult.prot, carbo: llmResult.carbo, fat: llmResult.fat };
    const reply = formatMealResponse(description, mealMacros, llmResult, remaining);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  };
}
