import type { BotContext, BotConversation, Queries, ProfileUpdateFields } from '../types';

// Conversation function — registered in bot.js via createConversation()
async function dietaConversation(
  conversation: BotConversation,
  ctx: BotContext,
  q: Queries,
): Promise<void> {
  await ctx.reply(
    [
      '⚙️ <b>Editar dieta</b>',
      '',
      'O que você quer atualizar?',
      '1️⃣ Metas numéricas (calorias, proteína, carbo, gordura)',
      '2️⃣ Texto completo da dieta (system prompt)',
      '',
      'Responda com <b>1</b> ou <b>2</b> (ou /cancelar para sair):',
    ].join('\n'),
    { parse_mode: 'HTML' }
  );

  let choiceText = (await conversation.waitFor('message:text')).message.text.trim();

  while (!['1', '2', '/cancelar'].includes(choiceText)) {
    await ctx.reply(
      '❌ Opção inválida. Responda com <b>1</b>, <b>2</b> ou /cancelar:',
      { parse_mode: 'HTML' },
    );
    choiceText = (await conversation.waitFor('message:text')).message.text.trim();
  }

  if (choiceText === '/cancelar') {
    await ctx.reply('❌ Edição cancelada.');
    return;
  }

  if (choiceText === '1') {
    await editMetas(conversation, ctx, q);
  } else {
    await editDietaPlan(conversation, ctx, q);
  }
}

async function editMetas(
  conversation: BotConversation,
  ctx: BotContext,
  q: Queries,
): Promise<void> {
  const profile = q.getProfile();

  const fields: { key: keyof ProfileUpdateFields; label: string; unit: string; current: number }[] = [
    { key: 'target_kcal',  label: 'Calorias',    unit: 'kcal', current: profile.target_kcal },
    { key: 'target_prot',  label: 'Proteína',    unit: 'g',    current: profile.target_prot },
    { key: 'target_carbo', label: 'Carboidrato', unit: 'g',    current: profile.target_carbo },
    { key: 'target_fat',   label: 'Gordura',     unit: 'g',    current: profile.target_fat },
  ];

  const updates: ProfileUpdateFields = {};

  for (const field of fields) {
    await ctx.reply(
      `${field.label} atual: <b>${field.current}${field.unit}</b>\nNovo valor (ou <i>pular</i> para manter):`,
      { parse_mode: 'HTML' }
    );

    const resp = await conversation.waitFor('message:text');
    const text = resp.message.text.trim().toLowerCase();

    if (text === 'pular' || text === '/pular') continue;

    const val = parseFloat(text.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      await ctx.reply(`⚠️ Valor ignorado (inválido). Mantendo ${field.current}${field.unit}.`);
      continue;
    }
    updates[field.key] = val;
  }

  if (Object.keys(updates).length === 0) {
    await ctx.reply('ℹ️ Nenhuma meta alterada.');
    return;
  }

  q.updateProfile(updates);

  const lines = (Object.keys(updates) as (keyof ProfileUpdateFields)[]).map(k => {
    const f = fields.find(f => f.key === k)!;
    return `• ${f.label}: ${updates[k]}${f.unit}`;
  });

  await ctx.reply(
    `✅ <b>Metas atualizadas:</b>\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
}

async function editDietaPlan(
  conversation: BotConversation,
  ctx: BotContext,
  q: Queries,
): Promise<void> {
  await ctx.reply(
    [
      '📋 Cole abaixo o novo texto completo da sua dieta.',
      'Este texto será usado como contexto para todas as análises do bot.',
      '',
      '<i>Envie o texto em uma única mensagem:</i>',
    ].join('\n'),
    { parse_mode: 'HTML' }
  );

  const resp = await conversation.waitFor('message:text');
  const newPlan = resp.message.text.trim();

  if (newPlan.length < 50) {
    await ctx.reply('❌ Texto muito curto (mínimo 50 caracteres). Operação cancelada.');
    return;
  }

  q.setDietPlan(newPlan);

  await ctx.reply(
    `✅ <b>Dieta atualizada!</b> (${newPlan.length} caracteres)\n\nO novo texto será usado a partir da próxima refeição.`,
    { parse_mode: 'HTML' }
  );
}

// Factory to create the conversation with access to q (injected via closure in bot.ts)
export function createDietaConversation(q: Queries) {
  return (conversation: BotConversation, ctx: BotContext): Promise<void> =>
    dietaConversation(conversation, ctx, q);
}

export function createDietaCommand() {
  return async (ctx: BotContext): Promise<void> => {
    await ctx.conversation.enter('dieta');
  };
}
