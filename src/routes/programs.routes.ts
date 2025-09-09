import { Router } from "express";
import * as svc from "../services/programs.service.js";
import { getProgramSummary } from "../services/programs.service.js";
import { z } from "zod";

const r = Router();

// GET /programs           → כל התוכניות (מוק)
r.get("/", async (_req, res, next) => {
  try {
    // Include user_ids list for each program
    const data = await (svc as any).listAllWithUsers();
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

// POST /programs/assign-user
// Body: { userId: string|number, program_id: string }
// Appends userId to the program's user_ids multi-select if not present
r.post("/assign-user", async (req, res, next) => {
  try {
    const Body = z.object({
      userId: z.union([z.string(), z.number()]).transform(String).refine(v => v.trim().length > 0, "userId required"),
      program_id: z.string().min(1),
    });
    const payload = Body.parse(req.body);

    const result = await svc.assignUserToProgram({ program_id: payload.program_id, userId: payload.userId });
    res.json(result);
  } catch (e) {
    if ((e as any)?.issues) return res.status(422).json({ error: "validation_error", issues: (e as any).issues });
    if ((e as any)?.message === "Invalid program_id") return res.status(422).json({ error: "Invalid program_id" });
    next(e);
  }
});

// POST /programs/:userId/assign-user
// Params: userId; Body: { program_id } or { program_ids: string[] }
// Same behavior as /programs/assign-user but userId arrives in params
r.post("/:userId/assign-user", async (req, res, next) => {
  try {
    const Params = z.object({
      userId: z.union([z.string(), z.number()]).transform(String).refine(v => v.trim().length > 0, "userId required"),
    });
    const Body = z.union([
      z.object({ program_id: z.string().min(1) }),
      z.object({ program_ids: z.array(z.string().min(1)).min(1) }),
    ]);

    const params = Params.parse(req.params);
    const body = Body.parse(req.body ?? {});

    if ("program_ids" in body) {
      const result = await (svc as any).assignUserToPrograms({ program_ids: body.program_ids, userId: params.userId });
      return res.json(result);
    } else {
      const result = await svc.assignUserToProgram({ program_id: (body as any).program_id, userId: params.userId });
      return res.json(result);
    }
  } catch (e) {
    if ((e as any)?.issues) return res.status(422).json({ error: "validation_error", issues: (e as any).issues });
    if ((e as any)?.message === "Invalid program_id") return res.status(422).json({ error: "Invalid program_id" });
    next(e);
  }
});

// POST /programs/:program_id/assign-user/:userId
// Both program_id and userId arrive as URL params
r.post("/:program_id/assign-user/:userId", async (req, res, next) => {
  try {
    const Params = z.object({
      program_id: z.string().min(1),
      userId: z.union([z.string(), z.number()]).transform(String).refine(v => v.trim().length > 0, "userId required"),
    });
    const params = Params.parse(req.params);

    const result = await svc.assignUserToProgram({ program_id: params.program_id, userId: params.userId });
    res.json(result);
  } catch (e) {
    if ((e as any)?.issues) return res.status(422).json({ error: "validation_error", issues: (e as any).issues });
    if ((e as any)?.message === "Invalid program_id") return res.status(422).json({ error: "Invalid program_id" });
    next(e);
  }
});

export default r;
