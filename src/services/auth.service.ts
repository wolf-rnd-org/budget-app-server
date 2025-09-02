import { supabase } from "../utils/supabase.js";

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
