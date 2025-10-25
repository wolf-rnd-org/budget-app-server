import { z } from "zod";
import { base } from "../utils/airtableConfig.js";

export const SummarySchema = z.object({
  program_id: z.string(),
  total_budget: z.number(),
  total_expenses: z.number(),
  remaining_balance: z.number(),
});

export type BudgetSummary = z.infer<typeof SummarySchema>;



export async function getBudgetSummary(programId: string): Promise<{
  program_id: string;
  total_budget: number;
  total_expenses: number;
  remaining_balance: number;
} | null> {
  const esc = programId.replace(/"/g, '\\"');

  // מצא את התכנית לפי program_id (טקסט בטבלת Programs)
  const [program] = await base("programs")
    .select({ filterByFormula: `{program_id} = "${esc}"`, maxRecords: 1, pageSize: 1 })
    .all();

  if (!program) return null;

  const budget = num(program.get("budget"));
  const extra = num(program.get("extra_budget"));
  // Support new Income field from Airtable
  const income = num((program.get("income") as any) ?? (program.get("Income") as any));
  const totalBudget = round2(budget + extra + income);


  const filter = `OR(FIND("${program.id}", ARRAYJOIN({program_id})), {program_id} = "${esc}")`;

  let totalExpenses = 0;
  await base("expenses")
    .select({ filterByFormula: filter, fields: ["amount"], pageSize: 100 })
    .eachPage((recs, next) => {
      for (const r of recs) totalExpenses += num(r.get("amount"));
      next();
    });

  totalExpenses = round2(totalExpenses);

  return {
    program_id: (program.get("program_id") as string) || programId,
    total_budget: totalBudget,
    total_expenses: totalExpenses,
    remaining_balance: round2(totalBudget - totalExpenses),
  };
}

const num = (v: any) => (typeof v === "number" ? v : Number((v ?? "").toString().replace(/,/g, "")) || 0);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;