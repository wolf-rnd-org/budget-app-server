// src/routes/expenses.routes.ts
import { Router } from "express";
import * as svc from "../services/expenses.service.js";
import { listExpensesForProgram } from "../services/expenses.service.js";
import { listExpensesForUserPrograms } from "../services/expenses.service.js";
import { listAllExpenses } from "../services/expenses.service.js";
import { z } from "zod";
import multer from "multer";


// Simple lookup functions (inline implementation)
import { base } from "../utils/airtableConfig.js";
// Note: categories enrichment now reads from expense row fields directly

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
  const invalidTokens: string[] = [];

  for (const t of tokens) {
    const tok = String(t ?? "").trim();
    if (!tok) continue;
    if (recIdPattern.test(tok)) {
      if (validRecIds.has(tok)) {
        out.push(tok);
      } else {
        invalidTokens.push(tok);
      }
      continue;
    }
    const viaId = byAutoId.get(tok);
    if (viaId) {
      out.push(viaId);
    } else {
      invalidTokens.push(tok);
    }
  }

  // Log invalid tokens for debugging
  if (invalidTokens.length > 0) {
    console.log('Invalid category tokens that need to be added to Airtable:', invalidTokens);
  }

  return out;
}

const r = Router();
function badRequest(details: Record<string, string>) {
  return { error: "validation_error", message: "Invalid parameters", details };
}

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

// Helper function for status progression
function getNextStatus(currentStatus: string): string {
  const statusFlow = {
    "new": "sent_for_payment",
    "sent_for_payment": "paid",
    "paid": "receipt_uploaded",
    "receipt_uploaded": "closed",
    "closed": "closed" // Already at final status
  };

  return statusFlow[currentStatus as keyof typeof statusFlow] || currentStatus;
}

