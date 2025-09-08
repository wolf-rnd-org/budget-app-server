// src/routes/budgets.routes.ts
import { Router } from "express";
import { z } from "zod";
import { getBudgetSummary } from "../services/budgets.service.js";

const r = Router();

// סכמת ולידציה לשאילתא
const QuerySchema = z.object({
  program_id: z.string().min(1, "program_id is required"),
});

// GET /budget/summary?program_id=24640
r.get("/summary", async (req, res, next) => {
  try {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }

    const summary = await getBudgetSummary(parsed.data.program_id);
    if (!summary) {
      return res.status(404).json({ error: "Program not found" });
    }

    return res.json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
});

// אופציה נוספת: GET /budgets/:programId/summary  (נוח לפראמטר בנתיב)
r.get("/:programId/summary", async (req, res, next) => {
  try {
    const programId = String(req.params.programId || "").trim();
    if (!programId) return res.status(400).json({ error: "programId is required" });

    const summary = await getBudgetSummary(programId);
    if (!summary) {
      return res.status(404).json({ error: "Program not found" });
    }

    return res.json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
});

export default r;
