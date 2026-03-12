import type { DailyTotals, Profile } from '../types';

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

export function buildSystemPrompt(dietPlanContent: string): string {
  return `${dietPlanContent}\n\n---\n${JSON_INSTRUCTION}`;
}

export function buildUserContext(
  totals: DailyTotals,
  extraKcal: number,
  profile: Pick<Profile, 'target_kcal' | 'target_prot' | 'target_carbo' | 'target_fat'>,
): string {
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
