// src/routes/expenses.routes.ts
import { Router } from "express";
import * as svc from "../services/expenses.service.js";
import { getExpenses } from "../services/expenses.service.js";
import { listExpensesForUserPrograms } from "../services/expenses.service.js";
import { z } from "zod";

// Simple lookup functions (inline implementation)
import { base } from "../utils/airtableConfig.js";

// Resolve a program identifier to its Airtable record ID.
// Accepts either an actual record id (recXXXXXXXXXXXXXXX) or a textual id.
async function findProgramRecIdById(programId: string): Promise<string | null> {
  const pid = String(programId || "").trim();
  if (!pid) return null;

  // 1) If caller already passed a record id – accept as-is
  if (/^rec[0-9A-Za-z]{14}$/i.test(pid)) return pid;

  // 2) Try by a text field named "program_id" (common setup)
  const esc = pid.replace(/"/g, '\\"');
  try {
    const [byText] = await base("programs")
      .select({ filterByFormula: `{program_id} = "${esc}"`, maxRecords: 1, pageSize: 1 })
      .all();
    if (byText) return byText.id;
  } catch (_err) {
    // If the field doesn't exist, Airtable throws INVALID_FILTER_BY_FORMULA – fall through to fallback scan
  }

  // 3) Fallback: scan a reasonable page and match by any field equal to the provided value
  //    This helps when the text id is stored under a different field name (e.g., "Program ID")
  const records = await base("programs").select({ pageSize: 100 }).all();
  for (const rec of records) {
    // Prefer an explicit "program_id" if present
    const maybe = (rec.fields as any)?.program_id;
    if (maybe && String(maybe) === pid) return rec.id;
  }
  // If no explicit program_id field, try any field whose string value exactly matches
  for (const rec of records) {
    const fields = rec.fields as Record<string, any>;
    for (const key of Object.keys(fields)) {
      const val = fields[key];
      if (val != null && String(val) === pid) return rec.id;
    }
  }
  return null;
}

async function findCategoryRecIdsByNames(tokens: string[], programRecId: string): Promise<string[]> {
  // Note: despite the name, we now resolve by category ID (or recId),
  // scoped to categories linked to the given program.
  if (!tokens.length) return [];

  const recIdPattern = /^rec[0-9A-Za-z]{14}$/i;

  // Load categories and restrict to those linked to programRecId
  const all = await base("categories").select({ pageSize: 100 }).all();
  const recs = all.filter(r => {
    const fields = r.fields as Record<string, any>;
    return Object.values(fields).some(v => Array.isArray(v) && v.some(it => typeof it === "string" && it === programRecId));
  });

  // Build lookup maps: by numeric/text ID and by record id
  const byAutoId = new Map<string, string>();
  const validRecIds = new Set<string>();
  for (const r of recs) {
    validRecIds.add(r.id);
    const idVal = (r.get("ID") as any) ?? (r.get("category_id") as any) ?? (r.get("id") as any);
    if (idVal != null) byAutoId.set(String(idVal), r.id);
  }

  const out: string[] = [];
  for (const t of tokens) {
    const tok = String(t ?? "").trim();
    if (!tok) continue;
    if (recIdPattern.test(tok)) { if (validRecIds.has(tok)) out.push(tok); continue; }
    const viaId = byAutoId.get(tok);
    if (viaId) { out.push(viaId); continue; }
  }
  return out;
}

const r = Router();
function badRequest(details: Record<string, string>) {
  return { error: "validation_error", message: "Invalid parameters", details };
}

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);


