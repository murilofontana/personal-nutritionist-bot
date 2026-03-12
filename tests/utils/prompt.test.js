'use strict';
const { buildSystemPrompt, buildUserContext } = require('../../src/utils/prompt');

describe('buildSystemPrompt', () => {
  test('includes the diet plan content', () => {
    const result = buildSystemPrompt('minha dieta aqui');
    expect(result).toContain('minha dieta aqui');
  });

  test('includes JSON format instruction', () => {
    const result = buildSystemPrompt('dieta');
    expect(result).toContain('JSON');
  });

  test('includes the required JSON fields', () => {
    const result = buildSystemPrompt('dieta');
    expect(result).toContain('dentro_da_dieta');
    expect(result).toContain('recomendacao');
  });
});

describe('buildUserContext', () => {
  const totals  = { kcal: 605, prot: 63, carbo: 57, fat: 13 };
  const profile = { target_kcal: 1100, target_prot: 95, target_carbo: 90, target_fat: 35 };

  test('includes consumed kcal', () => {
    expect(buildUserContext(totals, 0, profile)).toContain('605');
  });

  test('includes remaining kcal (target - consumed)', () => {
    expect(buildUserContext(totals, 0, profile)).toContain('495'); // 1100 - 605
  });

  test('accounts for exercise extra kcal in effective target', () => {
    const ctx = buildUserContext(totals, 250, profile);
    expect(ctx).toContain('1350'); // 1100 + 250
    expect(ctx).toContain('745');  // 1350 - 605
  });

  test('includes all macro values', () => {
    const ctx = buildUserContext(totals, 0, profile);
    expect(ctx).toContain('63');  // prot consumed
    expect(ctx).toContain('57');  // carbo consumed
    expect(ctx).toContain('13');  // fat consumed
  });
});
