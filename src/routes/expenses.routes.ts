import { Router } from "express";
import * as svc from "../services/expenses.service.js";
import { getExpenses } from "../services/expenses.service.js";

const r = Router();

// GET /expenses?userId=101&programId=24640&page=1&pageSize=20
r.get("/", async (req, res, next) => {
  try {
    const programId = String(req.query.program_id || "").trim();
    if (!programId) return res.status(400).json({ error: "program_id is required" });

    const expenses = await getExpenses(programId);
    
    res.json(expenses);
  } catch (e) { next(e); }
});


export default r;
