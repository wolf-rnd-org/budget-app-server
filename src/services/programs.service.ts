import { z } from "zod";
import { base } from "../utils/airtableConfig.js";

export const SummarySchema = z.object({
  program_id: z.string(),
  total_budget: z.number(),
  total_expenses: z.number(),
  remaining_balance: z.number(),
  extra_budget: z.number().optional(),
  income: z.number().optional(),
  income_details: z.string().optional(),
});

export type BudgetSummary = z.infer<typeof SummarySchema>;

export async function getProgramSummary(programId: string): Promise<z.infer<typeof SummarySchema> | null> {
  const esc = programId.replace(/\"/g, '\\"');

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

// Basic Program shape used throughout
const ProgramSchema = z.object({
  id: z.string(),
  name: z.string(),
  user_ids: z.array(z.string()).optional(),
});
export type Program = z.infer<typeof ProgramSchema>;

async function loadAll(): Promise<Program[]> {
  const records = await base("programs").select({ pageSize: 100 }).all();
  return records.map((rec) => {
    const name = String(rec.get("name") ?? "");
    const textId = rec.get("program_id");
    const id = String((textId ?? rec.id) as any);
    return ProgramSchema.parse({ id, name });
  });
}

export async function listAll(): Promise<Program[]> {
  const recs = await base("programs")
    .select({ fields: ["program_id", "name"], pageSize: 100 })
    .all();

  return recs.map((r) => {
    const id = String(r.get("program_id") ?? r.id);
    const name = String(r.get("name") ?? "");
    return ProgramSchema.parse({ id, name });
  });
}

// Include user_ids array and keep program_id + recordId for convenience
export async function listAllWithUsers(): Promise<Array<Program & { program_id: string; recordId: string }>> {
  const recs = await base("programs")
    .select({ fields: ["program_id", "name", "user_ids"], pageSize: 100 })
    .all();

  return recs.map((r) => {
    const rawUsers = r.get("user_ids") as any;
    const users: string[] = Array.isArray(rawUsers)
      ? rawUsers.map((x: any) => String(x))
      : rawUsers != null
      ? [String(rawUsers)]
      : [];

    const baseObj = ProgramSchema.parse({
      id: String(r.get("program_id") ?? r.id),
      name: String(r.get("name") ?? ""),
      user_ids: users,
    });
    return { ...(baseObj as any), program_id: String(r.get("program_id") ?? ""), recordId: r.id } as Program & {
      program_id: string;
      recordId: string;
    };
  });
}

export async function getById(id: string): Promise<Program | null> {
  const all = await listAll();
  return all.find((p) => p.id === id) ?? null;
}

export async function listByUserId(_userId: string | number): Promise<Program[]> {
  const userId = String(_userId);
  const records = await base("programs")
    .select({
      filterByFormula: `OR({user_ids} = "${userId}", FIND("${userId}", ARRAYJOIN({user_ids})))`,
      pageSize: 100,
    })
    .all();

  return records.map((rec) => {
    const name = String(rec.get("name") ?? "");
    const textId = rec.get("program_id");
    const id = String((textId ?? rec.id) as any);
    return ProgramSchema.parse({ id, name });
  });
}

// Resolve program textual id or record id to record id
async function resolveProgramRecordId(programId: string): Promise<string | null> {
  const pid = String(programId || "").trim();
  if (!pid) return null;
  if (/^rec[0-9A-Za-z]{14}$/i.test(pid)) return pid;

  const esc = pid.replace(/\"/g, '\\"');
  try {
    const [byText] = await base("programs")
      .select({ filterByFormula: `{program_id} = "${esc}"`, maxRecords: 1, pageSize: 1 })
      .all();
    if (byText) return byText.id;
  } catch {}

  const records = await base("programs").select({ pageSize: 100 }).all();
  for (const rec of records) {
    const maybe = (rec.fields as any)?.program_id;
    if (maybe && String(maybe) === pid) return rec.id;
  }
  for (const rec of records) {
    const fields = rec.fields as Record<string, any>;
    for (const key of Object.keys(fields)) {
      const val = fields[key];
      if (val != null && String(val) === pid) return rec.id;
    }
  }
  return null;
}

// Update a program's user_ids to include given userId
export async function assignUserToProgram(args: { program_id: string; userId: string | number }) {
  const userId = String(args.userId);
  const recId = await resolveProgramRecordId(args.program_id);
  if (!recId) throw new Error("Invalid program_id");

  const rec = await base("programs").find(recId);
  const existing = rec.get("user_ids") as any;
  const current: string[] = Array.isArray(existing)
    ? existing.map((x: any) => String(x))
    : existing != null
    ? [String(existing)]
    : [];

  const next = current.includes(userId) ? current : [...current, userId];
  const updated = await base("programs").update(recId, { user_ids: next }, { typecast: true });

  return {
    recordId: updated.id,
    program_id: String(updated.get("program_id") ?? args.program_id),
    user_ids: next,
  };
}

export async function assignUserToPrograms(args: { program_ids: string[]; userId: string | number }) {
  const userId = String(args.userId);
  const results: { recordId: string; program_id: string; user_ids: string[] }[] = [];
  const errors: { program_id: string; error: string }[] = [];

  for (const pid of args.program_ids) {
    try {
      const recId = await resolveProgramRecordId(pid);
      if (!recId) {
        errors.push({ program_id: pid, error: "Invalid program_id" });
        continue;
      }

      const rec = await base("programs").find(recId);
      const existing = rec.get("user_ids") as any;
      const current: string[] = Array.isArray(existing)
        ? existing.map((x: any) => String(x))
        : existing != null
        ? [String(existing)]
        : [];

      const next = current.includes(userId) ? current : [...current, userId];
      const updated = await base("programs").update(recId, { user_ids: next }, { typecast: true });
      results.push({
        recordId: updated.id,
        program_id: String(updated.get("program_id") ?? pid),
        user_ids: next,
      });
    } catch (e: any) {
      errors.push({ program_id: pid, error: e?.message || "Update failed" });
    }
  }

  return { updated: results, errors };
}

