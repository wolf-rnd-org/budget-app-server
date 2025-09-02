import { Router } from "express";
import { getBudgetSummary } from "../services/budget.service.js";

const r = Router();

// GET /budget/summary?program_id=...
r.get("/summary", async (req, res, next) => {
  try {
    const programId = String(req.query.program_id || "").trim();
    if (!programId) return res.status(400).json({ error: "program_id is required" });

    const summary = await getBudgetSummary(programId);
    if (!summary) return res.status(404).json({ error: `No summary for program_id "${programId}"` });

    res.json(summary);
  } catch (e) { next(e); }
});

export default r;
