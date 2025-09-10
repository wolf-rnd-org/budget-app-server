import { Router } from "express";
import { listFundingSources } from "../services/fundingSources.service.js";

const r = Router();

// app.use("/budgets/funding-sources", r)
r.get("/", async (req, res) => {
  try {
    const programId = (req.query.program_id as string | undefined)?.trim();
    const items = await listFundingSources(programId);
    res.json(items);
  } catch (err: any) {
    console.error("funding-sources failed:", err);
    res.status(500).json({ error: "Failed to fetch funding sources" });
  }
});

export default r;
