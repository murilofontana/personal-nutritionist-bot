import type { BotContext, Queries } from '../types';

export function createPesoCommand(q: Queries) {
  return async (ctx: BotContext): Promise<void> => {
    const text  = ctx.message!.text!.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2) {
      await ctx.reply(
        '⚖️ Use: <code>/peso 94.5</code> — informe o peso em kg.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const value = parseFloat(parts[1].replace(',', '.'));
    if (isNaN(value) || value < 20 || value > 400) {
      await ctx.reply('❌ Valor inválido. Use um número em kg, ex: <code>/peso 94.5</code>', {
        parse_mode: 'HTML',
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const prev  = q.getProfile().weight;

    q.updateProfile({ weight: value });
    q.insertWeightRecord(value, today);

    const diffLine =
      prev != null
        ? `\nAnterior: ${prev}kg → Agora: ${value}kg (${value > prev ? '+' : ''}${(value - prev).toFixed(1)}kg)`
        : '';

    await ctx.reply(
      `⚖️ <b>Peso atualizado:</b> ${value}kg${diffLine}`,
      { parse_mode: 'HTML' }
    );
  };
}
