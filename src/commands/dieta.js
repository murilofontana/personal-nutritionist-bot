'use strict';

// Conversation function — registered in bot.js via createConversation()
async function dietaConversation(conversation, ctx, q) {
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

  const choice = await conversation.waitFor('message:text');
  const choiceText = choice.message.text.trim();

  if (choiceText === '/cancelar') {
    await ctx.reply('❌ Edição cancelada.');
    return;
  }

  if (choiceText === '1') {
    await editMetas(conversation, ctx, q);
  } else if (choiceText === '2') {
    await editDietaPlan(conversation, ctx, q);
  } else {
    await ctx.reply('❌ Opção inválida. Use /dieta para tentar novamente.');
  }
}

async function editMetas(conversation, ctx, q) {
  const profile = q.getProfile();

  const fields = [
    { key: 'target_kcal', label: 'Calorias', unit: 'kcal', current: profile.target_kcal },
    { key: 'target_prot', label: 'Proteína', unit: 'g', current: profile.target_prot },
    { key: 'target_carbo', label: 'Carboidrato', unit: 'g', current: profile.target_carbo },
    { key: 'target_fat', label: 'Gordura', unit: 'g', current: profile.target_fat },
  ];

  const updates = {};

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

  const lines = Object.entries(updates).map(([k, v]) => {
    const f = fields.find(f => f.key === k);
    return `• ${f.label}: ${v}${f.unit}`;
  });

  await ctx.reply(
    `✅ <b>Metas atualizadas:</b>\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
}

async function editDietaPlan(conversation, ctx, q) {
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

// Factory to create the conversation with access to q (injected via closure in bot.js)
function createDietaConversation(q) {
  return (conversation, ctx) => dietaConversation(conversation, ctx, q);
}

function createDietaCommand() {
  return async (ctx) => {
    await ctx.conversation.enter('dieta');
  };
}

module.exports = { createDietaConversation, createDietaCommand };
