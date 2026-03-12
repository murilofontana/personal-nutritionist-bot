import { formatDailyStatus } from '../utils/format';
import type { BotContext, Queries } from '../types';

export function createHojeCommand(q: Queries) {
  return async (ctx: BotContext): Promise<void> => {
    const today     = new Date().toISOString().slice(0, 10);
    const totals    = q.getDailyTotals(today);
    const profile   = q.getProfile();
    const extraKcal = q.getExtraKcalForDate(today);
    const meals     = q.getMealsForDate(today);

    const reply = formatDailyStatus(totals, profile, extraKcal, meals);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  };
}
