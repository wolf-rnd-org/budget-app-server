import { z } from "zod";
import { base } from "../utils/airtableConfig.js";
import type { BudgetsFields, ExpensesFields } from "./types.js"; // או מהנתיב ששמת

export const SummarySchema = z.object({
  program_id: z.string(),
  total_budget: z.number(),
  total_expenses: z.number(),
  remaining_balance: z.number(),
});
export type BudgetSummary = z.infer<typeof SummarySchema>;


function toSummary(programId: string, fields: BudgetsFields): BudgetSummary {
  const total_budget = Number(fields.total_budget ?? 0);
  const total_expenses = Number(fields.total_expenses ?? 0);
  const remaining_balance =
    typeof fields.remaining_balance === "number"
      ? Number(fields.remaining_balance)
      : total_budget - total_expenses;

  return SummarySchema.parse({
    program_id: String(fields.program_id ?? programId),
    total_budget,
    total_expenses,
    remaining_balance,
  });
}
 
export async function getBudgetSummary(programId: string): Promise<BudgetSummary | null> {
  const budgetRecords = await base<BudgetsFields>("budgets")
    .select({
      maxRecords: 1,
    })
    .all();

  if (budgetRecords.length > 0) {
    const fields = budgetRecords[0].fields;
    return toSummary(programId, fields);
  }

  const expenseRecords = await base<ExpensesFields>("expenses")
    .select({
      filterByFormula: `FIND('${programId}', {project}&'') > 0`,
      pageSize: 100, 
    })
    .all();

  const total_expenses = expenseRecords.reduce((sum, rec) => {
    const amt = Number(rec.fields.amount ?? 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);

  if (total_expenses === 0) {
    return null;
  }

  return SummarySchema.parse({
    program_id: programId,
    total_budget: 0,
    total_expenses,
    remaining_balance: 0 - total_expenses,
  });
}