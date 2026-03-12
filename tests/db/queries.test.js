'use strict';
const Database = require('better-sqlite3');
const { initSchema } = require('../../src/db/index');
const { createQueries } = require('../../src/db/queries');

let db;
let q;

beforeEach(() => {
  db = new Database(':memory:');
  initSchema(db);
  q = createQueries(db);
});

afterEach(() => {
  db.close();
});

describe('meals', () => {
  test('insertMeal and getMealsForDate', () => {
    q.insertMeal('2026-03-12', '12:00', 'frango com batata', 390, 37, 32, 11);
    const meals = q.getMealsForDate('2026-03-12');
    expect(meals).toHaveLength(1);
    expect(meals[0].description).toBe('frango com batata');
    expect(meals[0].kcal).toBe(390);
  });

  test('getDailyTotals sums macros correctly', () => {
    q.insertMeal('2026-03-12', '12:00', 'almoço', 390, 37, 32, 11);
    q.insertMeal('2026-03-12', '16:00', 'lanche', 215, 26, 25, 2);
    const totals = q.getDailyTotals('2026-03-12');
    expect(totals.kcal).toBe(605);
    expect(totals.prot).toBe(63);
    expect(totals.carbo).toBe(57);
    expect(totals.fat).toBe(13);
  });

  test('getDailyTotals returns zeros when no meals', () => {
    const totals = q.getDailyTotals('2026-03-12');
    expect(totals.kcal).toBe(0);
    expect(totals.prot).toBe(0);
    expect(totals.carbo).toBe(0);
    expect(totals.fat).toBe(0);
  });

  test('deleteMealsForDate removes all meals for date only', () => {
    q.insertMeal('2026-03-12', '12:00', 'almoço', 390, 37, 32, 11);
    q.insertMeal('2026-03-13', '12:00', 'almoço', 390, 37, 32, 11);
    q.deleteMealsForDate('2026-03-12');
    expect(q.getMealsForDate('2026-03-12')).toHaveLength(0);
    expect(q.getMealsForDate('2026-03-13')).toHaveLength(1);
  });

  test('getWeeklyData returns aggregated daily totals', () => {
    q.insertMeal('2026-03-10', '12:00', 'almoço', 390, 37, 32, 11);
    q.insertMeal('2026-03-11', '12:00', 'almoço', 400, 38, 33, 12);
    const week = q.getWeeklyData('2026-03-10', '2026-03-11');
    expect(week).toHaveLength(2);
    const march10 = week.find(d => d.date === '2026-03-10');
    expect(march10.kcal).toBe(390);
  });
});

describe('profile', () => {
  test('getProfile returns default values after schema init', () => {
    const profile = q.getProfile();
    expect(profile.target_kcal).toBe(1100);
    expect(profile.target_prot).toBe(95);
    expect(profile.target_carbo).toBe(90);
    expect(profile.target_fat).toBe(35);
    expect(profile.weight).toBeNull();
  });

  test('updateProfile updates specified fields and leaves others unchanged', () => {
    q.updateProfile({ weight: 94.5, target_kcal: 1200 });
    const profile = q.getProfile();
    expect(profile.weight).toBe(94.5);
    expect(profile.target_kcal).toBe(1200);
    expect(profile.target_prot).toBe(95);
  });

  test('updateProfile ignores unknown fields', () => {
    expect(() => q.updateProfile({ unknown_field: 99 })).not.toThrow();
  });
});

describe('diet plan', () => {
  test('getDietPlan returns null when empty', () => {
    expect(q.getDietPlan()).toBeNull();
  });

  test('setDietPlan and getDietPlan round-trip', () => {
    q.setDietPlan('minha dieta completa aqui');
    expect(q.getDietPlan()).toBe('minha dieta completa aqui');
  });

  test('setDietPlan overwrites previous content', () => {
    q.setDietPlan('versão 1');
    q.setDietPlan('versão 2');
    expect(q.getDietPlan()).toBe('versão 2');
  });
});

describe('day adjustments', () => {
  test('insertAdjustment and getExtraKcalForDate sum correctly', () => {
    q.insertAdjustment('2026-03-12', 250);
    q.insertAdjustment('2026-03-12', 250);
    expect(q.getExtraKcalForDate('2026-03-12')).toBe(500);
  });

  test('getExtraKcalForDate returns 0 when no adjustments', () => {
    expect(q.getExtraKcalForDate('2026-03-12')).toBe(0);
  });

  test('deleteAdjustmentsForDate removes only that date', () => {
    q.insertAdjustment('2026-03-12', 250);
    q.insertAdjustment('2026-03-13', 250);
    q.deleteAdjustmentsForDate('2026-03-12');
    expect(q.getExtraKcalForDate('2026-03-12')).toBe(0);
    expect(q.getExtraKcalForDate('2026-03-13')).toBe(250);
  });
});

describe('weight history', () => {
  test('insertWeightRecord and getWeightHistory in date range', () => {
    q.insertWeightRecord(95.0, '2026-03-06');
    q.insertWeightRecord(94.5, '2026-03-12');
    const history = q.getWeightHistory('2026-03-06', '2026-03-12');
    expect(history).toHaveLength(2);
    expect(history[0].weight).toBe(95.0);
    expect(history[1].weight).toBe(94.5);
  });

  test('getWeightHistory returns empty array when no records', () => {
    expect(q.getWeightHistory('2026-03-06', '2026-03-12')).toHaveLength(0);
  });
});
