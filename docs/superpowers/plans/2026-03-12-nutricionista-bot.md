# Bot Nutricionista Telegram — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Telegram bot in Node.js that tracks daily calorie/macro intake using a pluggable LLM, persists data in SQLite, and renders daily/weekly ASCII summaries.

**Architecture:** Free-text meal messages go to the LLM (system prompt = full diet plan from DB + daily balance from SQLite), which returns structured JSON; the bot saves to SQLite and formats the response. Commands `/hoje` and `/semana` compute summaries locally from SQLite with no LLM calls. `/dieta` uses grammy conversations for multi-step editing.

**Tech Stack:** Node.js 20+, grammy + @grammyjs/conversations (Telegram), better-sqlite3 (SQLite), openai SDK (OpenAI + Groq), @google/generative-ai (Gemini), dotenv, Jest (testing)

---

## Chunk 1: Foundation (DB + Utilities + LLM)

### Task 1: Initialize project

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Initialize npm project**

```bash
npm init -y
```

- [ ] **Step 2: Install production dependencies**

```bash
npm install grammy @grammyjs/conversations better-sqlite3 openai @google/generative-ai dotenv
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install --save-dev jest
```

- [ ] **Step 4: Update `package.json` scripts and jest config**

Open `package.json` and replace the `"scripts"` section and add `"jest"` config:

```json
"scripts": {
  "start": "node src/bot.js",
  "test": "jest --forceExit"
},
"jest": {
  "testEnvironment": "node"
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
data/
.env
```

- [ ] **Step 6: Create `.env.example`**

```env
TELEGRAM_TOKEN=seu_token_aqui
ALLOWED_TELEGRAM_USER_ID=seu_id_telegram_aqui

# Escolha o provedor: groq | openai | gemini
LLM_PROVIDER=groq

GROQ_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

# Opcional: sobrescreve o modelo padrão do provedor selecionado
LLM_MODEL=
```

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p src/commands src/handlers src/llm src/db src/utils tests/db tests/utils tests/llm data
```

- [ ] **Step 8: Commit**

```bash
git init
git add package.json .gitignore .env.example
git commit -m "feat: initialize project with dependencies"
```

---

### Task 2: Database layer

**Files:**
- Create: `src/db/index.js`
- Create: `src/db/queries.js`
- Test: `tests/db/queries.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/db/queries.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/db/queries.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/db/index'`

- [ ] **Step 3: Implement `src/db/index.js`**

```js
'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      time        TEXT NOT NULL,
      description TEXT NOT NULL,
      kcal        REAL NOT NULL,
      prot        REAL NOT NULL,
      carbo       REAL NOT NULL,
      fat         REAL NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profile (
      id           INTEGER PRIMARY KEY DEFAULT 1,
      weight       REAL,
      target_kcal  REAL NOT NULL DEFAULT 1100,
      target_prot  REAL NOT NULL DEFAULT 95,
      target_carbo REAL NOT NULL DEFAULT 90,
      target_fat   REAL NOT NULL DEFAULT 35,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO profile (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS diet_plan (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      content    TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS day_adjustments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      extra_kcal REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weight_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      weight     REAL NOT NULL,
      date       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seedDietPlanIfEmpty(db, promptFilePath) {
  const existing = db.prepare('SELECT id FROM diet_plan WHERE id = 1').get();
  if (!existing && fs.existsSync(promptFilePath)) {
    const content = fs.readFileSync(promptFilePath, 'utf8');
    db.prepare(
      "INSERT INTO diet_plan (id, content, updated_at) VALUES (1, ?, datetime('now'))"
    ).run(content);
    console.log('[db] diet_plan seeded from', path.basename(promptFilePath));
  }
}

function openDatabase(dbPath, promptFilePath) {
  const db = new Database(dbPath);
  initSchema(db);
  if (promptFilePath) {
    seedDietPlanIfEmpty(db, promptFilePath);
  }
  return db;
}

module.exports = { initSchema, openDatabase, seedDietPlanIfEmpty };
```

- [ ] **Step 4: Implement `src/db/queries.js`**

