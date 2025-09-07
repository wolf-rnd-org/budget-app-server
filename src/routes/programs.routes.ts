import { Router } from "express";
import * as svc from "../services/programs.service.js";
import { getProgramSummary } from "../services/programs.service.js";

const r = Router();

// GET /programs           → כל התוכניות (מוק)
r.get("/", async (_req, res, next) => {
  try {
    const data = await svc.listAll();
    res.json(data);
  } catch (e) { next(e); }
});

r.get("/summary", async (req, res, next) => {
  try {
    const programId = String(req.query.program_id || "").trim();
    if (!programId) return res.status(400).json({ error: "program_id is required" });

    const summary = await getProgramSummary(programId);
    if (!summary) return res.status(404).json({ error: `No summary for program_id "${programId}"` });

    res.json(summary);
  } catch (e) { next(e); }
});

// GET /programs/:param    → קודם כ-userId, אם אין/ריק ננסה כ-programId
r.get("/:param", async (req, res, next) => {
  try {
    const param = String(req.params.param);
console.log(`programs.routes: param=${param}` );

    // 1) נסה כ-userId (במוק יכול פשוט להחזיר את כולן)
    const byUser = await svc.listByUserId(param);
    if (Array.isArray(byUser) && byUser.length > 0) {
      return res.json(byUser);
    }

    // 2) נסה כ-programId יחיד
    const byId = await svc.getById(param);
    if (byId) return res.json(byId);

    // 3) לא נמצא כלום
    return res.status(404).json({ error: `No programs for userId "${param}" and no program with id "${param}"` });
  } catch (e) { next(e); }
});

export default r;
