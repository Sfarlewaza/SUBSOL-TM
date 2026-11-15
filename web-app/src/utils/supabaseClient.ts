import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zmanxvllbikukocnodlv.supabase.co";
const SUPABASE_KEY = "sb_publishable_pj7pJdhoo6iQvklMUw-Vlw_m1jYksp1";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function ensureAuth() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session) return sessionData.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}