```js
'use strict';

function createQueries(db) {
  return {
    // --- Meals ---
    insertMeal(date, time, description, kcal, prot, carbo, fat) {
      return db
        .prepare(
          'INSERT INTO meals (date, time, description, kcal, prot, carbo, fat) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(date, time, description, kcal, prot, carbo, fat);
    },

    getMealsForDate(date) {
      return db
        .prepare('SELECT * FROM meals WHERE date = ? ORDER BY time ASC')
        .all(date);
    },

    deleteMealsForDate(date) {
      db.prepare('DELETE FROM meals WHERE date = ?').run(date);
    },

    getDailyTotals(date) {
      return db
        .prepare(
          `SELECT
            COALESCE(SUM(kcal),0)  AS kcal,
            COALESCE(SUM(prot),0)  AS prot,
            COALESCE(SUM(carbo),0) AS carbo,
            COALESCE(SUM(fat),0)   AS fat
          FROM meals WHERE date = ?`
        )
        .get(date);
    },

    getWeeklyData(startDate, endDate) {
      return db
        .prepare(
          `SELECT
            date,
            COALESCE(SUM(kcal),0)  AS kcal,
            COALESCE(SUM(prot),0)  AS prot,
            COALESCE(SUM(carbo),0) AS carbo,
            COALESCE(SUM(fat),0)   AS fat
          FROM meals
          WHERE date >= ? AND date <= ?
          GROUP BY date
          ORDER BY date ASC`
        )
        .all(startDate, endDate);
    },

    // --- Profile ---
    getProfile() {
      return db.prepare('SELECT * FROM profile WHERE id = 1').get();
    },

    updateProfile(fields) {
      const allowed = ['weight', 'target_kcal', 'target_prot', 'target_carbo', 'target_fat'];
      const keys = Object.keys(fields).filter(k => allowed.includes(k));
      if (keys.length === 0) return;
      const sets = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => fields[k]);
      db.prepare(
        `UPDATE profile SET ${sets}, updated_at = datetime('now') WHERE id = 1`
      ).run(...values);
    },

    // --- Diet plan ---
    getDietPlan() {
      const row = db.prepare('SELECT content FROM diet_plan WHERE id = 1').get();
      return row ? row.content : null;
    },

    setDietPlan(content) {
      db.prepare(
        "INSERT OR REPLACE INTO diet_plan (id, content, updated_at) VALUES (1, ?, datetime('now'))"
      ).run(content);
    },

    // --- Day adjustments ---
    insertAdjustment(date, extra_kcal) {
      db.prepare(
        'INSERT INTO day_adjustments (date, extra_kcal) VALUES (?, ?)'
      ).run(date, extra_kcal);
    },

    getExtraKcalForDate(date) {
      const row = db
        .prepare(
          'SELECT COALESCE(SUM(extra_kcal),0) AS total FROM day_adjustments WHERE date = ?'
        )
        .get(date);
      return row.total;
    },

    deleteAdjustmentsForDate(date) {
      db.prepare('DELETE FROM day_adjustments WHERE date = ?').run(date);
    },

    // --- Weight history ---
    insertWeightRecord(weight, date) {
      db.prepare(
        'INSERT INTO weight_history (weight, date) VALUES (?, ?)'
      ).run(weight, date);
    },

    getWeightHistory(startDate, endDate) {
      return db
        .prepare(
          'SELECT weight, date FROM weight_history WHERE date >= ? AND date <= ? ORDER BY date ASC'
        )
        .all(startDate, endDate);
    },
  };
}

module.exports = { createQueries };
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest tests/db/queries.test.js --no-coverage
```

Expected: All 16 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/ tests/db/
git commit -m "feat: add SQLite database layer with queries and schema"
```

---

### Task 3: Utility functions — `format.js`

**Files:**
- Create: `src/utils/format.js`
- Test: `tests/utils/format.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/utils/format.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/utils/format.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/utils/format'`

- [ ] **Step 3: Implement `src/utils/format.js`**

```js
'use strict';

const PT_DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function asciiBar(current, target, width = 10) {
  const ratio = Math.min(current / target, 1);
  const filled = Math.round(ratio * width);
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/utils/format.test.js --no-coverage
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.js tests/utils/format.test.js
git commit -m "feat: add ASCII formatting utilities for meal responses and summaries"
```

---

### Task 4: Utility functions — `prompt.js`

**Files:**
- Create: `src/utils/prompt.js`
- Test: `tests/utils/prompt.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/utils/prompt.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/utils/prompt.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/utils/prompt'`

