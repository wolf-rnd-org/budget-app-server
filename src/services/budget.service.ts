import { readJson } from "../utils/fileDB.js";
import { ProgramSchema } from "../models/program.js";
import type { Program } from "../models/program.js";
import { ExpenseSchema } from "../models/expense.js";
import type { Expense } from "../models/expense.js";

export type BudgetSummary = {
  program_id: string;
  total_budget: number;
  total_expenses: number;
  remaining_balance: number;
};

async function loadPrograms(): Promise<Program[]> {
  const items = await readJson<unknown>("programs.json");
  // ולידציה רכה למערך
  if (!Array.isArray(items)) throw new Error("programs.json must be an array");
  return items.map((it) => ProgramSchema.parse(it));
}

async function loadExpenses(): Promise<Expense[]> {
  const items = await readJson<unknown>("expenses.json");
  if (!Array.isArray(items)) throw new Error("expenses.json must be an array");
  return items.map((it) => ExpenseSchema.parse(it));
}

/**
 * חישוב תקציר לפי מזהה תוכנית.
 * תומך גם במקרה שבו expense.project מכיל את ה-id (includes) — כדי להתיישר עם ה-mock של הקליינט.
 */
export async function getBudgetSummary(programId: string | number): Promise<BudgetSummary> {
  const pid = String(programId);
  const programs = await loadPrograms();
  const program = programs.find((p) => String(p.id) === pid);
  if (!program) {
    const err = new Error("Program not found");
    (err as any).status = 404;
    throw err;
  }

  const totalBudget = (program.budget ?? 0) + (program.extra_budget ?? 0);

  const expenses = await loadExpenses();
  const related = expenses.filter((e) => {
    const proj = String(e.project ?? "");
    return proj === pid || proj.includes(pid);
  });

  const totalExpenses = related.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const remaining = totalBudget - totalExpenses;

  return {
    program_id: pid,
    total_budget: Number(totalBudget.toFixed(2)),
    total_expenses: Number(totalExpenses.toFixed(2)),
    remaining_balance: Number(remaining.toFixed(2)),
  };
}
