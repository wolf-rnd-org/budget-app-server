// src/utils/supabase.ts
import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';
// חשוב! לשים את הערכים האלו ב־.env (לא בקוד עצמו)
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables");
}

// יצירת קליינט ל־Server (service role -> יש הרשאות מלאות, רק בשרת!)
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
