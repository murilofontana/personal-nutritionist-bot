'use strict';
const { formatWeeklySummary } = require('../utils/format');

function getLast7Days() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return { start: dates[0], end: dates[dates.length - 1] };
}

function createSemanaCommand(q) {
  return async (ctx) => {
    const { start, end } = getLast7Days();

    const weekData      = q.getWeeklyData(start, end);
    const profile       = q.getProfile();
    const weightHistory = q.getWeightHistory(start, end);

    const reply = formatWeeklySummary(weekData, profile, weightHistory);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  };
}

module.exports = { createSemanaCommand };
