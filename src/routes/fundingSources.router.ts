import { Router } from "express";
import { listFundingSources } from "../services/fundingSources.service.js";

const r = Router();

// GET /funding-sources  → רשימת תקציבים של השנה הנוכחית
r.get("/", async (_req, res) => {
  try {
    const items = await listFundingSources();
    res.json(items);
  } catch (err: any) {
    console.error("funding-sources failed:", err);
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
});

export default r;
