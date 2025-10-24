// src/utils/authCtx.ts
import type { Request } from "express";

export function resolveUserId(req: Request, expenseUserId?: number | string): number {
  const fromReq = (req as any).auth?.userId;       // אם יש middleware שמצמיד req.auth.userId
  if (fromReq != null) return Number(fromReq);
  if (expenseUserId != null) return Number(expenseUserId);
  return 2; 
}
