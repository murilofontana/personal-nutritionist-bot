import { buildPossoSystemPrompt, buildUserContext } from '../utils/prompt';
import { formatPossoResponse } from '../utils/format';
import type { BotContext, BotConversation, Queries, LLMProvider, PossoResponse } from '../types';

function isValidPossoResponse(raw: unknown): raw is PossoResponse {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  const validPodeComer = ['sim', 'sim_com_ressalva', 'nao'];
  return (
    validPodeComer.includes(r.pode_comer as string) &&
    typeof r.porcao_sugerida === 'string' && (r.porcao_sugerida as string).trim() !== '' &&
    typeof r.por_que === 'string'          && (r.por_que as string).trim() !== '' &&
    typeof r.impacto_nos_macros === 'string' && (r.impacto_nos_macros as string).trim() !== ''
  );
}

async function possoConversation(
  conversation: BotConversation,
  ctx: BotContext,
  q: Queries,
  llm: LLMProvider,
): Promise<void> {
  await ctx.reply(
    '🤔 <b>O que você quer comer?</b>\n<i>Ex: pipoca, pipoca 50g, uma fatia de pizza</i>',
    { parse_mode: 'HTML' }
  );

  // Wait for a text message only. If user sends non-text, abort silently.
  const input = await conversation.waitFor('message');
  if (!input.message.text) return;
  const foodText = input.message.text.trim();

  const dietPlan = q.getDietPlan();
  if (!dietPlan) {
    await ctx.reply(
      '⚠️ Dieta não configurada. Use /dieta para cadastrar sua dieta padrão.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Guard: profile must exist
  let profile;
  try {
    profile = q.getProfile();
  } catch {
    await ctx.reply(
      '⚠️ Perfil não configurado. Use /dieta para definir suas metas.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const today     = new Date().toISOString().slice(0, 10);
  const totals    = q.getDailyTotals(today);
  const extraKcal = q.getExtraKcalForDate(today);

  const systemPrompt = buildPossoSystemPrompt(dietPlan);
  const userContext  = buildUserContext(totals, extraKcal, profile);
  const userMessage  = `Consulta (não registrar como refeição): ${foodText}`;

  await ctx.replyWithChatAction('typing');

  // llm.chat() parses JSON internally and returns the object typed as LLMResult.
  // Because we supplied buildPossoSystemPrompt (different schema), we cast to unknown
  // and validate the actual runtime fields below.
  // On invalid schema, retry once with a JSON reinforcement message (same pattern
  // used in the existing LLM providers for malformed responses).
  async function callLLM(extraReinforcement = false): Promise<unknown> {
    const msg = extraReinforcement
      ? `${userMessage}\n\nResposta anterior inválida. Responda APENAS com o objeto JSON de consulta especificado.`
      : userMessage;
    return llm.chat({ systemPrompt, userContext, userMessage: msg }) as unknown;
  }

  let raw: unknown;
  try {
    raw = await callLLM();
  } catch (err) {
    console.error('[posso] LLM error:', (err as Error).message);
    await ctx.reply(
      '❌ Não consegui consultar o nutricionista agora. Tente novamente.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Retry once if schema is invalid
  if (!isValidPossoResponse(raw)) {
    console.warn('[posso] Invalid LLM response, retrying once:', raw);
    try {
      raw = await callLLM(true);
    } catch (err) {
      console.error('[posso] LLM retry error:', (err as Error).message);
      await ctx.reply(
        '❌ Não consegui consultar o nutricionista agora. Tente novamente.',
        { parse_mode: 'HTML' }
      );
      return;
    }
  }

  if (!isValidPossoResponse(raw)) {
    console.error('[posso] Invalid LLM response after retry:', raw);
    await ctx.reply(
      '❌ Não consegui consultar o nutricionista agora. Tente novamente.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const reply = formatPossoResponse(raw);
  await ctx.reply(reply, { parse_mode: 'HTML' });
}

export function createPossoConversation(q: Queries, llm: LLMProvider) {
  return (conversation: BotConversation, ctx: BotContext): Promise<void> =>
    possoConversation(conversation, ctx, q, llm);
}

export function createPossoCommand() {
  return async (ctx: BotContext): Promise<void> => {
    await ctx.conversation.enter('posso');
  };
}
