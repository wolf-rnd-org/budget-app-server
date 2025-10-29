import { supabase } from "../utils/supabase.js";
import type { Request } from "express";

export type MeResponse = {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  actions: string[];
};

export async function getUserClaims(userId: number, applicationName: string): Promise<MeResponse> {
  // 1) שליפת פרטי המשתמש
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("user_id, email, first_name, last_name")
    .eq("user_id", userId)
    .single();

  if (userErr || !userRow) throw userErr ?? new Error("User not found");

  // 2) שליפת הרשאות דרך ה־RPC
  const { data: actionRows, error: rpcErr } = await supabase.rpc("get_user_claims", {
    p_user_id: userId,
    p_application_name: applicationName,
  });

  if (rpcErr) throw rpcErr;

  const actions: string[] = (actionRows ?? []).map((r: any) => r.action_name);

  return {
    userId: userRow.user_id,
    email: userRow.email,
    firstName: userRow.first_name,
    lastName: userRow.last_name,
    actions,
  };
}

const AUTH_BASE_URL = process.env.AUTH_BASE_URL!;


/**
 * Lookup a user's email by numeric user id via the Auth-Service.
 * Expected endpoint shape: GET `${AUTH_BASE_URL}/auth/email/:id` → { email: string }
 */
export async function getEmailByUserId(userId: number): Promise<string | undefined> {
  try {
    const url = `${AUTH_BASE_URL}/auth/email/${encodeURIComponent(String(userId))}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } as any });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { email?: string };
    const email = typeof data?.email === "string" ? data.email.trim() : undefined;
    return email || undefined;
  } catch {
    return undefined;
  }
}


// /** פונקציה קטנה לחילוץ ה־Authorization header */
// function extractAuthHeader(req: Request): string | undefined {
//   const h = req.headers.authorization;
//   if (typeof h === "string" && /^Bearer\s+\S+/i.test(h)) return h;
//   // לפיתוח בלבד – אפשר גם לתמוך בפרמטר token ב-URL
//   const q = typeof req.query.token === "string" ? req.query.token : undefined;
//   if (q) return `Bearer ${q}`;
//   return undefined;
// }


// /** זיהוי המשתמש המחובר דרך ה-auth-service */
// export async function getCurrentUser(req: Request, applicationName = "BUDGETS"): Promise<MeResponse> {
//   const token = extractAuthHeader(req);
//   if (!token) {
//     const err = new Error("Missing Bearer token");
//     (err as any).status = 401;
//     throw err;
//   }
//   const url = `${AUTH_BASE_URL}/auth/me?application_name=${encodeURIComponent(applicationName)}`;
//   const res = await fetch(url, { headers: { Authorization: token, Accept: "application/json" } as any });
//   if (!res.ok) {
//     const text = await res.text();
//     const err = new Error(`auth/me failed: ${res.status} ${text}`);
//     (err as any).status = res.status;
//     throw err;
//   }
//   return (await res.json()) as MeResponse;
// }

// /** נוח: להחזיר רק אימייל; אם אין טוקן/שגיאה – undefined */
// export async function getCurrentUserEmail(req: Request): Promise<string | undefined> {
//   try {
//     const me = await getCurrentUser(req, "BUDGETS");
//     return me?.email || undefined;
//   } catch {
//     return undefined;
//   }
// }