// Helper functions for permission handling
function parseUserActions(userActionsJson?: string): string[] {
  if (!userActionsJson) return [];
  try {
    const parsed = JSON.parse(userActionsJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    console.error('Failed to parse user_actions:', error);
    return [];
  }
}

function hasPermission(userActions: string[], permission: string): boolean {
  return userActions.includes(permission);
}

function validatePermissions(userActions: string[], userId?: number, programIds?: string[]): {
  isValid: boolean;
  accessLevel: 'admin' | 'program_manager' | 'user';
  allowedPrograms?: string[];
} {
  // Admin access - can see all expenses from all programs and users
  // No program_id required for admin
  if (hasPermission(userActions, 'expenses.admin.view')) {
    return { isValid: true, accessLevel: 'admin' };
  }

  // Program manager access - can see all expenses within specific programs
  // If no user_id provided but has expenses.view, treat as program manager
  if (hasPermission(userActions, 'expenses.view')) {
    if (!programIds || programIds.length === 0) {
      return { isValid: false, accessLevel: 'program_manager' };
    }
    return {
      isValid: true,
      accessLevel: 'program_manager',
      allowedPrograms: programIds
    };
  }

  // Regular user access - can only see their own expenses
  if (userId) {
    return { isValid: true, accessLevel: 'user' };
  }

  return { isValid: false, accessLevel: 'user' };
}


const QuerySchema = z.object({
  user_id: z.coerce.number().int().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  // Treat empty q as undefined (no search)
  q: z.preprocess(emptyToUndef, z.string().trim().min(1).optional()),
  status: z
    .enum(["new", "sent_for_payment", "paid", "receipt_uploaded", "closed"]).optional(),
  priority: z.enum(["urgent", "normal"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort_by: z
    .enum(["date", "amount", "status", "created_at", "supplier_name"])
    .default("date")
    .optional(),
  sort_dir: z.enum(["asc", "desc"]).default("desc").optional(),
  // Treat empty program_id as undefined; at least one program_id is required overall
  program_id: z.preprocess(emptyToUndef, z.string().optional()),
  // New: user actions for permission-based filtering
  user_actions: z.preprocess(emptyToUndef, z.string().optional()),
});

// GET /expenses with permission-based filtering
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

    // Parse user actions for permission checking
    const userActions = parseUserActions(base.data.user_actions);
    console.log('User actions:', userActions);

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

    // Validate permissions and determine access level
    const permissionCheck = validatePermissions(userActions, base.data.user_id, requestedPrograms);

    if (!permissionCheck.isValid) {
      return res.status(403).json({
        error: "forbidden",
        message: "Insufficient permissions to access expenses"
      });
    }

    console.log('Permission check result:', permissionCheck);

    // For non-admin users, require program_id
    if (permissionCheck.accessLevel !== 'admin' && requestedPrograms.length === 0) {
      return res.status(400).json({
        error: "validation_error",
        message: "program_id is required for non-admin users"
      });
    }

    let result;

    switch (permissionCheck.accessLevel) {
      case 'admin':
        // Admin can see ALL expenses from ALL programs and users
        console.log('Admin access: fetching all expenses');

        result = await listAllExpenses({
          page: base.data.page,
          pageSize: base.data.pageSize,
          q: base.data.q,
          status: base.data.status,
          priority: base.data.priority,
          date_from: base.data.date_from,
          date_to: base.data.date_to,
          sort_by: base.data.sort_by,
          sort_dir: base.data.sort_dir,
        });
        break;

      case 'program_manager':
        // Program manager can see all expenses within their allowed programs
        console.log('Program manager access: fetching expenses for programs:', permissionCheck.allowedPrograms);
        console.log('User ID provided:', base.data.user_id);

        if (!permissionCheck.allowedPrograms || permissionCheck.allowedPrograms.length === 0) {
          return res.status(403).json({
            error: "forbidden",
            message: "No programs authorized for this user"
          });
        }

        // Ensure requested programs are within allowed programs
        const unauthorizedPrograms = requestedPrograms.filter(p =>
          !permissionCheck.allowedPrograms!.includes(p)
        );

        if (unauthorizedPrograms.length > 0) {
          return res.status(403).json({
            error: "forbidden",
            message: `Access denied to programs: ${unauthorizedPrograms.join(', ')}`
          });
        }

        if (requestedPrograms.length === 1) {
          // If user_id is provided, filter by user within the program
          // If no user_id, return ALL expenses for the program
          if (base.data.user_id) {
            console.log('Fetching expenses for specific user within program');
            result = await listExpensesForUserPrograms({
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
          } else {
            console.log('Fetching ALL expenses for program (no user filter)');
            result = await listExpensesForProgram({
              program: requestedPrograms[0],
              page: base.data.page,
              pageSize: base.data.pageSize,
              q: base.data.q,
              status: base.data.status,
              priority: base.data.priority,
              date_from: base.data.date_from,
              date_to: base.data.date_to,
              sort_by: base.data.sort_by,
              sort_dir: base.data.sort_dir,
            });
          }
        } else {
          return res.status(400).json({
            error: "validation_error",
            message: "Multiple program support not yet implemented"
          });
        }
        break;

      case 'user':
        // Regular user can only see their own expenses
        console.log('User access: fetching expenses for user:', base.data.user_id);

        if (!base.data.user_id) {
          return res.status(400).json({
            error: "validation_error",
            message: "user_id is required for regular users"
          });
        }

        if (requestedPrograms.length === 0) {
          return res.status(400).json({
            error: "validation_error",
            message: "program_id is required"
          });
        }

        result = await listExpensesForUserPrograms({
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
        break;

      default:
        return res.status(403).json({
          error: "forbidden",
          message: "Invalid access level"
        });
    }

    // Enrich categories and return result
    const enriched = await enrichCategoriesWithLookup(result.data);
    return res.json({ ...result, data: enriched });

  } catch (e: any) {
    console.error('Error in expenses GET endpoint:', e);
    next(e);
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
const uploadFields = upload.fields([
  { name: "invoice_file", maxCount: 1 },
  { name: "bank_details_file", maxCount: 1 },
]);

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
  categories: z.preprocess(
    (v) => Array.isArray(v) ? v : (v == null ? [] : [v]),
    z.array(z.string())
  ).optional().default([]),
  funding_source_id: z.string().optional(),
  bank_name: z.string().optional(),
  bank_branch: z.string().optional(),
  bank_account: z.string().optional(),
  beneficiary: z.string().optional(),

  bank_details_file: z.any().optional(),
  invoice_file: z.any().optional(), // ← אם את שולחת גם קובץ חשבונית ל-Airtable
  project: z.string().optional().default("")
});

// POST /expenses
r.post("/", uploadFields, async (req, res, next) => {
  try {
    const body: any = { ...req.body };
    const raw = CreatePayload.parse(body);

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
    if (typeof raw.funding_source_id === "string" && raw.funding_source_id.trim()) {
      payload.funding_source_id = raw.funding_source_id.trim();
    }
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
    let created;
    try {
      created = await svc.createExpense(payload);
    } catch (error: any) {
      // Handle Airtable select option errors
      if (error?.error === 'INVALID_MULTIPLE_CHOICE_OPTIONS') {
        console.log('Invalid select option detected:', error.message);
        console.log('Full payload that caused the error:', JSON.stringify(payload, null, 2));

        // Try different strategies to identify and fix the issue
        const strategies: Array<() => any> = [
          // Strategy 1: Remove categories
          () => ({ ...payload, categories: [] }),
          // Strategy 2: Remove status (in case it's a custom status)
          () => ({ ...payload, status: 'new' }),
          // Strategy 3: Remove invoice_type if it might be a select field
          () => ({ ...payload, invoice_type: '' }),
          // Strategy 4: Remove all potentially problematic fields
          () => ({
            ...payload,
            categories: [],
            status: 'new',
            invoice_type: '',
            project: ''
          })
        ];

        for (let i = 0; i < strategies.length; i++) {
          try {
            console.log(`Trying strategy ${i + 1}...`);
            const strategy = strategies[i];
            if (strategy) {
              const modifiedPayload = strategy();
              created = await svc.createExpense(modifiedPayload);
              console.log(`Strategy ${i + 1} succeeded`);
              break;
            }
          } catch (retryError: any) {
            console.log(`Strategy ${i + 1} failed:`, retryError.message);
            if (i === strategies.length - 1) {
              // If all strategies fail, throw the original error
              throw error;
            }
          }
        }

        if (!created) {
          throw error;
        }
      } else {
        throw error;
      }
    }
    if (req.files && created?.id) {
      const files = req.files as Record<string, Express.Multer.File[] | undefined>;

      if (files?.invoice_file?.[0]) {
        const f = files.invoice_file[0];
        await svc.uploadAttachmentToAirtableJSON({
          recordId: created.id,
          fieldName: "invoice_file",
          buffer: f.buffer,
          filename: f.originalname,
          mime: f.mimetype,
        });
      }
      console.log("bbb");

      if (files?.bank_details_file?.[0]) {
        const f = files.bank_details_file[0];
        await svc.uploadAttachmentToAirtableJSON({
          recordId: created.id,
          fieldName: "bank_details_file",
          buffer: f.buffer,
          filename: f.originalname,
          mime: f.mimetype,
        });
      }

      // אופציונלי: למשוך את הרשומה שוב ולהחזיר ללקוח את הערך המעודכן של השדה
      const refreshed = await svc.getExpenseById(created.id);
      return res.status(201).json(refreshed || created);
    }
    return res.status(201).json(created);
  } catch (e: any) {
    console.log("invlid result");
    if (e?.issues) return res.status(422).json({ error: "Validation failed", issues: e.issues });
    next(e);
  }
});

// PATCH /expenses/:id
const PatchSchema = z.object({
  program_id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.coerce.number().optional(),
  supplier_name: z.string().optional(),
  business_number: z.string().optional(),
  invoice_type: z.string().optional(),
  invoice_description: z.string().optional(),
  supplier_email: z.string().optional(),
  status: z.string().optional(),
  user_id: z.union([z.string(), z.number()]).optional(),
  categories: z.preprocess(
    (v) => Array.isArray(v) ? v : (v == null ? undefined : [v]),
    z.array(z.string())
  ).optional(),
  bank_name: z.string().optional(),
  bank_branch: z.string().optional(),
  bank_account: z.string().optional(),
  beneficiary: z.string().optional(),
  project: z.string().optional(),
});

r.patch("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "validation_error", message: "id is required" });
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "validation_error", issues: parsed.error.issues });

    const updated = await svc.updateExpense(id, parsed.data as any);
    // Return refreshed airtable record fields
    const refreshed = await svc.getExpenseById(updated.id);
    return res.json(refreshed || updated);
  } catch (e) {
    next(e);
  }
});

// POST /expenses/:id/advance-status - Advance expense to next status
r.post("/:id/status", async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "validation_error", message: "id is required" });

    // Get current expense to check its current status
    const currentExpense = await svc.getExpenseById(id);
    const currentStatus = String(currentExpense.fields?.status || "new");

    console.log('Current status:', currentStatus);

    // Advance to next status
    const nextStatus = getNextStatus(currentStatus);
    console.log('Advancing status from', currentStatus, 'to', nextStatus);

    // Update only the status
    const updated = await svc.updateExpense(id, { status: nextStatus });

    // Return refreshed expense with new status
    const refreshed = await svc.getExpenseById(updated.id);

    return res.json({
      success: true,
      message: `Status advanced from '${currentStatus}' to '${nextStatus}'`,
      data: refreshed || updated,
      statusChange: {
        from: currentStatus,
        to: nextStatus
      }
    });
  } catch (e) {
    next(e);
  }
});

