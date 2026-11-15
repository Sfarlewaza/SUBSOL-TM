import { ensureAuth, supabase } from "./supabaseClient";
import type { UserState } from "../types";

export async function syncProfileToDb(state: UserState): Promise<void> {
  if (!state.unlocked || !state.handle.trim()) return;
  try {
    const user = await ensureAuth();
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        handle: state.handle.trim(),
        points: state.points,
        unlocked_ids: state.unlockedIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  } catch (err) {
    console.warn("Profile DB sync skipped:", err);
  }
}

export async function fetchLeaderboard(limit = 10) {
  const { data } = await supabase
    .from("profiles")
    .select("handle, points, unlocked_ids")
    .order("points", { ascending: false })
    .limit(limit);
  return data ?? [];
}
