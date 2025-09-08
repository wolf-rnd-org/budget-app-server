import { Router } from "express";
import { base } from "../utils/airtableConfig.js";

const r = Router();

// GET /categories
// Returns: [{ id, name }]
r.get("/", async (_req, res, next) => {
  try {
    const recs = await base("categories").select({ pageSize: 100 }).all();
    const out = recs.map((r) => ({
      id: r.id,
      name: String((r.get("Name") as any) ?? (r.get("name") as any) ?? ""),
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
});

export default r;

