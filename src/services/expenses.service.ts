import { readJson } from "../utils/fileDB.js"; // או fileDB.js בהתאם לשם
import { base } from "../utils/airtableConfig.js";

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


type AirtableRow = Record<string, any>;



export async function getExpenses(
  programId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ data: AirtableRow[]; hasMore: boolean; totalCount: number }> {
  const esc = programId.replace(/"/g, '\\"');

  // מאתרים את רשומת ה-Program לפי program_id (טקסט בטבלת "programs")
  const [program] = await base("programs")
    .select({ filterByFormula: `{program_id} = "${esc}"`, maxRecords: 1, pageSize: 1 })
    .all();

  // אם לא נמצאה תכנית – מחזירים מבנה ריק
  if (!program) return { data: [], hasMore: false, totalCount: 0 };

  // פילטר שמכסה גם Linked Record וגם טקסט רגיל ב-Expenses
  const filter = `OR(FIND("${program.id}", ARRAYJOIN({program_id})), {program_id} = "${esc}")`;

  const fieldsToReturn = [
    "expense_id",
    "budget_id",
    "program_id",
    "date",
    "categories",
    "amount",
    "invoice_description",
    "supplier_name",
    "invoice_file",
    "business_number",
    "invoice_type",
    "bank_details_file",
    "supplier_email",
    "status",
    "user_id",
  ];

  const start = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, pageSize));
  const endExclusive = start + Math.max(1, pageSize);

  const data: AirtableRow[] = [];
  let totalCount = 0;

  // נריץ את כל העמודים כדי לקבל totalCount מדויק, ונאסוף רק את הטווח של הדף המבוקש
  await base("expenses")
    .select({
      filterByFormula: filter,
      // fields: fieldsToReturn,
      pageSize: 100, // גודל עמוד פנימי מול Airtable; לא קשור ל-pageSize של הלקוח
    })
    .eachPage((records, fetchNextPage) => {
      for (const rec of records) {
        const globalIndex = totalCount; // לפני ההגדלה
        if (globalIndex >= start && globalIndex < endExclusive) {
          data.push({ id: rec.id, ...rec.fields });
        }
        totalCount++;
      }
      fetchNextPage();
    });

  const hasMore = totalCount > endExclusive;

  return { data, hasMore, totalCount };
}

// Add the missing createExpense function
type CreateExpenseInput = {
  user_id: string;
  program_id: string;
  program_rec_id: string;
  date: string;
  amount: number;
  supplier_name: string;
  business_number: string;
  invoice_type: string;
  invoice_description: string;
  supplier_email: string;
  status: "new" | "sent_for_payment" | "paid" | "receipt_uploaded" | "closed";
  categories: string[];
  bank_name?: string;
  bank_branch?: string;
  bank_account?: string;
  beneficiary?: string;
  bank_details_file?: any;
  invoice_file?: any;
  project?: string;
};

function toAttachmentArray(v: any): Array<{ url: string; filename?: string }> {
  if (!v) return [];
  if (typeof v === "string") return v ? [{ url: v }] : [];
  if (Array.isArray(v)) return v.map(x => (typeof x === "string" ? { url: x } : x)).filter(a => a?.url);
  if (typeof v === "object" && v.url) return [v];
  return [];
}
const ALLOWED_STATUS = new Set([
  "new",
  "sent_for_payment",
  "paid",
  "receipt_uploaded",
  "closed",
]);
function normalizeStatus(s?: string) {
  const v = String(s || "").trim().toLowerCase();
  return ALLOWED_STATUS.has(v) ? v : "new";
}

export async function createExpense(input: CreateExpenseInput) {
  const fields: Record<string, any> = {
    program_id: [input.program_rec_id],
    date: input.date,
    amount: input.amount,
    supplier_name: input.supplier_name,
    business_number: input.business_number,
    invoice_type: input.invoice_type,
    invoice_description: input.invoice_description,
    supplier_email: input.supplier_email,
    status: normalizeStatus(input.status), // ← ישלח תמיד ערך חוקי (ברירת מחדל: new)
    user_id: String(input.user_id ?? ""),
    categories: input.categories?.length ? input.categories : undefined,
    bank_name: input.bank_name,
    bank_branch: input.bank_branch,
    bank_account: input.bank_account,
    beneficiary: input.beneficiary,
    project: input.project,
  };
  // המרה של שמות קטגוריות ל־recIds (אם השדה הוא Link לטבלת categories)
  const { resolveCategoryLinksByNames } = await import("./categories.service.js");
  if (Array.isArray(input.categories) && input.categories.length) {
    const categoryLinks = await resolveCategoryLinksByNames(input.program_rec_id, input.categories);
    if (categoryLinks.length) {
      fields.categories = categoryLinks;
    } else {
      delete fields.categories; // אל תשלחי אם אין התאמה
    }
  }

  
  const bankAtt = toAttachmentArray(input.bank_details_file);
  if (bankAtt.length) fields.bank_details_file = bankAtt;

  const invAtt = toAttachmentArray(input.invoice_file);
  if (invAtt.length) fields.invoice_file = invAtt;

  // Clean undefined/empty values
  for (const k of Object.keys(fields)) {
    const v = fields[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === "") {
      delete fields[k];
    }
  }

  const rec = await base("expenses").create(fields);
  return { id: rec.id, fields: rec.fields };
}