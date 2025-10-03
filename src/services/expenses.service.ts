import { readJson } from "../utils/fileDB.js"; // או fileDB.js בהתאם לשם
import { base } from "../utils/airtableConfig.js";

import { z } from "zod";

// --- unified mapper: NO logic change ---
export function mapRowToApi(e: any) {
  return {
    id: String(e.id),
    budget: Number(e.budget ?? 0),
    project: String(e.project ?? ""),
    date: String(e.date ?? ""),
    // שימי לב: משאירים בדיוק את הלוגיקה הישנה של categories כדי לא לשנות התנהגות.
    categories: Array.isArray(e.categories) ? e.categories : String(e.categories ?? ""),
    amount: Number(e.amount ?? 0),
    invoice_description: String(e.invoice_description ?? ""),
    supplier_name: String(e.supplier_name ?? ""),
    invoice_file: toAttachmentArray((e as any).invoice_file),
    business_number: String(e.business_number ?? ""),
    invoice_type: String(e.invoice_type ?? ""),
    bank_name: String((e as any).bank_name ?? ""),
    bank_branch: String((e as any).bank_branch ?? ""),
    bank_account: String((e as any).bank_account ?? ""),
    bank_details_file: toAttachmentArray((e as any).bank_details_file),
    supplier_email: e.supplier_email ? String(e.supplier_email) : null,
    status: String(e.status ?? ""),
    user_id: typeof e.user_id === "number" ? e.user_id : String(e.user_id ?? ""),
    priority: (e.priority ?? null) as any,
    program_id: String((e as any).program_id ?? ""),
    program_name: String((e as any).program_name ?? ""),
  };
}
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


