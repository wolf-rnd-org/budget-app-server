// src/routes/expenses.routes.ts
import { Router } from "express";
import * as svc from "../services/expenses.service.js";
import { getExpenses } from "../services/expenses.service.js";
import { z } from "zod";

// Simple lookup functions (inline implementation)
import { base } from "../utils/airtableConfig.js";

async function findProgramRecIdById(programId: string): Promise<string | null> {
  const [program] = await base("programs")
    .select({ filterByFormula: `{program_id} = "${programId}"`, maxRecords: 1 })
    .all();
  return program?.id || null;
}

async function findCategoryRecIdsByNames(names: string[], _programRecId: string): Promise<string[]> {
  if (!names.length) return [];
  const formula = names.map(name => `{name} = "${name}"`).join(", ");
  const categories = await base("categories")
    .select({ filterByFormula: `OR(${formula})` })
    .all();
  return categories.map(cat => cat.id);
}

const r = Router();

// GET /expenses?program_id=...
r.get("/", async (req, res, next) => {
  try {
    const programId = String(req.query.program_id || "").trim();
    if (!programId) return res.status(400).json({ error: "program_id is required" });
    const expenses = await getExpenses(programId);
    res.json(expenses);
  } catch (e) { next(e); }
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
    const raw = CreatePayload.parse(req.body);

    // 1) program_id → program_rec_id
    const program_rec_id = await findProgramRecIdById(raw.program_id);
    if (!program_rec_id) return res.status(422).json({ error: "Invalid program_id" });

    // 2) שמות קטגוריה → recIds (מסונן לפי תוכנית)
    const category_rec_ids = raw.categories.length
      ? await findCategoryRecIdsByNames(raw.categories, program_rec_id)
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

    // 4) שמירה
    const created = await svc.createExpense(payload);
    return res.status(201).json(created);
  } catch (e: any) {
    if (e?.issues) return res.status(422).json({ error: "Validation failed", issues: e.issues });
    next(e);
  }
});

export default r;
