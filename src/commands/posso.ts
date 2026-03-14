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
  botToken?: string,
): Promise<void> {
  // Guard: diet plan must exist
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

  await ctx.reply(
    '🤔 <b>O que você quer comer?</b>\n<i>Ex: pipoca, pipoca 50g, uma fatia de pizza</i>',
    { parse_mode: 'HTML' }
  );

  // Wait for a text or photo message. Reject anything else.
  const input = await conversation.waitFor('message');
  const hasText  = !!input.message.text;
  const hasPhoto = !!input.message.photo?.length;

  if (!hasText && !hasPhoto) {
    await input.reply('Por favor, envie uma mensagem de texto ou uma foto.', { parse_mode: 'HTML' });
    return;
  }
  if (hasPhoto && !input.message.caption) {
    await input.reply(
      'Foto recebida! Adicione uma legenda descrevendo quanto vai comer.',
      { parse_mode: 'HTML' }
    );
    return;
    // NOTE: intentionally returns and ends the conversation.
    // The user must re-enter /posso to try again.
  }

  const foodText = hasPhoto ? input.message.caption!.trim() : input.message.text!.trim();

  let imageBase64: string | undefined;
  let imageMimeType: string | undefined;

  if (hasPhoto) {
    try {
      const photo = input.message.photo![input.message.photo!.length - 1];
      const file  = await input.api.getFile(photo.file_id);
      const url   = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
      const buf   = await fetch(url).then(r => r.arrayBuffer());
      imageBase64   = Buffer.from(buf).toString('base64');
      imageMimeType = 'image/jpeg'; // Telegram always returns JPEG for photos
    } catch (err) {
      console.error('[posso] Photo download error:', (err as Error).message);
      await input.reply(
        '❌ Não consegui baixar a imagem. Tente novamente.',
        { parse_mode: 'HTML' }
      );
      return;
    }
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
    return llm.chat({ systemPrompt, userContext, userMessage: msg, imageBase64, imageMimeType }) as unknown;
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

export function createPossoConversation(q: Queries, llm: LLMProvider, botToken?: string) {
  return (conversation: BotConversation, ctx: BotContext): Promise<void> =>
    possoConversation(conversation, ctx, q, llm, botToken);
}

export function createPossoCommand() {
  return async (ctx: BotContext): Promise<void> => {
    await ctx.conversation.enter('posso');
  };
}