// ---- Salary payload (מהקליינט) ----
export const SalaryPayloadSchema = z.object({
  type: z.literal('salary'),
  supplier_name: z.string().min(1),
  is_gross: z.preprocess((val) => {
    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    if (typeof val === 'number') {
      if (val === 1) return true;
      if (val === 0) return false;
    }
    return val;
  }, z.boolean()),
  rate: z.coerce.number().positive(),
  quantity: z.coerce.number().positive(),
  amount: z.coerce.number().positive(),
  categories: z.array(z.string()).min(1),
  id_number: z.string().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export type SalaryPayload = z.infer<typeof SalaryPayloadSchema>;

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


export async function getExpenseById(recordId: string) {
  const rec = await base("expenses").find(recordId);
  return { id: rec.id, fields: rec.fields };
}

// New function for admin users to get ALL expenses
export async function listAllExpenses(args: {
  page?: number | undefined;
  pageSize?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
  priority?: "urgent" | "normal" | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
  sort_by?: "date" | "amount" | "status" | "created_at" | "supplier_name" | undefined;
  sort_dir?: "asc" | "desc" | undefined;
}) {
  const {
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

  // Fetch ALL expenses from Airtable without any program or user filtering
  const allRows: AirtableRow[] = [];
  await base("expenses")
    .select({
      pageSize: 100, // Internal page size for Airtable API
    })
    .eachPage((records, fetchNextPage) => {
      for (const rec of records) {
        allRows.push({ id: rec.id, ...rec.fields });
      }
      fetchNextPage();
    });

  // Apply filters
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

  // Sorting
  const dir = sort_dir === "asc" ? 1 : -1;
  const by = sort_by;
  filtered.sort((a: any, b: any) => {
    let av: any;
    let bv: any;
    switch (by) {
      case "supplier_name":
        av = String(a.supplier_name ?? "");
        bv = String(b.supplier_name ?? "");
        break;
      case "amount":
        av = Number(a.amount ?? 0);
        bv = Number(b.amount ?? 0);
        break;
      case "status":
        av = String(a.status ?? "");
        bv = String(b.status ?? "");
        break;
      case "created_at":
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
  const rows = filtered.slice(start, start + Math.max(1, pageSize));
  const hasMore = start + rows.length < totalCount;

  const data = rows.map(mapRowToApi);


  return { data, hasMore, totalCount };
}

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
  funding_source_id?: string;
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

function chooseIdFieldName(): 'business_number' | 'id_number' {
  // אם בטבלת Airtable שלך השדה הוא business_number השאירי כך.
  // אם בפועל קיים id_number, פשוט החזירי 'id_number'.
  return 'id_number';
}

function computeEmployerCost(is_gross: boolean, amount: number): number {
  return is_gross ? +(amount * 1.151).toFixed(2) : +((amount / 0.8783) * 1.151).toFixed(2);
}

function computeGrossNet(is_gross: boolean, amount: number): { gross: number; net: number } {
  if (is_gross) {
    return { gross: amount, net: +(amount * 0.8783).toFixed(2) };
  }
  return { gross: +(amount / 0.8783).toFixed(2), net: amount };
}

const ALLOWED_STATUS = new Set([
  "new",
  "sent_for_payment",
  "paid",
  "receipt_uploaded",
  "closed",
  "petty_cash",
  "salary"
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
  sort_by?: "date" | "amount" | "status" | "created_at" | "supplier_name" | undefined;
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
    filterByFormula: `OR({user_ids} = "${String(userId)}", FIND("${String(userId)}", ARRAYJOIN({user_ids})))`,
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
      case "supplier_name":
        av = String(a.supplier_name ?? "");
        bv = String(b.supplier_name ?? "");
        break;
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
  const data = rows.map(mapRowToApi);

  console.log(data.length);

  return { data, hasMore, totalCount };
}

export async function listExpensesForProgram(args: {
  program: string; // recId or text id
  page?: number | undefined;
  pageSize?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
  priority?: "urgent" | "normal" | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
  sort_by?: "date" | "amount" | "status" | "created_at" | "supplier_name" | undefined;
  sort_dir?: "asc" | "desc" | undefined;
}) {
  const {
    program,
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

  // Resolve program record id
  const pid = String(program || "").trim();
  if (!pid) return { data: [], hasMore: false, totalCount: 0 };
  const recIdPattern = /^rec[0-9A-Za-z]{14}$/i;
  let recId: string | null = null;
  let textId: string | undefined = undefined;
  if (recIdPattern.test(pid)) {
    recId = pid;
  } else {
    const esc = pid.replace(/\"/g, '\\"');
    const found = await base("programs")
      .select({ filterByFormula: `{program_id} = "${esc}"`, maxRecords: 1, pageSize: 1 })
      .all();
    if (found[0]) {
      recId = found[0].id;
      textId = (found[0].fields as any)?.program_id as string | undefined;
    }
  }
  if (!recId) return { data: [], hasMore: false, totalCount: 0 };

  const allRows: AirtableRow[] = await fetchAllExpensesForProgram(recId, textId ?? pid);

  // Filters
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

  // Sorting
  const dir = sort_dir === "asc" ? 1 : -1;
  const by = sort_by;
  filtered.sort((a: any, b: any) => {
    let av: any;
    let bv: any;
    switch (by) {
      case "supplier_name":
        av = String(a.supplier_name ?? "");
        bv = String(b.supplier_name ?? "");
        break;
      case "amount":
        av = Number(a.amount ?? 0);
        bv = Number(b.amount ?? 0);
        break;
      case "status":
        av = String(a.status ?? "");
        bv = String(b.status ?? "");
        break;
      case "created_at":
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
  const rows = filtered.slice(start, start + Math.max(1, pageSize));
  const hasMore = start + rows.length < totalCount;

  const data = rows.map((e: any) => ({
    id: String(e.id),
    budget: Number(e.budget ?? 0),
    project: String(e.project ?? ""),
    date: String(e.date ?? ""),
    categories: Array.isArray(e.categories) ? e.categories : String(e.categories ?? ""),
    amount: Number(e.amount ?? 0),
    invoice_description: String(e.invoice_description ?? ""),
    supplier_name: String(e.supplier_name ?? ""),
    invoice_file: toAttachmentArray((e as any).invoice_file),
    business_number: String(e.business_number ?? ""),
    invoice_type: String(e.invoice_type ?? ""),
    bank_name: String((e as any).bank_name ?? ""),
    bank_branch: String((e as any).bank_branch ?? ""),
    bank_account: String((e as any).bank_account ?? ""),
    bank_details_file: toAttachmentArray((e as any).bank_details_file),
    supplier_email: e.supplier_email ? String(e.supplier_email) : null,
    status: String(e.status ?? ""),
    user_id: typeof e.user_id === "number" ? e.user_id : String(e.user_id ?? ""),
    priority: (e.priority ?? null) as any,
    program_id: String((e as any).program_id ?? ""),
    program_name: String((e as any).program_name ?? ""),
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
    categories: input.categories,
    bank_name: input.bank_name,
    bank_branch: input.bank_branch,
    bank_account: input.bank_account,
    beneficiary: input.beneficiary,
    // project: input.project,
  };

  // Map client funding_source_id -> Airtable funding_source_id
  if (typeof (input as any).funding_source_id === "string") {
    const fsid = (input as any).funding_source_id.trim();
    if (fsid) {
      const recIdPattern = /^rec[0-9A-Za-z]{14}$/i;
      // fields.funding_source_id = recIdPattern.test(fsid) ? [fsid] : fsid;
      fields.budget_id = recIdPattern.test(fsid) ? [fsid] : fsid;
      // fields.funding_source_id = recIdPattern.test(fsid) ? [fsid] : fsid;
    }
  }

  // // המרה של שמות קטגוריות ל־recIds (אם השדה הוא Link לטבלת categories)
  // const { resolveCategoryLinksByNames } = await import("./categories.service.js");
  // if (Array.isArray(input.categories) && input.categories.length) {
  //   const categoryLinks = await resolveCategoryLinksByNames(input.program_rec_id, input.categories);
  //   if (categoryLinks.length) {
  //     fields.categories = categoryLinks;
  //   } else {
  //     delete fields.categories; // אל תשלחי אם אין התאמה
  //   }
  // }


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

// Minimal creation for JSON-only petty_cash flow (no attachment/file handling, no status normalization)
// Minimal creation for JSON-only petty_cash flow (no attachment/file handling, no status normalization)
export async function createPettyCashExpense(input: {
  user_id: string;
  program_id: string;
  program_rec_id: string;
  date: string;
  amount: number;
  supplier_name?: string;
  expense_type: string;
  invoice_description: string;
  supplier_email?: string;
  status: string;
  categories: string[];
  business_number?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_account?: string;
  beneficiary?: string;
  project?: string;
}) {
  const fields: Record<string, any> = {
    program_id: [input.program_rec_id],
    date: input.date,
    amount: input.amount,
    supplier_name: input.supplier_name,
    business_number: input.business_number,
    // invoice_type: "petty_cash",
    expense_type: input.expense_type,
    invoice_description: input.invoice_description,
    supplier_email: input.supplier_email,
    status: input.status || 'petty_cash',
    user_id: String(input.user_id ?? ""),
    categories: input.categories,
    bank_name: input.bank_name,
    bank_branch: input.bank_branch,
    bank_account: input.bank_account,
    beneficiary: input.beneficiary,
  };

  if (input.project !== undefined) fields.project = input.project;

  for (const k of Object.keys(fields)) {
    const v = fields[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === "") {
      delete fields[k];
    }
  }

  const rec = await base('expenses').create(fields);
  return { id: rec.id, fields: rec.fields };
}

export async function createSalaryExpense(input: {
  payload: SalaryPayload;             // מהקליינט (עובר ולידציה למעלה)
  user_id: string | number;           // מה־auth/middleware
  program_rec_id: string;             // rec id של התכנית בטבלת programs
  // אופציונלי: אם אתם מחזיקים גם מזהה טקסטואלי
  program_id_text?: string;
}) {
  // ולידציה להרגעה (אם כבר וידאת בשכבת הראוטר, אפשר להשאיר כהערה)
  const parsed = SalaryPayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    const err: any = new Error('ValidationError');
    err.details = parsed.error.flatten();
    err.status = 400;
    throw err;
  }
  const dto = parsed.data;

  const idField = chooseIdFieldName();
  const is_gross: 'gross' | 'net' = dto.is_gross ? 'gross' : 'net';
  const employer_cost = computeEmployerCost(dto.is_gross, dto.amount);
  // const { gross, net } = computeGrossNet(dto.is_gross, dto.amount);

  // שדות Airtable
  const fields: Record<string, any> = {
    expense_type: 'דיווח שכר',
    program_id: [input.program_rec_id],
    supplier_name: dto.supplier_name,
    [idField]: dto.id_number,
    month: dto.month,
    rate: dto.rate,
    quantity: dto.quantity,
    amount: employer_cost,// הסכום ששולם בפועל (עלות מעסיק)
    is_gross,
    categories: dto.categories,   // IDs של קטגוריות (Link)
    employer_cost,
    user_id: String(input.user_id),
    status: 'salary',
  };

  // ניקוי ערכים ריקים/undefined
  for (const k of Object.keys(fields)) {
    const v = fields[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === '') {
      delete fields[k];
    }
  }

  const rec = await base('expenses').create(fields, { typecast: true });
  return { id: rec.id, fields: rec.fields };
}

export type UpdateExpenseInput = Partial<{
  program_id: string;            // rec id or text id (we'll keep as-is if rec id)
  date: string;
  amount: number;
  supplier_name: string;
  business_number: string;
  invoice_type: string;
  invoice_description: string;
  supplier_email: string;
  status: string;
  user_id: string | number;
  categories: string[];          // array of category record ids
  bank_name: string;
  bank_branch: string;
  bank_account: string;
  beneficiary: string;
  project: string;
  id_number: string;
  idNumber: string;            // alias מהקליינט
  month: string;               // YYYY-MM
  rate: number;
  quantity: number;
  is_gross: boolean | 'gross' | 'net';
  // --- META מהקליינט (אם נשלח בתוך meta) ---
  meta?: {
    is_gross?: boolean;
    rate?: number;
    quantity?: number;
    idNumber?: string;
    month?: string;
  };
}>;

export async function updateExpense(recordId: string, input: UpdateExpenseInput) {
  const fields: Record<string, any> = {};
  const data: any = { ...input };
  if (data.idNumber && !data.id_number) data.id_number = data.idNumber;
  // Only include provided keys
  if (input.program_id) fields.program_id = [input.program_id];
  if (input.date !== undefined) fields.date = input.date;
  if (input.amount !== undefined) fields.amount = input.amount;
  if (input.supplier_name !== undefined) fields.supplier_name = input.supplier_name;
  if (input.business_number !== undefined) fields.business_number = input.business_number;
  if (input.invoice_type !== undefined) fields.invoice_type = input.invoice_type;
  if (input.invoice_description !== undefined) fields.invoice_description = input.invoice_description;
  if (input.supplier_email !== undefined) fields.supplier_email = input.supplier_email;
  if (input.status !== undefined) fields.status = normalizeStatus(input.status);
  if (input.user_id !== undefined) fields.user_id = String(input.user_id ?? "");
  if (Array.isArray(input.categories)) fields.categories = input.categories;
  if (input.bank_name !== undefined) fields.bank_name = input.bank_name;
  if (input.bank_branch !== undefined) fields.bank_branch = input.bank_branch;
  if (input.bank_account !== undefined) fields.bank_account = input.bank_account;
  if (input.beneficiary !== undefined) fields.beneficiary = input.beneficiary;
  // if (input.project !== undefined) fields.project = input.project;
  // --- שדות שכר בשורש ---
  if (data.id_number !== undefined) fields.id_number = String(data.id_number);
  if (data.month !== undefined) fields.month = String(data.month);
  if (data.rate !== undefined) fields.rate = Number(data.rate);
  if (data.quantity !== undefined) fields.quantity = Number(data.quantity);
  if (data.is_gross !== undefined) {
    // מקבל גם boolean וגם 'gross'/'net'
    const v = data.is_gross;
    fields.is_gross = (typeof v === 'boolean') ? (v ? 'gross' : 'net') : v;
  }

  // --- META מהקליינט (לא דורס, רק משלים אם לא הגיעו בשורש) ---
  if (data.meta && typeof data.meta === 'object') {
    const m = data.meta;
    if (fields.is_gross === undefined && typeof m.is_gross === 'boolean') {
      fields.is_gross = m.is_gross ? 'gross' : 'net';
    }
    if (fields.rate === undefined && m.rate != null) {
      fields.rate = Number(m.rate);
    }
    if (fields.quantity === undefined && m.quantity != null) {
      fields.quantity = Number(m.quantity);
    }
    if (fields.id_number === undefined && m.idNumber != null) {
      fields.id_number = String(m.idNumber);
    }
    if (fields.month === undefined && m.month != null) {
      fields.month = String(m.month);
    }
  }
  const salaryTouched =
    data.is_gross !== undefined || data.amount !== undefined ||
    data.rate !== undefined || data.quantity !== undefined ||
    (data.meta && (
      data.meta.is_gross !== undefined ||
      data.meta.rate !== undefined ||
      data.meta.quantity !== undefined
    ));

  if (salaryTouched) {
    // שלוף את הרשומה להשלים ערכים חסרים
    const recNow = await base("expenses").find(recordId);
    const cur: any = recNow.fields || {};

    // קבע מצב ברוטו/נטו כ־boolean
    const isGrossBool =
      fields.is_gross === 'gross' ? true :
        fields.is_gross === 'net' ? false :
          typeof data.is_gross === 'boolean' ? data.is_gross :
            String(cur.is_gross || '').toLowerCase() === 'gross';

    // חשב amount מתוך rate*quantity אם לא נשלח amount
    const rateNow = fields.rate ?? data.rate ?? cur.rate;
    const qtyNow = fields.quantity ?? data.quantity ?? cur.quantity;
    const amountFromRQ =
      (rateNow != null && qtyNow != null) ? Number(rateNow) * Number(qtyNow) : undefined;
    const amountNow =

      // fields.amount ?? data.amount ?? amountFromRQ ?? Number(cur.amount ?? 0);
      amountFromRQ ?? fields.amount ?? data.amount ?? Number(cur.amount ?? 0);
    if (Number.isFinite(amountNow)) {
      // עדכן עלות מעסיק תמיד (השדה כבר קיים אצלך ביצירה)
      fields.employer_cost = computeEmployerCost(isGrossBool, Number(amountNow));
      // אם זו רשומת דיווח שכר - גם amount יהיה עלות המעסיק
      const isSalaryRecord =
        String(cur.expense_type || '').includes('דיווח שכר') ||
        String(cur.status || '').toLowerCase() === 'salary';
      if (isSalaryRecord) {
        fields.amount = fields.employer_cost;
      }

      // עדכן GROSS/NET רק אם קיימים בטבלה כדי להימנע משגיאת סכימה
      const hasGross = Object.prototype.hasOwnProperty.call(cur, 'gross');
      const hasNet = Object.prototype.hasOwnProperty.call(cur, 'net');
      if (hasGross || hasNet) {
        const { gross, net } = computeGrossNet(isGrossBool, Number(amountNow));
        if (hasGross) fields.gross = gross;
        if (hasNet) fields.net = net;
      }
    }
  }
  // Clean undefined/empty (except allow empty string to clear text fields if desired)
  for (const k of Object.keys(fields)) {
    const v = fields[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) {
      delete fields[k];
    }
  }

  const rec = await base("expenses").update(recordId, fields, { typecast: true });
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
    sort_by?: "date" | "amount" | "status" | "created_at" | "supplier_name" | undefined;
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
      case "supplier_name":
        av = String(a.supplier_name ?? "");
        bv = String(b.supplier_name ?? "");
        break;
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
  const data = dataSlice.map(mapRowToApi);

  const hasMore = start + data.length < totalCount;
  return { data, hasMore, totalCount };
}

export async function uploadAttachmentToAirtable(opts: {
  recordId: string; fieldName: string; buffer: Buffer; fileName: string; mime: string, tableName: string
}) {
  const { recordId, fieldName, buffer, fileName, mime, tableName } = opts;
  const url = `https://content.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;
  console.log(url);

  // const tableName = "expenses"; // נניח שהטבלה היא expenses
  // Prepare safer headers for filenames/mime and optional debug
  const safeMime = mime && String(mime).trim() ? mime : "application/octet-stream";
  const asciiName = sanitizeFilename(fileName).replace(/[^\x20-\x7E]/g, "_");
  const filenameStar = encodeURIComponent(fileName);
  if (process.env.DEBUG_AIRTABLE === "1") {
    console.error("[Airtable/uploadAttachment]", { url, tableName, recordId, fieldName, fileName, asciiName, mime: safeMime, size: buffer?.length ?? 0 });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.AIRTABLE_TOKEN}`,
      "Content-Type": safeMime,
      // Content-Disposition נדרש כדי לשמר שם קובץ בתצוגה
      // ASCII fallback + RFC 5987 filename*
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${filenameStar}`,
      "Content-Length": String(buffer.length),
    } as any,
    body: buffer,
  });

  if (!res.ok) {
    const requestId = res.headers.get("x-airtable-request-id") || res.headers.get("x-request-id") || "";
    const ct = res.headers.get("content-type") || "";
    const text = await res.text().catch(() => "");
    let message = text;
    if (ct.includes("application/json")) {
      try {
        const parsed = JSON.parse(text);
        const errPayload = (parsed as any)?.error ?? parsed;
        message = JSON.stringify(errPayload);
      } catch {
        // keep raw text
      }
    }
    const err: any = new Error(message || "Airtable uploadAttachment failed");
    err.status = res.status;
    if (requestId) err.requestId = requestId;
    err.details = `status=${res.status}${res.statusText ? " " + res.statusText : ""}${requestId ? ` reqId=${requestId}` : ""}`;
    err.endpoint = url;
    err.context = { tableName, recordId, fieldName, size: buffer?.length ?? 0, mime };
    throw err;
  }

  return await res.json(); // מחזיר metadata של ה־attachments בשדה
}

// Alternative upload using Airtable's JSON (base64) payload as per docs
export async function uploadAttachmentToAirtableJSON(opts: {
  recordId: string;
  fieldName: string; // field name or fldXXXXXXXX ID
  buffer: Buffer;
  filename: string;
  mime: string;
}) {
  const { recordId, fieldName, buffer, filename, mime } = opts;
  const url = `https://content.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;

  const safeMime = mime && String(mime).trim() ? mime : "application/octet-stream";
  const safeName = typeof filename === "string" && filename.trim() ? filename : "attachment";
  const base64 = Buffer.from(buffer).toString("base64");

  if (process.env.DEBUG_AIRTABLE === "1") {
    console.error("[Airtable/uploadAttachmentJSON]", { url, recordId, fieldName, filename: safeName, mime: safeMime, size: buffer?.length ?? 0 });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    } as any,
    body: JSON.stringify({ contentType: safeMime, file: base64, filename: safeName }),
  });

  if (!res.ok) {
    const requestId = res.headers.get("x-airtable-request-id") || res.headers.get("x-request-id") || "";
    const ct = res.headers.get("content-type") || "";
    const text = await res.text().catch(() => "");
    let message = text;
    if (ct.includes("application/json")) {
      try {
        const parsed = JSON.parse(text);
        const errPayload = (parsed as any)?.error ?? parsed;
        message = JSON.stringify(errPayload);
      } catch { }
    }
    const err: any = new Error(message || "Airtable uploadAttachment failed");
    err.status = res.status;
    if (requestId) err.requestId = requestId;
    err.details = `status=${res.status}${res.statusText ? " " + res.statusText : ""}${requestId ? ` reqId=${requestId}` : ""}`;
    err.endpoint = url;
    err.context = { recordId, fieldName, size: buffer?.length ?? 0, mime };
    throw err;
  }

  return await res.json();
}

function sanitizeFilename(name: string) {
  // שמירה פשוטה – להימנע מציטוטים ותווים בעייתיים
  return name.replace(/[\r\n"]/g, "_");
}

export async function deleteExpense(recordId: string) {
  await base("expenses").destroy(recordId);
}
