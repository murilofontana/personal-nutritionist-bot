'use strict';

function createDiaCommand(q) {
  return async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    q.deleteMealsForDate(today);
    q.deleteAdjustmentsForDate(today);
    await ctx.reply(
      '🗑️ <b>Dia zerado!</b> Todos os registros de hoje foram apagados.\n\nPode começar a registrar as refeições de hoje.',
      { parse_mode: 'HTML' }
    );
  };
}

module.exports = { createDiaCommand };
