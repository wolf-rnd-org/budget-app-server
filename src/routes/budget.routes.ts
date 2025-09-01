import { Router } from "express";
import { z } from "zod";
import { getBudgetSummary } from "../services/budget.service.js";

const r = Router();

const QuerySchema = z.object({
  program_id: z.union([z.string(), z.coerce.number()]),
});

r.get("/summary", async (req, res, next) => {
  try {
    const { program_id } = QuerySchema.parse(req.query);
    const summary = await getBudgetSummary(program_id);
    res.json(summary);
  } catch (e) {
    next(e);
  }
});

export default r;
