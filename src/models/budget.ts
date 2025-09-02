import z from "zod";

const BudgetSummarySchema = z.object({
  program_id: z.string(),
  total_budget: z.number(),
  total_expenses: z.number(),
  remaining_balance: z.number(),
});
export type BudgetSummary = z.infer<typeof BudgetSummarySchema>;