- [ ] **Step 3: Implement `src/utils/prompt.js`**

```js
'use strict';

const JSON_INSTRUCTION = `
IMPORTANTE: Responda SEMPRE com um objeto JSON válido, sem nenhum texto antes ou depois.
O formato obrigatório é exatamente este:
{
  "kcal": <número>,
  "prot": <número>,
  "carbo": <número>,
  "fat": <número>,
  "dentro_da_dieta": "sim" | "sim_com_ressalva" | "nao",
  "avaliacao": "<string — máx 120 chars>",
  "recomendacao": "<string — máx 200 chars>"
}
Não inclua markdown, explicações ou qualquer texto fora do objeto JSON.
`;

function buildSystemPrompt(dietPlanContent) {
  return `${dietPlanContent}\n\n---\n${JSON_INSTRUCTION}`;
}

function buildUserContext(totals, extraKcal, profile) {
  const effectiveKcal = profile.target_kcal + (extraKcal || 0);
  const remKcal  = Math.max(0, effectiveKcal - totals.kcal);
  const remProt  = Math.max(0, profile.target_prot - totals.prot);
  const remCarbo = Math.max(0, profile.target_carbo - totals.carbo);
  const remFat   = Math.max(0, profile.target_fat - totals.fat);

  return [
    `Saldo atual do dia:`,
    `- Calorias consumidas: ${Math.round(totals.kcal)} kcal (meta efetiva: ${Math.round(effectiveKcal)} kcal, restam: ${Math.round(remKcal)} kcal)`,
    `- Proteína consumida:  ${Math.round(totals.prot)}g (meta: ${Math.round(profile.target_prot)}g, restam: ${Math.round(remProt)}g)`,
    `- Carboidrato consumido: ${Math.round(totals.carbo)}g (meta: ${Math.round(profile.target_carbo)}g, restam: ${Math.round(remCarbo)}g)`,
    `- Gordura consumida:   ${Math.round(totals.fat)}g (meta: ${Math.round(profile.target_fat)}g, restam: ${Math.round(remFat)}g)`,
  ].join('\n');
}

module.exports = { buildSystemPrompt, buildUserContext };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/utils/prompt.test.js --no-coverage
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/prompt.js tests/utils/prompt.test.js
git commit -m "feat: add LLM prompt builder with JSON instruction"
```

---

### Task 5: LLM abstraction layer

**Files:**
- Create: `src/llm/groq.js`
- Create: `src/llm/openai.js`
- Create: `src/llm/gemini.js`
- Create: `src/llm/index.js`
- Test: `tests/llm/providers.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/llm/providers.test.js`:

```js
'use strict';
jest.mock('openai');
jest.mock('@google/generative-ai');

const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MOCK_JSON = '{"kcal":390,"prot":37,"carbo":32,"fat":11,"dentro_da_dieta":"sim","avaliacao":"Ok","recomendacao":"Continue"}';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('Groq provider', () => {
  test('calls API and parses JSON response', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const { createGroqProvider } = require('../../src/llm/groq');
    const provider = createGroqProvider({ apiKey: 'test-key', model: 'llama-3.3-70b-versatile' });
    const result = await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
    });

    expect(result.kcal).toBe(390);
    expect(result.prot).toBe(37);
    expect(result.dentro_da_dieta).toBe('sim');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('retries once on JSON parse error', async () => {
    const mockCreate = jest.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: 'texto inválido' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: MOCK_JSON } }] });
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const { createGroqProvider } = require('../../src/llm/groq');
    const provider = createGroqProvider({ apiKey: 'test-key', model: 'test' });
    const result = await provider.chat({ systemPrompt: 's', userContext: 'c', userMessage: 'm' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.kcal).toBe(390);
  });
});

describe('OpenAI provider', () => {
  test('calls API and parses JSON response', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_JSON } }],
    });
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const { createOpenAIProvider } = require('../../src/llm/openai');
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-4o-mini' });
    const result = await provider.chat({
      systemPrompt: 'sys',
      userContext: 'ctx',
      userMessage: 'comi frango',
    });

    expect(result.kcal).toBe(390);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('LLM factory', () => {
  test('createLLMProvider returns a provider with chat() for groq', () => {
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: jest.fn() } },
    }));
    const { createLLMProvider } = require('../../src/llm/index');
    const provider = createLLMProvider({ provider: 'groq', apiKey: 'test' });
    expect(typeof provider.chat).toBe('function');
  });

  test('createLLMProvider returns a provider with chat() for openai', () => {
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: jest.fn() } },
    }));
    const { createLLMProvider } = require('../../src/llm/index');
    const provider = createLLMProvider({ provider: 'openai', apiKey: 'test' });
    expect(typeof provider.chat).toBe('function');
  });

  test('throws on unknown provider', () => {
    const { createLLMProvider } = require('../../src/llm/index');
    expect(() => createLLMProvider({ provider: 'unknown', apiKey: 'test' })).toThrow(
      /Unknown LLM provider/
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/llm/providers.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/llm/groq'`

