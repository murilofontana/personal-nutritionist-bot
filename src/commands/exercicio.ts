import type { BotContext, Queries } from '../types';

const EXERCISE_KCAL = 250;

export function createExercicioCommand(q: Queries) {
  return async (ctx: BotContext): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10);
    q.insertAdjustment(today, EXERCISE_KCAL);

    const totalExtra = q.getExtraKcalForDate(today);
    const profile    = q.getProfile();
    const newTarget  = profile.target_kcal + totalExtra;

    await ctx.reply(
      [
        `🏋️ <b>Exercício registrado!</b>`,
        ``,
        `+${EXERCISE_KCAL} kcal adicionados à meta de hoje.`,
        `Nova meta calórica do dia: <b>${Math.round(newTarget)} kcal</b>`,
        `(${Math.round(totalExtra)} kcal de bônus no total hoje)`,
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
  };
}
