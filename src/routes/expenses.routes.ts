import { Router } from "express";
import * as svc from "../services/expenses.service.js";

const r = Router();

// GET /expenses?userId=101&programId=24640&page=1&pageSize=20
r.get("/", async (req, res, next) => {
  try {
    const userId = Number(req.query.userId);
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const programId = req.query.programId ? String(req.query.programId) : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;

    const result = await svc.list({ 
      userId, 
      ...(programId !== undefined && { programId }), 
      page, 
      pageSize 
    });
    res.json(result); // { data, hasMore, totalCount }
  } catch (e) { next(e); }
});

export default r;