- [ ] **Step 3: Implement `src/llm/groq.js`**

```js
'use strict';
const OpenAI = require('openai');

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function createGroqProvider({ apiKey, model }) {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  async function callAPI(messages, temperature = 0.2) {
    const response = await client.chat.completions.create({
      model: model || DEFAULT_MODEL,
      messages,
      temperature,
    });
    const text = response.choices[0].message.content.trim();
    return JSON.parse(text);
  }

  async function chat({ systemPrompt, userContext, userMessage }) {
    const userContent = `${userContext}\n\nRefeição relatada: ${userMessage}`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    try {
      return await callAPI(messages);
    } catch (_err) {
      // Retry once with explicit JSON reinforcement
      return await callAPI([
        ...messages,
        { role: 'user', content: 'Responda APENAS com o objeto JSON, sem texto adicional.' },
      ], 0);
    }
  }

  return { chat };
}

module.exports = { createGroqProvider };
```

- [ ] **Step 4: Implement `src/llm/openai.js`**

```js
'use strict';
const OpenAI = require('openai');

const DEFAULT_MODEL = 'gpt-4o-mini';

function createOpenAIProvider({ apiKey, model }) {
  const client = new OpenAI({ apiKey });

  async function callAPI(messages, temperature = 0.2) {
    const response = await client.chat.completions.create({
      model: model || DEFAULT_MODEL,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    });
    const text = response.choices[0].message.content.trim();
    return JSON.parse(text);
  }

  async function chat({ systemPrompt, userContext, userMessage }) {
    const userContent = `${userContext}\n\nRefeição relatada: ${userMessage}`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    try {
      return await callAPI(messages);
    } catch (_err) {
      return await callAPI([
        ...messages,
        { role: 'user', content: 'Responda APENAS com o objeto JSON.' },
      ], 0);
    }
  }

  return { chat };
}

module.exports = { createOpenAIProvider };
```

- [ ] **Step 5: Implement `src/llm/gemini.js`**

```js
'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');

const DEFAULT_MODEL = 'gemini-1.5-flash';

function createGeminiProvider({ apiKey, model }) {
  const genAI = new GoogleGenerativeAI(apiKey);

  function getModel(systemInstruction) {
    return genAI.getGenerativeModel({
      model: model || DEFAULT_MODEL,
      systemInstruction,
    });
  }

  function stripMarkdown(text) {
    return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  }

  async function chat({ systemPrompt, userContext, userMessage }) {
    const generativeModel = getModel(systemPrompt);
    const userContent = `${userContext}\n\nRefeição relatada: ${userMessage}`;

    try {
      const result = await generativeModel.generateContent(userContent);
      return JSON.parse(stripMarkdown(result.response.text()));
    } catch (_err) {
      const retry = await generativeModel.generateContent(
        `${userContent}\n\nIMPORTANTE: Responda APENAS com o objeto JSON, sem markdown.`
      );
      return JSON.parse(stripMarkdown(retry.response.text()));
    }
  }

  return { chat };
}

module.exports = { createGeminiProvider };
```

- [ ] **Step 6: Implement `src/llm/index.js`**

```js
'use strict';
const { createGroqProvider }   = require('./groq');
const { createOpenAIProvider } = require('./openai');
const { createGeminiProvider } = require('./gemini');

function createLLMProvider({ provider, apiKey, model }) {
  switch (provider) {
    case 'groq':
      return createGroqProvider({ apiKey, model });
    case 'openai':
      return createOpenAIProvider({ apiKey, model });
    case 'gemini':
      return createGeminiProvider({ apiKey, model });
    default:
      throw new Error(
        `Unknown LLM provider: "${provider}". Valid options: groq, openai, gemini.`
      );
  }
}

module.exports = { createLLMProvider };
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx jest tests/llm/providers.test.js --no-coverage
```

