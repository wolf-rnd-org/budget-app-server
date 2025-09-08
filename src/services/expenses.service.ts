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

  // const fieldsToReturn = [
  //   "expense_id",
  //   "budget_id",
  //   "program_id",
  //   "date",
  //   "categories",
  //   "amount",
  //   "invoice_description",
  //   "supplier_name",
  //   "invoice_file",
  //   "business_number",
  //   "invoice_type",
  //   "bank_details_file",
  //   "supplier_email",
  //   "status",
  //   "user_id",
  // ];

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

// Fetch ALL expenses for a given program record/text id, no pagination.
async function fetchAllExpensesForProgram(programRecordId: string, programTextId?: any): Promise<AirtableRow[]> {
  // Normalize potential shapes (string | string[] | number | null)
  let textId: string | undefined = undefined;
  if (Array.isArray(programTextId)) {
    if (programTextId.length > 0 && programTextId[0] != null) textId = String(programTextId[0]);
  } else if (programTextId != null) {
    textId = String(programTextId);
  }

  const esc = textId ? textId.replace(/\"/g, '\\"') : "";
  const clauses = [`FIND("${programRecordId}", ARRAYJOIN({program_id}))`];
  if (textId) clauses.push(`{program_id} = "${esc}"`);
  let filter: string = clauses.join(", ");
  if (clauses.length > 1) filter = `OR(${filter})`;

  const data: AirtableRow[] = [];
  await base("expenses")
    .select({
      filterByFormula: filter,
      pageSize: 100,
    })
    .eachPage((records, fetchNextPage) => {
      for (const rec of records) data.push({ id: rec.id, ...rec.fields });
      fetchNextPage();
    });
  return data;
}

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

export async function listExpensesForUserPrograms(args: {
  userId: number;
  requestedPrograms?: string[];
  page?: number | undefined;
  pageSize?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
  priority?: "urgent" | "normal" | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
  sort_by?: "date" | "amount" | "status" | "created_at" | undefined;
  sort_dir?: "asc" | "desc" | undefined;
}) {
  const {
    userId,
    requestedPrograms = [],
    page = 1,
    pageSize = 20,
    q,
    status,
    priority,
    date_from,
    date_to,
    sort_by = "date",
    sort_dir = "desc",
  } = args;

  // 1) Load user's programs from Airtable
  const programs = await base("programs").select({
    filterByFormula: `{user_id} = "${String(userId)}"`,
    pageSize: 100,
  }).all();

  if (programs.length === 0) return { data: [], hasMore: false, totalCount: 0 };

  // 2) Optional narrowing by requested programs (intersection)
  const allowedByText = new Set<string>();
  const allowedByRecord = new Set<string>();
  for (const p of programs) {
    allowedByRecord.add(p.id);
    const textId = (p.fields as any)?.program_id as string | undefined;
    if (textId) allowedByText.add(textId);
  }
  let effectiveTargets: Array<{ recId: string; textId: string | undefined }>; 
  if (requestedPrograms.length > 0) {
    const req = new Set(requestedPrograms.map(String));
    effectiveTargets = programs
      .filter(p => req.has(String((p.fields as any)?.program_id)) || req.has(p.id))
      .map(p => ({ recId: p.id, textId: (p.fields as any)?.program_id as string | undefined }));
    if (effectiveTargets.length === 0) return { data: [], hasMore: false, totalCount: 0 };
  } else {
    effectiveTargets = programs.map(p => ({ recId: p.id, textId: (p.fields as any)?.program_id as string | undefined }));
  }

  // 3) Collect expenses from all effective programs
  const allRows: AirtableRow[] = [];
  for (const t of effectiveTargets) {
    const rows = await fetchAllExpensesForProgram(t.recId, t.textId);
    for (const r of rows) allRows.push(r);
  }

  // 4) Filters
  let filtered = allRows;
  if (status) filtered = filtered.filter((e: any) => String(e.status ?? "") === status);
  if (priority) filtered = filtered.filter((e: any) => (e.priority ?? null) === priority);
  if (date_from || date_to) {
    filtered = filtered.filter((e: any) => {
      const d = String(e.date ?? "");
      if (date_from && d < date_from) return false;
      if (date_to && d > date_to) return false;
      return true;
    });
  }
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((e: any) => {
      const hay = [
        String(e.invoice_description ?? ""),
        String(e.supplier_name ?? ""),
        String(e.project ?? ""),
        String((e as any).invoice_number ?? ""),
      ].join("\n").toLowerCase();
      return hay.includes(needle);
    });
  }

  // 5) Sorting
  const dir = sort_dir === "asc" ? 1 : -1;
  const by = sort_by;
  filtered.sort((a: any, b: any) => {
    let av: any;
    let bv: any;
    switch (by) {
      case "amount":
        av = Number(a.amount ?? 0);
        bv = Number(b.amount ?? 0);
        break;
      case "status":
        av = String(a.status ?? "");
        bv = String(b.status ?? "");
        break;
      case "created_at":
        av = String(a.created_at ?? a.date ?? "");
        bv = String(b.created_at ?? b.date ?? "");
        break;
      case "date":
      default:
        av = String(a.date ?? "");
        bv = String(b.date ?? "");
        break;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const totalCount = filtered.length;
  const start = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, pageSize));
  const rows = filtered.slice(start, start + Math.max(1, pageSize));
  const hasMore = start + rows.length < totalCount;

  // 6) Normalize to API shape
  const data = rows.map((e: any) => ({
    id: String(e.id),
    budget: Number(e.budget ?? 0),
    project: String(e.project ?? ""),
    date: String(e.date ?? ""),
    categories: Array.isArray(e.categories) ? e.categories : String(e.categories ?? ""),
    amount: Number(e.amount ?? 0),
    invoice_description: String(e.invoice_description ?? ""),
    supplier_name: String(e.supplier_name ?? ""),
    invoice_file: String(e.invoice_file ?? ""),
    business_number: String(e.business_number ?? ""),
    invoice_type: String(e.invoice_type ?? ""),
    bank_details_file: e.bank_details_file ? String(e.bank_details_file) : null,
    supplier_email: e.supplier_email ? String(e.supplier_email) : null,
    status: String(e.status ?? ""),
    user_id: typeof e.user_id === "number" ? e.user_id : String(e.user_id ?? ""),
    priority: (e.priority ?? null) as any,
    program_id: String((e as any).program_id ?? ""),
  }));

  return { data, hasMore, totalCount };
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
export async function queryExpenses(args: {
  auth: { userId: number; actions: string[]; programIds: string[] };
  params: {
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    status?: string | undefined;
    priority?: "urgent" | "normal" | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    sort_by?: "date" | "amount" | "status" | "created_at" | undefined;
    sort_dir?: "asc" | "desc" | undefined;
    requestedPrograms: string[];
  };
}) {
  const {
    auth,
    params: {
      page = 1,
      pageSize = 20,
      q,
      status,
      priority,
      date_from,
      date_to,
      sort_by = "date",
      sort_dir = "desc",
      requestedPrograms,
    },
  } = args;

  const all = await loadAll();

  // Derive program_id from project text (e.g., first numeric token)
  const withProgram = all.map((e) => {
    const proj = String(e.project ?? "");
    const match = proj.match(/\d{3,}/);
    return { ...e, program_id: match?.[0] as string | undefined } as Expense & { program_id?: string };
  });

  const hasExpensesView = auth.actions?.includes("expenses.view");
  const allowedPrograms = new Set(auth.programIds || []);

  let scoped: (Expense & { program_id?: string })[] = [];
  if (hasExpensesView) {
    const requested = Array.from(new Set(requestedPrograms.filter(Boolean)));
    let effective: string[];
    if (requested.length > 0) {
      effective = requested.filter((id) => allowedPrograms.has(id));
      if (effective.length === 0) {
        const err: any = new Error("Forbidden");
        err.code = "FORBIDDEN";
        throw err;
      }
    } else {
      effective = Array.from(allowedPrograms);
    }
    const effSet = new Set(effective);
    scoped = withProgram.filter((e) => e.program_id && effSet.has(e.program_id));
  } else {
    if (requestedPrograms.length > 0) {
      const err: any = new Error("Forbidden");
      err.code = "FORBIDDEN";
      throw err;
    }
    scoped = withProgram.filter((e) => String(e.user_id) === String(auth.userId));
  }

  // Filters
  let filtered = scoped;
  if (status) filtered = filtered.filter((e) => String(e.status) === status);
  if (priority) filtered = filtered.filter((e: any) => (e.priority ?? null) === priority);

  if (date_from || date_to) {
    filtered = filtered.filter((e) => {
      const d = String(e.date ?? "");
      if (date_from && d < date_from) return false;
      if (date_to && d > date_to) return false;
      return true;
    });
  }

  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((e: any) => {
      const hay = [
        String(e.invoice_description ?? ""),
        String(e.supplier_name ?? ""),
        String(e.project ?? ""),
        String((e as any).invoice_number ?? ""),
      ]
        .join("\n")
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  // Sorting
  const dir = sort_dir === "asc" ? 1 : -1;
  const by = sort_by;
  filtered.sort((a: any, b: any) => {
    let av: any;
    let bv: any;
    switch (by) {
      case "amount":
        av = Number(a.amount ?? 0);
        bv = Number(b.amount ?? 0);
        break;
      case "status":
        av = String(a.status ?? "");
        bv = String(b.status ?? "");
        break;
      case "created_at":
        // Fallback to date if no created_at
        av = String((a as any).created_at ?? a.date ?? "");
        bv = String((b as any).created_at ?? b.date ?? "");
        break;
      case "date":
      default:
        av = String(a.date ?? "");
        bv = String(b.date ?? "");
        break;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const totalCount = filtered.length;
  const start = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, pageSize));
  const dataSlice = filtered.slice(start, start + Math.max(1, pageSize));

  // Map to response shape and normalize optional fields
  const data = dataSlice.map((e: any) => ({
    id: String(e.id),
    budget: Number(e.budget ?? 0),
    project: String(e.project ?? ""),
    date: String(e.date ?? ""),
    categories: Array.isArray(e.categories) ? e.categories : String(e.categories ?? ""),
    amount: Number(e.amount ?? 0),
    invoice_description: String(e.invoice_description ?? ""),
    supplier_name: String(e.supplier_name ?? ""),
    invoice_file: String(e.invoice_file ?? ""),
    business_number: String(e.business_number ?? ""),
    invoice_type: String(e.invoice_type ?? ""),
    bank_details_file: e.bank_details_file ? String(e.bank_details_file) : null,
    supplier_email: e.supplier_email ? String(e.supplier_email) : null,
    status: String(e.status ?? ""),
    user_id: typeof e.user_id === "number" ? e.user_id : String(e.user_id ?? ""),
    priority: (e.priority ?? null) as any,
    program_id: (e as any).program_id ? String((e as any).program_id) : "",
  }));

  const hasMore = start + data.length < totalCount;
  return { data, hasMore, totalCount };
}