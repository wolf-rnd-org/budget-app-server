// src/routes/auth.routes.ts
import { Router } from "express";
import { z } from "zod";
import { getUserClaims } from "../services/auth.service.js";

const r = Router();

const QuerySchema = z.object({
  application_name: z.string().default("BUDGETS"), // אפשר לשים שם דיפולטי או לחייב פרמטר
});

const AuthContextSchema = z.object({
  userId: z.number(),
});

r.get("/me", async (req, res, next) => {
  try {
    console.log("arrive");
    
    const { application_name } = QuerySchema.parse(req.query);
    // const { userId } = AuthContextSchema.parse((req as any).auth ?? 2);
    let userId = 2; // לזמן קצר, עד שנוסיף אימות
    console.log(userId, application_name);

    const me = await getUserClaims(userId, application_name);
    res.json(me);
  } catch (e) {
    next(e);
  }
});

export default r;
