import { z } from "zod";
import { base } from "../utils/airtableConfig.js";

export const SummarySchema = z.object({
  program_id: z.string(),
  total_budget: z.number(),
  total_expenses: z.number(),
  remaining_balance: z.number(),
  // Additional fields for client display
  extra_budget: z.number().optional(),
  income: z.number().optional(),
  income_details: z.string().optional(),
});

export type BudgetSummary = z.infer<typeof SummarySchema>;



export async function getBudgetSummary(programId: string): Promise<
  z.infer<typeof SummarySchema> | null
> {
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
  const incomeDetails = (program.get("income_details") as any) ?? undefined;


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
    extra_budget: extra,
    income,
    income_details: typeof incomeDetails === "string" && incomeDetails.trim().length > 0 ? incomeDetails : undefined,
  };
}

const num = (v: any) => (typeof v === "number" ? v : Number((v ?? "").toString().replace(/,/g, "")) || 0);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;