const QuerySchema = z.object({
  user_id: z.coerce.number().int().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  // Treat empty q as undefined (no search)
  q: z.preprocess(emptyToUndef, z.string().trim().min(1).optional()),
  status: z
    .enum(["new", "sent_for_payment", "paid", "receipt_uploaded", "closed"]).optional(),
  priority: z.enum(["urgent", "normal"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort_by: z.enum(["date", "amount", "status", "created_at"]).default("date").optional(),
  sort_dir: z.enum(["asc", "desc"]).default("desc").optional(),
  // Treat empty program_id as undefined
  program_id: z.preprocess(emptyToUndef, z.string().optional()),
});

// GET /expenses?program_id=...
r.get("/", async (req, res, next) => {
  try {
    // Parse base params
    const base = QuerySchema.safeParse(req.query);
    if (!base.success) {
      const details: Record<string, string> = {};
      for (const issue of base.error.issues) {
        const k = issue.path.join(".") || "query";
        details[k] = issue.message;
      }
      return res.status(400).json(badRequest(details));
    }

    // Handle union of program_id and program_id[]
    const arrayParam = (req.query["program_id[]"] ?? req.query["program_id"]);
    const requestedPrograms: string[] = Array.isArray(arrayParam)
      ? arrayParam.map((x) => String(x))
      : base.data.program_id
      ? [String(base.data.program_id)]
      : [];

    // Validate date range semantics
    if (base.data.date_from && base.data.date_to && base.data.date_from > base.data.date_to) {
      return res.status(422).json({
        error: "semantic_error",
        message: "Invalid date range",
        details: { date_from: "Must be <= date_to", date_to: "Must be >= date_from" },
      });
    }

    const result = await listExpensesForUserPrograms({
      userId: base.data.user_id,
      page: base.data.page,
      pageSize: base.data.pageSize,
      q: base.data.q,
      status: base.data.status,
      priority: base.data.priority,
      date_from: base.data.date_from,
      date_to: base.data.date_to,
      sort_by: base.data.sort_by,
      sort_dir: base.data.sort_dir,
      requestedPrograms,
    });

    res.json(result);
  } catch (e: any) {
    next(e);
  }
});


// סכמה אחידה:
const CreatePayload = z.object({
  user_id: z.union([z.string(), z.number()]).transform(String),
  program_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().nonnegative(), // או gt(0) אם 0 לא מותר
  supplier_name: z.string().min(1),
  business_number: z.string().min(1),
  invoice_type: z.string().min(1),
  invoice_description: z.string().min(1),
  supplier_email: z.string().email().or(z.string().min(1)),
  status: z.string().optional(), // אופציונלי בלבד
  categories: z.array(z.string()).optional().default([]),

  bank_name: z.string().optional(),
  bank_branch: z.string().optional(),
  bank_account: z.string().optional(),
  beneficiary: z.string().optional(),

  bank_details_file: z.any().optional(),
  invoice_file: z.any().optional(), // ← אם את שולחת גם קובץ חשבונית ל-Airtable
  project: z.string().optional().default("")
});

// POST /expenses
r.post("/", async (req, res, next) => {
  try {
    const body: any = { ...req.body };
    const raw = CreatePayload.parse(body);
    console.log("after", raw);

    // 1) program_id → program_rec_id
    const program_rec_id = await findProgramRecIdById(raw.program_id);
    if (!program_rec_id) return res.status(422).json({ error: "Invalid program_id" });

    // 2) שמות קטגוריה → recIds (מסונן לפי תוכנית)
    const recIdPattern = /^rec[0-9A-Za-z]{14}$/i;
    const category_rec_ids = raw.categories.length
      ? (raw.categories.every((c) => recIdPattern.test(c))
          ? raw.categories // already record IDs
          : await findCategoryRecIdsByNames(raw.categories, program_rec_id))
      : [];

    // 3) payload נקי לשכבת השירות
    const payload: any = {
      ...raw,
      program_rec_id,
      categories: category_rec_ids,
      project: raw.project ?? "",
        status: "new",

    };
    // Add optional fields only if defined
    if (typeof raw.bank_name === "string") payload.bank_name = raw.bank_name;
    if (typeof raw.bank_branch === "string") payload.bank_branch = raw.bank_branch;
    if (typeof raw.bank_account === "string") payload.bank_account = raw.bank_account;
    if (typeof raw.beneficiary === "string") payload.beneficiary = raw.beneficiary;
    if (raw.bank_details_file !== undefined) payload.bank_details_file = raw.bank_details_file;
    if (raw.invoice_file !== undefined) payload.invoice_file = raw.invoice_file;

    // אל תשלחי מערך ריק של קבצים
    if (Array.isArray(payload.bank_details_file) && payload.bank_details_file.length === 0) {
      delete payload.bank_details_file;
    }
    if (Array.isArray(payload.invoice_file) && payload.invoice_file.length === 0) {
      delete payload.invoice_file;
    }
console.log(payload);

    // 4) שמירה
    const created = await svc.createExpense(payload);
    return res.status(201).json(created);
  } catch (e: any) {
    if (e?.issues) return res.status(422).json({ error: "Validation failed", issues: e.issues });
    next(e);
  }
});

export default r;
