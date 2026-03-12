import type { BotContext, Queries } from '../types';

export function createStatusCommand(q: Queries) {
  return async (ctx: BotContext): Promise<void> => {
    const today     = new Date().toISOString().slice(0, 10);
    const totals    = q.getDailyTotals(today);
    const profile   = q.getProfile();
    const extraKcal = q.getExtraKcalForDate(today);
    const effectiveKcal = profile.target_kcal + extraKcal;

    const remKcal  = Math.max(0, effectiveKcal - totals.kcal);
    const remProt  = Math.max(0, profile.target_prot - totals.prot);
    const remCarbo = Math.max(0, profile.target_carbo - totals.carbo);
    const remFat   = Math.max(0, profile.target_fat - totals.fat);

    const protAlert = totals.prot < 120
      ? '\n🔴 Proteína abaixo de 120g — adicione fonte proteica!'
      : '';

    await ctx.reply(
      [
        `📋 <b>Status rápido</b>`,
        ``,
        `<pre>`,
        `Calorias    ${Math.round(totals.kcal)} / ${Math.round(effectiveKcal)} kcal  (faltam ${Math.round(remKcal)})`,
        `Proteína    ${Math.round(totals.prot)} / ${Math.round(profile.target_prot)}g  (faltam ${Math.round(remProt)}g)`,
        `Carbo       ${Math.round(totals.carbo)} / ${Math.round(profile.target_carbo)}g  (faltam ${Math.round(remCarbo)}g)`,
        `Gordura     ${Math.round(totals.fat)} / ${Math.round(profile.target_fat)}g  (faltam ${Math.round(remFat)}g)`,
        `</pre>`,
        protAlert,
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
  };
}
