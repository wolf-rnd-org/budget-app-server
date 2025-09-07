import { Router } from "express";
import { z } from "zod";
import { listExpensesForUserPrograms } from "../services/expenses.service.js";
// no-op

const r = Router();

// Helpers to shape consistent error responses
function badRequest(details: Record<string, string>) {
  return { error: "validation_error", message: "Invalid parameters", details };
}

//

// No auth context: accept user_id and load user's programs from Airtable.

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

// GET /expenses
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
console.log(base.data);

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

export default r;