export default r;

// Build categories from expense row fields without extra program fetches.
function toArray(v: any): any[] { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
function categoriesFromRow(row: any): Array<{ id: string; name: string }> {

  const idsRaw = toArray(row?.category_id ?? row?.categories);
  const namesRaw = toArray(row?.category_name ?? row?.category ?? row?.categories_name);
  const out: Array<{ id: string; name: string }> = [];
  const max = Math.max(idsRaw.length, namesRaw.length);
  for (let i = 0; i < max; i++) {
    const idVal = idsRaw[i];
    const nameVal = namesRaw[i];
    const id = typeof idVal === "object" && idVal?.id ? String(idVal.id) : String(idVal ?? "");
    let name = "";
    if (typeof idVal === "object" && idVal?.name) name = String(idVal.name);
    if (nameVal != null && name === "") name = String(nameVal);
    out.push({ id, name });
  }
  return out.filter((c) => c.id !== "");
}

// If category names are missing, fetch names by category record ids and fill them in
async function enrichCategoriesWithLookup(rows: any[]) {
  const recIdPattern = /^rec[0-9A-Za-z]{14}$/i;
  const needed = new Set<string>();
  const prelim = rows.map((row) => {
    const cats = categoriesFromRow(row);
    for (const c of cats) if (!c.name && recIdPattern.test(c.id)) needed.add(c.id);
    return { row, cats };
  });

  let nameByRecId = new Map<string, string>();
  if (needed.size > 0) {
    // Chunk queries to Airtable if needed (<= 50 per OR to be safe)
    const allIds = Array.from(needed);
    const blocks: string[][] = [];
    for (let i = 0; i < allIds.length; i += 50) blocks.push(allIds.slice(i, i + 50));
    nameByRecId = new Map<string, string>();
    for (const block of blocks) {
      const formula = `OR(${block.map((id) => `RECORD_ID() = "${id}"`).join(',')})`;
      const recs = await base('categories').select({ filterByFormula: formula, pageSize: 50 }).all();
      for (const rec of recs) {
        const nm = String((rec.fields as any)?.name ?? "");
        nameByRecId.set(rec.id, nm);
      }
    }
  }

  return prelim.map(({ row, cats }) => {
    const withNames = cats.map((c) => ({ id: c.id, name: c.name || nameByRecId.get(c.id) || "" }));
    return { ...row, categories: withNames };
  });
}

// Helper: normalize Airtable/primitive attachment field to array of { url, filename? }
function normalizeAttachments(v: any): Array<{ url: string; filename?: string }> {
  if (!v) return [];
  if (typeof v === "string") return v ? [{ url: v }] : [];
  if (Array.isArray(v)) return v.map(x => (typeof x === "string" ? { url: x } : x)).filter(a => a?.url);
  if (typeof v === "object" && (v as any).url) return [v as any];
  return [];
}

// GET /expenses/:id/files/:field/:index -> 302 redirect to attachment URL
r.get("/:id/files/:field/:index", async (req, res, next) => {
  try {
    const { id, field, index } = req.params as { id: string; field: string; index: string };
    const allowed = new Set(["invoice_file", "bank_details_file"]);
    if (!allowed.has(field)) {
      return res.status(400).json({ error: "validation_error", message: "Invalid field", details: { field } });
    }
    const rec = await base("expenses").find(id);
    const files = normalizeAttachments((rec.fields as any)[field]);
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= files.length) {
      return res.status(404).json({ error: "not_found", message: "Attachment not found" });
    }
    const file = files[i];
    if (!file || !file.url) {
      return res.status(404).json({ error: "not_found", message: "Attachment not found" });
    }
    return res.redirect(302, String(file.url));
  } catch (e) {
    next(e);
  }
});