Expected: All tests PASS

- [ ] **Step 8: Run full test suite to confirm nothing broke**

```bash
npx jest --no-coverage
```

Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/llm/ tests/llm/
git commit -m "feat: add pluggable LLM provider abstraction (Groq, OpenAI, Gemini)"
```

---

## Chunk 2: Bot, Commands & Docker

### Task 6: Simple commands — `/dia`, `/status`, `/exercicio`, `/peso`

**Files:**
- Create: `src/commands/dia.js`
- Create: `src/commands/status.js`
- Create: `src/commands/exercicio.js`
- Create: `src/commands/peso.js`

Each command is a factory function that receives `q` (queries object) and returns an async grammy handler.

- [ ] **Step 1: Implement `src/commands/dia.js`**

```js
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
```

- [ ] **Step 2: Implement `src/commands/status.js`**

```js
'use strict';

function createStatusCommand(q) {
  return async (ctx) => {
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

module.exports = { createStatusCommand };
```

- [ ] **Step 3: Implement `src/commands/exercicio.js`**

```js
'use strict';

const EXERCISE_KCAL = 250;

function createExercicioCommand(q) {
  return async (ctx) => {
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

module.exports = { createExercicioCommand };
```

- [ ] **Step 4: Implement `src/commands/peso.js`**

```js
'use strict';

function createPesoCommand(q) {
  return async (ctx) => {
    const text  = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2) {
      await ctx.reply(
        '⚖️ Use: <code>/peso 94.5</code> — informe o peso em kg.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const value = parseFloat(parts[1].replace(',', '.'));
    if (isNaN(value) || value < 20 || value > 400) {
      await ctx.reply('❌ Valor inválido. Use um número em kg, ex: <code>/peso 94.5</code>', {
        parse_mode: 'HTML',
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const prev  = q.getProfile().weight;

    q.updateProfile({ weight: value });
    q.insertWeightRecord(value, today);

    const diffLine =
      prev != null
        ? `\nAnterior: ${prev}kg → Agora: ${value}kg (${value > prev ? '+' : ''}${(value - prev).toFixed(1)}kg)`
        : '';

    await ctx.reply(
      `⚖️ <b>Peso atualizado:</b> ${value}kg${diffLine}`,
      { parse_mode: 'HTML' }
    );
  };
}

module.exports = { createPesoCommand };
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/dia.js src/commands/status.js src/commands/exercicio.js src/commands/peso.js
git commit -m "feat: add /dia, /status, /exercicio and /peso commands"
```

---

### Task 7: Meal message handler

**Files:**
- Create: `src/handlers/meal.js`

- [ ] **Step 1: Implement `src/handlers/meal.js`**

```js
'use strict';
const { buildSystemPrompt, buildUserContext } = require('../utils/prompt');
const { formatMealResponse } = require('../utils/format');

function createMealHandler(q, llm) {
  return async (ctx) => {
    const userMessage = ctx.message.text.trim();
    const today       = new Date().toISOString().slice(0, 10);
    const now         = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const dietPlan  = q.getDietPlan();
    if (!dietPlan) {
      await ctx.reply(
        '⚠️ Dieta não configurada. Use /dieta para cadastrar sua dieta padrão.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const totals    = q.getDailyTotals(today);
    const profile   = q.getProfile();
    const extraKcal = q.getExtraKcalForDate(today);

    const systemPrompt = buildSystemPrompt(dietPlan);
    const userContext  = buildUserContext(totals, extraKcal, profile);

    // Show typing indicator
    await ctx.replyWithChatAction('typing');

    let llmResult;
    try {
      llmResult = await llm.chat({ systemPrompt, userContext, userMessage });
    } catch (err) {
      console.error('[meal handler] LLM error:', err.message);
      await ctx.reply(
        '❌ Erro ao consultar o assistente. Tente novamente em instantes.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Validate required fields
    const required = ['kcal', 'prot', 'carbo', 'fat', 'dentro_da_dieta', 'avaliacao', 'recomendacao'];
    const missing  = required.filter(f => llmResult[f] === undefined);
    if (missing.length > 0) {
      console.error('[meal handler] LLM returned incomplete JSON, missing:', missing);
      await ctx.reply(
        '❌ Resposta do assistente incompleta. Tente reformular a refeição.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Save meal to DB
    q.insertMeal(today, now, userMessage, llmResult.kcal, llmResult.prot, llmResult.carbo, llmResult.fat);

    // Compute remaining after this meal
    const newTotals = q.getDailyTotals(today);
    const effectiveKcal = profile.target_kcal + extraKcal;
    const remaining = {
      kcal:  Math.max(0, effectiveKcal - newTotals.kcal),
      prot:  Math.max(0, profile.target_prot - newTotals.prot),
      carbo: Math.max(0, profile.target_carbo - newTotals.carbo),
      fat:   Math.max(0, profile.target_fat - newTotals.fat),
    };

    const mealMacros = { kcal: llmResult.kcal, prot: llmResult.prot, carbo: llmResult.carbo, fat: llmResult.fat };
    const reply = formatMealResponse(userMessage, mealMacros, llmResult, remaining);
    await ctx.reply(reply, { parse_mode: 'HTML' });
  };
}

module.exports = { createMealHandler };
```

- [ ] **Step 2: Commit**

```bash
git add src/handlers/meal.js
git commit -m "feat: add meal message handler with LLM integration"
```

---

### Task 8: `/hoje` command

**Files:**
- Create: `src/commands/hoje.js`

- [ ] **Step 1: Implement `src/commands/hoje.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/hoje.js
git commit -m "feat: add /hoje command with detailed daily summary"
```

---

### Task 9: `/semana` command

**Files:**
- Create: `src/commands/semana.js`

- [ ] **Step 1: Implement `src/commands/semana.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/semana.js
git commit -m "feat: add /semana command with 7-day ASCII summary"
```

---

### Task 10: `/dieta` command (multi-step conversation)

**Files:**
- Create: `src/commands/dieta.js`

This command uses grammy's conversation plugin to guide a multi-step edit flow.

- [ ] **Step 1: Implement `src/commands/dieta.js`**

```js
'use strict';

// Conversation function — registered in bot.js via createConversation()
async function dietaConversation(conversation, ctx, q) {
  await ctx.reply(
    [
      '⚙️ <b>Editar dieta</b>',
      '',
      'O que você quer atualizar?',
      '1️⃣ Metas numéricas (calorias, proteína, carbo, gordura)',
      '2️⃣ Texto completo da dieta (system prompt)',
      '',
      'Responda com <b>1</b> ou <b>2</b> (ou /cancelar para sair):',
    ].join('\n'),
    { parse_mode: 'HTML' }
  );

  const choice = await conversation.waitFor('message:text');
  const choiceText = choice.message.text.trim();

  if (choiceText === '/cancelar') {
    await ctx.reply('❌ Edição cancelada.');
    return;
  }

  if (choiceText === '1') {
    await editMetas(conversation, ctx, q);
  } else if (choiceText === '2') {
    await editDietaPlan(conversation, ctx, q);
  } else {
    await ctx.reply('❌ Opção inválida. Use /dieta para tentar novamente.');
  }
}

async function editMetas(conversation, ctx, q) {
  const profile = q.getProfile();

  const fields = [
    { key: 'target_kcal', label: 'Calorias', unit: 'kcal', current: profile.target_kcal },
    { key: 'target_prot', label: 'Proteína', unit: 'g', current: profile.target_prot },
    { key: 'target_carbo', label: 'Carboidrato', unit: 'g', current: profile.target_carbo },
    { key: 'target_fat', label: 'Gordura', unit: 'g', current: profile.target_fat },
  ];

  const updates = {};

  for (const field of fields) {
    await ctx.reply(
      `${field.label} atual: <b>${field.current}${field.unit}</b>\nNovo valor (ou <i>pular</i> para manter):`,
      { parse_mode: 'HTML' }
    );

    const resp = await conversation.waitFor('message:text');
    const text = resp.message.text.trim().toLowerCase();

    if (text === 'pular' || text === '/pular') continue;

    const val = parseFloat(text.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      await ctx.reply(`⚠️ Valor ignorado (inválido). Mantendo ${field.current}${field.unit}.`);
      continue;
    }
    updates[field.key] = val;
  }

  if (Object.keys(updates).length === 0) {
    await ctx.reply('ℹ️ Nenhuma meta alterada.');
    return;
  }

  q.updateProfile(updates);

  const lines = Object.entries(updates).map(([k, v]) => {
    const f = fields.find(f => f.key === k);
    return `• ${f.label}: ${v}${f.unit}`;
  });

  await ctx.reply(
    `✅ <b>Metas atualizadas:</b>\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
}

async function editDietaPlan(conversation, ctx, q) {
  await ctx.reply(
    [
      '📋 Cole abaixo o novo texto completo da sua dieta.',
      'Este texto será usado como contexto para todas as análises do bot.',
      '',
      '<i>Envie o texto em uma única mensagem:</i>',
    ].join('\n'),
    { parse_mode: 'HTML' }
  );

  const resp = await conversation.waitFor('message:text');
  const newPlan = resp.message.text.trim();

  if (newPlan.length < 50) {
    await ctx.reply('❌ Texto muito curto (mínimo 50 caracteres). Operação cancelada.');
    return;
  }

  q.setDietPlan(newPlan);

  await ctx.reply(
    `✅ <b>Dieta atualizada!</b> (${newPlan.length} caracteres)\n\nO novo texto será usado a partir da próxima refeição.`,
    { parse_mode: 'HTML' }
  );
}

// Factory to create the conversation with access to q (injected via closure in bot.js)
function createDietaConversation(q) {
  return (conversation, ctx) => dietaConversation(conversation, ctx, q);
}

function createDietaCommand() {
  return async (ctx) => {
    await ctx.conversation.enter('dieta');
  };
}

module.exports = { createDietaConversation, createDietaCommand };
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/dieta.js
git commit -m "feat: add /dieta command with multi-step conversation flow"
```

---

### Task 11: Bot entry point

**Files:**
- Create: `src/bot.js`

- [ ] **Step 1: Implement `src/bot.js`**

```js
'use strict';
require('dotenv').config();

const path = require('path');
const { Bot, session }         = require('grammy');
const { conversations, createConversation } = require('@grammyjs/conversations');

const { openDatabase }        = require('./db/index');
const { createQueries }       = require('./db/queries');
const { createLLMProvider }   = require('./llm/index');

const { createDiaCommand }       = require('./commands/dia');
const { createStatusCommand }    = require('./commands/status');
const { createExercicioCommand } = require('./commands/exercicio');
const { createPesoCommand }      = require('./commands/peso');
const { createHojeCommand }      = require('./commands/hoje');
const { createSemanaCommand }    = require('./commands/semana');
const { createDietaConversation, createDietaCommand } = require('./commands/dieta');
const { createMealHandler }      = require('./handlers/meal');

// --- Validate required env vars ---
const { TELEGRAM_TOKEN, ALLOWED_TELEGRAM_USER_ID, LLM_PROVIDER } = process.env;

if (!TELEGRAM_TOKEN)          throw new Error('Missing TELEGRAM_TOKEN in .env');
if (!ALLOWED_TELEGRAM_USER_ID) throw new Error('Missing ALLOWED_TELEGRAM_USER_ID in .env');
if (!LLM_PROVIDER)             throw new Error('Missing LLM_PROVIDER in .env');

const ALLOWED_ID = parseInt(ALLOWED_TELEGRAM_USER_ID, 10);

// --- Database ---
const DB_PATH      = path.join(__dirname, '..', 'data', 'nutricionista.db');
const PROMPT_PATH  = path.join(__dirname, '..', 'prompt_atual.txt');
const db           = openDatabase(DB_PATH, PROMPT_PATH);
const q            = createQueries(db);

// --- LLM ---
const apiKeyMap = {
  groq:   process.env.GROQ_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
};
const apiKey = apiKeyMap[LLM_PROVIDER];
if (!apiKey) throw new Error(`Missing API key for LLM_PROVIDER="${LLM_PROVIDER}" in .env`);

const llm = createLLMProvider({ provider: LLM_PROVIDER, apiKey, model: process.env.LLM_MODEL });

// --- Bot ---
const bot = new Bot(TELEGRAM_TOKEN);

// Security middleware: reject all messages from other users
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== ALLOWED_ID) {
    await ctx.reply('Acesso não autorizado.');
    return;
  }
  await next();
});

// Session + conversations middleware (required for /dieta)
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());
bot.use(createConversation(createDietaConversation(q), 'dieta'));

// --- Commands ---
bot.command('dia',      createDiaCommand(q));
bot.command('status',   createStatusCommand(q));
bot.command('exercicio', createExercicioCommand(q));
bot.command('peso',     createPesoCommand(q));
bot.command('hoje',     createHojeCommand(q));
bot.command('semana',   createSemanaCommand(q));
bot.command('dieta',    createDietaCommand());

bot.command('start', async (ctx) => {
  await ctx.reply(
    [
      '👋 <b>Bot Nutricionista ativo!</b>',
      '',
      'Envie qualquer refeição em texto livre para registrar.',
      '',
      '<b>Comandos disponíveis:</b>',
      '/hoje — resumo detalhado do dia',
      '/status — saldo rápido',
      '/semana — resumo dos últimos 7 dias',
      '/exercicio — registrar treino (+250 kcal na meta)',
      '/peso 94.5 — atualizar peso',
      '/dieta — editar metas ou dieta padrão',
      '/dia — zerar registros do dia',
    ].join('\n'),
    { parse_mode: 'HTML' }
  );
});

// --- Meal handler (free text) ---
bot.on('message:text', createMealHandler(q, llm));

// --- Error handler ---
bot.catch((err) => {
  console.error('[bot] Unhandled error:', err);
});

// --- Start ---
bot.start();
console.log(`[bot] Running with LLM provider: ${LLM_PROVIDER}`);
```

- [ ] **Step 2: Commit**

```bash
git add src/bot.js
git commit -m "feat: add bot entry point with all commands registered"
```

---

### Task 12: Docker setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install build deps for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# data/ directory is mounted as volume — create it so it exists in image
RUN mkdir -p /app/data

CMD ["node", "src/bot.js"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
```

- [ ] **Step 3: Add `.dockerignore`**

```
node_modules/
data/
.env
.git/
tests/
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: add Docker setup for local and VPS deployment"
```

---

### Task 13: Smoke test — first run

- [ ] **Step 1: Copy `.env.example` to `.env` and fill in values**

```bash
cp .env.example .env
# Edit .env: add TELEGRAM_TOKEN, ALLOWED_TELEGRAM_USER_ID, LLM_PROVIDER and the corresponding API key
```

- [ ] **Step 2: Run full test suite one last time**

```bash
npx jest --no-coverage
```

Expected: All tests PASS

- [ ] **Step 3: Start the bot locally**

```bash
node src/bot.js
```

Expected output:
```
[db] diet_plan seeded from prompt_atual.txt
[bot] Running with LLM provider: groq
```

- [ ] **Step 4: Test in Telegram — send `/start`**

Expected: Bot replies with the welcome message listing all commands.

- [ ] **Step 5: Test meal registration**

Send: `comi 150g de peito de frango com batata cozida`

Expected: Bot replies with formatted table, macro breakdown, and remaining balance for the day.

- [ ] **Step 6: Test `/hoje`**

Send: `/hoje`

Expected: Bot replies with detailed daily summary including ASCII progress bars.

- [ ] **Step 7: Test `/semana`**

Send: `/semana`

Expected: Bot replies with 7-day summary (most days will show no data on first run — that's correct).

- [ ] **Step 8: Test `/peso 94.5`**

Send: `/peso 94.5`

Expected: Bot confirms weight update.

- [ ] **Step 9: Test `/dieta`**

Send: `/dieta` → Choose option 1 → Update one value → Confirm it saved.

- [ ] **Step 10: Final commit**

```bash
git add .
git commit -m "chore: ready for first run — all features implemented and tested"
```

---

## Summary

| Chunk | Tasks | Tests | Key files |
|---|---|---|---|
| 1 | 1–5 | 30+ unit tests | `src/db/`, `src/utils/`, `src/llm/` |
| 2 | 6–13 | Manual smoke tests | `src/commands/`, `src/handlers/`, `src/bot.js`, Docker |

To deploy on VPS:
```bash
# On the VPS, after cloning the repo and creating .env:
docker compose up -d
docker compose logs -f
```
