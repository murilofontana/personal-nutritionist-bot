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
