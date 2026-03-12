'use strict';
const {
  asciiBar,
  formatMealResponse,
  formatDailyStatus,
  formatWeeklySummary,
} = require('../../src/utils/format');

describe('asciiBar', () => {
  test('full bar when current >= target', () => {
    expect(asciiBar(1100, 1100)).toBe('██████████');
  });

  test('empty bar when current is 0', () => {
    expect(asciiBar(0, 1100)).toBe('░░░░░░░░░░');
  });

  test('half bar when current is 50% of target', () => {
    expect(asciiBar(550, 1100)).toBe('█████░░░░░');
  });

  test('caps at 100% for overflow', () => {
    expect(asciiBar(2000, 1100)).toBe('██████████');
  });

  test('respects custom width', () => {
    expect(asciiBar(500, 1000, 5)).toBe('██░░░');
  });
});

describe('formatMealResponse', () => {
  const meal = { kcal: 390, prot: 37, carbo: 32, fat: 11 };
  const llmResult = {
    dentro_da_dieta: 'sim',
    avaliacao: 'Dentro da meta.',
    recomendacao: 'Lanche A à tarde + jantar padrão.',
  };
  const remaining = { kcal: 710, prot: 58, carbo: 58, fat: 24 };

  test('contains meal kcal', () => {
    const out = formatMealResponse('frango + batata', meal, llmResult, remaining);
    expect(out).toContain('390');
  });

  test('contains recommendation text', () => {
    const out = formatMealResponse('frango + batata', meal, llmResult, remaining);
    expect(out).toContain('Lanche A à tarde');
  });

  test('contains remaining kcal', () => {
    const out = formatMealResponse('frango + batata', meal, llmResult, remaining);
    expect(out).toContain('710');
  });

  test('shows warning emoji for sim_com_ressalva', () => {
    const out = formatMealResponse('frango + batata', meal, { ...llmResult, dentro_da_dieta: 'sim_com_ressalva' }, remaining);
    expect(out).toContain('⚠️');
  });
});

describe('formatDailyStatus', () => {
  const totals = { kcal: 605, prot: 63, carbo: 57, fat: 13 };
  const profile = { target_kcal: 1100, target_prot: 95, target_carbo: 90, target_fat: 35 };
  const meals = [
    { time: '12:00', description: 'frango + batata', kcal: 390 },
    { time: '16:00', description: 'lanche whey', kcal: 215 },
  ];

  test('contains total kcal consumed', () => {
    const out = formatDailyStatus(totals, profile, 0, meals);
    expect(out).toContain('605');
  });

  test('contains meal descriptions', () => {
    const out = formatDailyStatus(totals, profile, 0, meals);
    expect(out).toContain('frango + batata');
    expect(out).toContain('lanche whey');
  });

  test('contains ASCII progress bars', () => {
    const out = formatDailyStatus(totals, profile, 0, meals);
    expect(out).toMatch(/[█░]+/);
  });

  test('renders low protein alert when total prot < 120g', () => {
    const lowProtTotals = { kcal: 900, prot: 85, carbo: 80, fat: 30 };
    const out = formatDailyStatus(lowProtTotals, profile, 0, meals);
    expect(out).toContain('120g');
  });

  test('accounts for extra kcal from exercise in effective target', () => {
    const out = formatDailyStatus(totals, profile, 250, meals);
    expect(out).toContain('1350'); // 1100 + 250
  });
});

describe('formatWeeklySummary', () => {
  const weekData = [
    { date: '2026-03-06', kcal: 1082, prot: 90, carbo: 88, fat: 30 },
    { date: '2026-03-07', kcal: 890, prot: 70, carbo: 80, fat: 25 },
  ];
  const profile = { target_kcal: 1100, target_prot: 95, target_carbo: 90, target_fat: 35 };
  const weightHistory = [];

  test('contains kcal for each day', () => {
    const out = formatWeeklySummary(weekData, profile, weightHistory);
    expect(out).toContain('1082');
    expect(out).toContain('890');
  });

  test('contains average kcal rounded correctly', () => {
    const out = formatWeeklySummary(weekData, profile, weightHistory);
    expect(out).toContain('986'); // Math.round((1082+890)/2)
  });

  test('shows weight trend when history available', () => {
    const history = [{ weight: 95.0, date: '2026-03-06' }, { weight: 94.5, date: '2026-03-12' }];
    const out = formatWeeklySummary(weekData, profile, history);
    expect(out).toContain('95');
    expect(out).toContain('94.5');
  });

  test('returns no-data message for empty weekData', () => {
    const out = formatWeeklySummary([], profile, []);
    expect(out).toContain('Sem dados');
  });
});
