import { Router } from "express";
import { base } from "../utils/airtableConfig.js";
import { getCategoriesForProgram } from "../services/categories.service.js";

const r = Router();

r.get("/", async (req, res, next) => {
  try {
    const programId = String(req.query.program_id || "").trim();
    if (!programId) {
      return res.status(400).json({ error: "program_id is required" });
    }

    const cats = await getCategoriesForProgram(programId);
    return res.json(cats);
  } catch (err) {
    next(err);
  }
});

// GET /categories
// Returns: [{ id, name }]
// r.get("/", async (_req, res, next) => {
//   try {
//     const recs = await base("categories").select({ pageSize: 100 }).all();
//     const out = recs.map((r) => ({
//       id: r.id,
//       name: String((r.get("Name") as any) ?? (r.get("name") as any) ?? ""),
//     }));
//     res.json(out);
//   } catch (e) {
//     next(e);
//   }
// });

export default r;

