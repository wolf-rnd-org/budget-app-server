// import { readJson } from "../utils/fileDB.js";
import { z } from "zod";
import { base } from "../utils/airtableConfig.js";

export const SummarySchema = z.object({
  program_id: z.string(),
  total_budget: z.number(),
  total_expenses: z.number(),
  remaining_balance: z.number(),
});

export type BudgetSummary = z.infer<typeof SummarySchema>;



export async function getProgramSummary(programId: string): Promise<{
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
  const totalBudget = round2(budget + extra);


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

const ProgramSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type Program = z.infer<typeof ProgramSchema>;

// async function loadAll(): Promise<Program[]> {
//   const raw = await readJson<unknown>("getprogrambyuserid.json");
//   if (!Array.isArray(raw)) throw new Error("getprogrambyuserid.json must be an array");
//   return raw.map((x) => ProgramSchema.parse(x));
// }

export async function listAll(): Promise<Program[]> {
  const recs = await base("programs")
    .select({ fields: ["program_id", "name"] })
    .all();

  return recs.map(r =>
    ProgramSchema.parse({
      id: String(r.get("program_id") ?? r.id), // מה שיופיע ב-value של ה-<option>
      name: String(r.get("name") ?? ""),
      program_id: String(r.get("program_id") ?? ""),
      recordId: r.id,
    })
  );
}


export async function getById(id: string): Promise<Program | null> {
  const all = await listAll();
  return all.find(p => p.id === id) ?? null;
}

// במוק: מחזיר את כולן בלי קשר ל-userId (כדי להתאים לקליינט)
export async function listByUserId(_userId: string | number): Promise<Program[]> {
  return listAll();
}
