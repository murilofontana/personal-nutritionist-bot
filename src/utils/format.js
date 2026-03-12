'use strict';

const PT_DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function asciiBar(current, target, width = 10) {
  const ratio = Math.min(current / target, 1);
  const filled = Math.floor(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function statusEmoji(inside) {
  if (inside === 'sim') return '✅';
  if (inside === 'sim_com_ressalva') return '⚠️';
  return '❌';
}

function pad(str, len) {
  return String(str).padEnd(len, ' ');
}

function formatMealResponse(description, meal, llmResult, remaining) {
  const { kcal, prot, carbo, fat } = meal;
  const emoji = statusEmoji(llmResult.dentro_da_dieta);

  return [
    `${emoji} <b>${description}</b>`,
    `<pre>`,
    `${pad('Calorias', 12)} ${kcal} kcal`,
    `${pad('Proteína', 12)} ${prot}g`,
    `${pad('Carboidrato', 12)} ${carbo}g`,
    `${pad('Gordura', 12)} ${fat}g`,
    `</pre>`,
    `<b>Dentro da dieta?</b> ${llmResult.avaliacao} ${emoji}`,
    ``,
    `<b>Saldo restante no dia:</b>`,
    `• Calorias: ${Math.round(remaining.kcal)} kcal`,
    `• Proteína: ${Math.round(remaining.prot)}g`,
    `• Carbo:    ${Math.round(remaining.carbo)}g`,
    `• Gordura:  ${Math.round(remaining.fat)}g`,
    ``,
    `<b>Sugestão:</b> ${llmResult.recomendacao}`,
  ].join('\n');
}

function formatDailyStatus(totals, profile, extraKcal, meals) {
  const effectiveKcal = profile.target_kcal + (extraKcal || 0);

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const mealLines =
    meals.length > 0
      ? meals.map(m => `  • ${m.time} — ${m.description} (${Math.round(m.kcal)} kcal)`).join('\n')
      : '  (nenhuma refeição registrada)';

  const remKcal  = Math.max(0, effectiveKcal - totals.kcal);
  const remProt  = Math.max(0, profile.target_prot - totals.prot);
  const remCarbo = Math.max(0, profile.target_carbo - totals.carbo);
  const remFat   = Math.max(0, profile.target_fat - totals.fat);

  const exerciseLine = extraKcal > 0 ? `  (+${extraKcal} kcal de exercício incluídos na meta)\n` : '';
  const protAlert = totals.prot < 120
    ? '\n🔴 <b>Proteína abaixo de 120g</b> — risco de perda muscular! Adicione fonte proteica.'
    : '';

  return [
    `📊 <b>Resumo do dia — ${dateStr}</b>`,
    ``,
    `<b>Refeições registradas:</b>`,
    mealLines,
    ``,
    `<b>Totais vs Meta:</b>${exerciseLine ? '\n' + exerciseLine : ''}`,
    `<pre>`,
    `Calorias  ${asciiBar(totals.kcal, effectiveKcal)}  ${Math.round(totals.kcal)} / ${Math.round(effectiveKcal)} kcal`,
    `Proteína  ${asciiBar(totals.prot, profile.target_prot)}  ${Math.round(totals.prot)} / ${Math.round(profile.target_prot)}g`,
    `Carbo     ${asciiBar(totals.carbo, profile.target_carbo)}  ${Math.round(totals.carbo)} / ${Math.round(profile.target_carbo)}g`,
    `Gordura   ${asciiBar(totals.fat, profile.target_fat)}  ${Math.round(totals.fat)} / ${Math.round(profile.target_fat)}g`,
    `</pre>`,
    `<b>Faltam:</b> ${Math.round(remKcal)} kcal | ${Math.round(remProt)}g prot | ${Math.round(remCarbo)}g carbo | ${Math.round(remFat)}g fat`,
    protAlert,
  ].join('\n');
}

function formatWeeklySummary(weekData, profile, weightHistory) {
  if (weekData.length === 0) {
    return '📅 <b>Sem dados para a semana.</b> Registre refeições para ver o resumo.';
  }

  const dayLines = weekData.map(day => {
    const d = new Date(day.date + 'T12:00:00');
    const dayName = PT_DAY_NAMES[d.getDay()];
    const bar = asciiBar(day.kcal, profile.target_kcal);
    const onTarget =
      day.kcal >= profile.target_kcal * 0.85 && day.kcal <= profile.target_kcal * 1.15;
    const status = onTarget ? '✅' : '⚠️';
    return `  ${dayName}  ${bar}  ${Math.round(day.kcal)} kcal ${status}`;
  });

  const complete = weekData.filter(d => d.kcal > 200);
  const avg = arr => (complete.length > 0 ? Math.round(arr.reduce((s, d) => s + d, 0) / complete.length) : 0);

  const avgKcal  = avg(complete.map(d => d.kcal));
  const avgProt  = avg(complete.map(d => d.prot));
  const avgCarbo = avg(complete.map(d => d.carbo));
  const avgFat   = avg(complete.map(d => d.fat));

  const daysOnTarget = complete.filter(
    d => d.kcal >= profile.target_kcal * 0.85 && d.kcal <= profile.target_kcal * 1.15
  ).length;

  const daysLowProt = complete.filter(d => d.prot < 120).length;
  const protAlert = daysLowProt > 0 ? `\n🔴 Proteína baixa (< 120g): ${daysLowProt} dia(s)` : '';

  let weightLine = '';
  if (weightHistory.length >= 2) {
    const first = weightHistory[0].weight;
    const last  = weightHistory[weightHistory.length - 1].weight;
    const diff  = (last - first).toFixed(1);
    const sign  = diff > 0 ? '+' : '';
    weightLine = `\n⚖️ Peso: ${first}kg → ${last}kg (${sign}${diff}kg na semana)`;
  }

  return [
    `📅 <b>Resumo da semana</b>`,
    ``,
    `<b>Calorias por dia:</b>`,
    `<pre>`,
    ...dayLines,
    `</pre>`,
    `<b>Médias (dias com registro):</b>`,
    `<pre>`,
    `Calorias  ${avgKcal} kcal/dia  ${avgKcal >= profile.target_kcal * 0.85 ? '✅' : '⚠️'}`,
    `Proteína  ${avgProt}g/dia`,
    `Carbo     ${avgCarbo}g/dia`,
    `Gordura   ${avgFat}g/dia`,
    `</pre>`,
    `Dias dentro da meta: ${daysOnTarget} / ${complete.length}`,
    protAlert,
    weightLine,
  ].join('\n');
}

module.exports = { asciiBar, formatMealResponse, formatDailyStatus, formatWeeklySummary };
