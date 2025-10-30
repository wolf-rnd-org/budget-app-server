// src/routes/auth.routes.ts
import { Router } from "express";
import { z } from "zod";
import { getUserClaims, getEmailByUserId } from "../services/auth.service.js";

const r = Router();

const QuerySchema = z.object({
  application_name: z.string().default("BUDGETS"), // אפשר לשים שם דיפולטי או לחייב פרמטר
});

const AuthContextSchema = z.object({
  userId: z.number(),
});

r.get("/me", async (req, res, next) => {
  try {
    const { application_name } = QuerySchema.parse(req.query);
    // const { userId } = AuthContextSchema.parse((req as any).auth ?? 2);
    let userId = 2; // לזמן קצר, עד שנוסיף אימות

    const me = await getUserClaims(userId, application_name);
    res.json(me);
  } catch (e) {
    next(e);
  }
});

// Lightweight proxy endpoint to fetch an email by user id via Auth-Service
// GET /auth/email/:id -> { email: string | null }
r.get("/email/:id", async (req, res, next) => {
  try {
    const idRaw = req.params.id;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "validation_error", message: "Invalid user id" });
    }
    const email = await getEmailByUserId(id);
    return res.json({ email: email ?? null });
  } catch (e) {
    next(e);
  }
});

export default r;
