import { readJson } from "../utils/fileDB.js"; // או fileDB.js בהתאם לשם
import { z } from "zod";

const ExpenseSchema = z.object({
  id: z.string(),
  budget: z.number(),
  project: z.string(),
  date: z.string(),
  categories: z.union([z.array(z.string()), z.string()]),
  amount: z.number(),
  invoice_description: z.string(),
  supplier_name: z.string().optional().default(""),
  invoice_file: z.string().optional().default(""),
  business_number: z.string().optional().default(""),
  invoice_type: z.string().optional().default(""),
  bank_details_file: z.string().optional().default(""),
  supplier_email: z.string().optional().default(""),
  status: z.string().optional().default(""),
  user_id: z.union([z.number(), z.string()]),
});
export type Expense = z.infer<typeof ExpenseSchema>;

async function loadAll(): Promise<Expense[]> {
  const raw = await readJson<unknown>("expenses.json"); // ⚠️ כאן ודאי שזה expenses.json
  if (!Array.isArray(raw)) throw new Error("expenses.json must be an array");
  return raw.map((x) => ExpenseSchema.parse(x));
}

export async function list(params: {
  userId: number;
  programId?: string;
  page?: number;
  pageSize?: number;
}) {
  const { userId, programId, page = 1, pageSize = 20 } = params;
  const all = await loadAll();

  // סינון לפי userId (מוק: רוב הרשומות 101, זה בסדר)
  const byUser = all.filter(e => String(e.user_id) === String(userId));

  // סינון לפי programId (במוק לפי substring בשם ה־project)
  const filtered = programId
    ? byUser.filter(e =>
        typeof e.project === "string" &&
        (e.project.includes(programId) || e.project.includes("24640") || e.project.includes("24864"))
      )
    : byUser;

  // אם חשוב לך לראות את "כל הספקים" במוק – בטלי פאג’ינציה:
  // const data = filtered; const hasMore = false;

  // אחרת: פאג’ינציה רגילה
  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);
  const totalCount = filtered.length;
  const hasMore = start + pageSize < totalCount;

  return { data, hasMore, totalCount };
}
