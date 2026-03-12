import type { Context, SessionFlavor } from 'grammy';
import type { Conversation, ConversationFlavor } from '@grammyjs/conversations';

// ---------- Domínio ----------

export interface LLMResult {
  kcal: number;
  prot: number;
  carbo: number;
  fat: number;
  dentro_da_dieta: 'sim' | 'sim_com_ressalva' | 'nao';
  avaliacao: string;
  recomendacao: string;
}

export interface PossoResponse {
  pode_comer: 'sim' | 'sim_com_ressalva' | 'nao';
  porcao_sugerida: string;    // e.g. "30g (~120 kcal)"
  por_que: string;            // reason for the verdict (hint: max ~150 chars)
  impacto_nos_macros: string; // e.g. "consumiria ~20g carbo dos 15g restantes"
}

export interface LLMProvider {
  chat(params: {
    systemPrompt: string;
    userContext: string;
    userMessage: string;
  }): Promise<LLMResult>;
}

export interface Meal {
  id: number;
  date: string;
  time: string;
  description: string;
  kcal: number;
  prot: number;
  carbo: number;
  fat: number;
  created_at: string;
}

export interface Profile {
  id: number;
  weight: number | null;
  target_kcal: number;
  target_prot: number;
  target_carbo: number;
  target_fat: number;
  updated_at: string;
}

export interface DailyTotals {
  kcal: number;
  prot: number;
  carbo: number;
  fat: number;
}

export interface WeeklyDataRow {
  date: string;
  kcal: number;
  prot: number;
  carbo: number;
  fat: number;
}

export interface WeightRecord {
  weight: number;
  date: string;
}

export interface Remaining {
  kcal: number;
  prot: number;
  carbo: number;
  fat: number;
}

export type ProfileUpdateFields = Partial<{
  weight: number;
  target_kcal: number;
  target_prot: number;
  target_carbo: number;
  target_fat: number;
}>;

export interface Queries {
  insertMeal(date: string, time: string, description: string, kcal: number, prot: number, carbo: number, fat: number): void;
  getMealsForDate(date: string): Meal[];
  deleteMealsForDate(date: string): void;
  getDailyTotals(date: string): DailyTotals;
  getWeeklyData(startDate: string, endDate: string): WeeklyDataRow[];
  getProfile(): Profile;
  updateProfile(fields: ProfileUpdateFields): void;
  getDietPlan(): string | null;
  setDietPlan(content: string): void;
  insertAdjustment(date: string, extra_kcal: number): void;
  getExtraKcalForDate(date: string): number;
  deleteAdjustmentsForDate(date: string): void;
  insertWeightRecord(weight: number, date: string): void;
  getWeightHistory(startDate: string, endDate: string): WeightRecord[];
}

// ---------- Grammy / Bot ----------

export type SessionData = Record<string, never>;
export type BotContext = Context & ConversationFlavor<Context> & SessionFlavor<SessionData>;
export type BotConversation = Conversation<BotContext, BotContext>;
