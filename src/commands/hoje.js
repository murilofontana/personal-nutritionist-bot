'use strict';
const { formatDailyStatus } = require('../utils/format');

function createHojeCommand(q) {
  return async (ctx) => {
    const today     = new Date().toISOString().slice(0, 10);
    const totals    = q.getDailyTotals(today);
    const profile   = q.getProfile();
    const extraKcal = q.getExtraKcalForDate(today);
    const meals     = q.getMealsForDate(today);

    const reply = formatDailyStatus(totals, profile, extraKcal, meals);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  };
}

module.exports = { createHojeCommand };
