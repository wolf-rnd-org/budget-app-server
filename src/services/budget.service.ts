import { readJson } from "../utils/fileDB.js";
import { z } from "zod";

const SummarySchema = z.object({
  program_id: z.string(),
  total_budget: z.number(),
  total_expenses: z.number(),
  remaining_balance: z.number(),
});
export type BudgetSummary = z.infer<typeof SummarySchema>;

/** מחזיר סיכום תקציב לפי program_id.
 * קורא מ-summary.json; אם לא קיים, (אופציונלי) מחשב מ-expenses.json כ-fallback. */
export async function getBudgetSummary(programId: string): Promise<BudgetSummary | null> {
  const summariesRaw = await readJson<unknown>("summary.json");
  if (!Array.isArray(summariesRaw)) {
    const err = new Error("summary.json must be an array");
    (err as any).status = 500;
    throw err;
  }
  const summaries = summariesRaw.map((x) => SummarySchema.parse(x));
  const found = summaries.find((s) => s.program_id === programId);
  if (found) return found;

  // Fallback אופציונלי: חישוב מסכום ההוצאות אם אין רשומה מוכנה
  // אם לא רוצים fallback – אפשר פשוט להחזיר null כאן.
  const expenses = await readJson<any[]>("expenses.json");
  const total_expenses = (expenses || [])
    .filter(e => typeof e.project === "string" && e.project.includes(programId))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return {
    program_id: programId,
    total_budget: 0,
    total_expenses,
    remaining_balance: 0 - total_expenses,
  };
}