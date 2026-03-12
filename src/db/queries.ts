import Database from 'better-sqlite3';
import type {
  Queries,
  Meal,
  DailyTotals,
  WeeklyDataRow,
  Profile,
  ProfileUpdateFields,
  WeightRecord,
} from '../types';

export function createQueries(db: Database.Database): Queries {
  return {
    // --- Meals ---
    insertMeal(date, time, description, kcal, prot, carbo, fat) {
      db.prepare(
        'INSERT INTO meals (date, time, description, kcal, prot, carbo, fat) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(date, time, description, kcal, prot, carbo, fat);
    },

    getMealsForDate(date) {
      return db
        .prepare('SELECT * FROM meals WHERE date = ? ORDER BY time ASC')
        .all(date) as Meal[];
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
        .get(date) as DailyTotals;
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
        .all(startDate, endDate) as WeeklyDataRow[];
    },

    // --- Profile ---
    getProfile() {
      return db.prepare('SELECT * FROM profile WHERE id = 1').get() as Profile;
    },

    updateProfile(fields: ProfileUpdateFields) {
      const allowed: (keyof ProfileUpdateFields)[] = [
        'weight', 'target_kcal', 'target_prot', 'target_carbo', 'target_fat',
      ];
      const keys = (Object.keys(fields) as (keyof ProfileUpdateFields)[]).filter(k =>
        allowed.includes(k)
      );
      if (keys.length === 0) return;
      const sets = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => fields[k]);
      db.prepare(
        `UPDATE profile SET ${sets}, updated_at = datetime('now') WHERE id = 1`
      ).run(...values);
    },

    // --- Diet plan ---
    getDietPlan() {
      const row = db.prepare('SELECT content FROM diet_plan WHERE id = 1').get() as
        | { content: string }
        | undefined;
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
        .get(date) as { total: number };
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
        .all(startDate, endDate) as WeightRecord[];
    },
  };
}
