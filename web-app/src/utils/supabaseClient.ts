import { createClient } from "@supabase/supabase-js";
import type { UserState } from "../types";

const SUPABASE_URL = "https://zmanxvllbikukocnodlv.supabase.co";
const SUPABASE_KEY = "sb_publishable_pj7pJdhoo6iQvklMUw-Vlw_m1jYksp1";
const ACTIVE_PROFILE_ID_KEY = "frecventa77_profile_id";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface ProfileRecord {
  id: string;
  handle: string;
  points: number;
  unlocked_ids: string[];
  quiz_completed: boolean;
}

function generateSafeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function hashPassword(handleSlug: string, password: string): Promise<string> {
  const salted = `frecventa77:${handleSlug}:${password}`; if (typeof crypto !== "undefined" && crypto.subtle) { const data = new TextEncoder().encode(salted); const hashBuffer = await crypto.subtle.digest("SHA-256", data); return Array.from(new Uint8Array(hashBuffer)) .map((b) => b.toString(16).padStart(2, "0")) .join(""); } let h1 = 0xdeadbeef; let h2 = 0x41c6ce57; for (let i = 0; i < salted.length; i++) { const ch = salted.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0"); }  export async function ensureAuth() { const { data: sessionData, error: sessionError } = await supabase.auth.getSession(); if (sessionError) throw new Error(sessionError.message); if (sessionData.session?.user) return sessionData.session.user;  const { data, error } = await supabase.auth.signInAnonymously(); if (error) throw new Error(error.message); if (!data.user) throw new Error("ANONYMOUS AUTH DISABLED IN SUPABASE."); return data.user; }  export async function registerOperative( rawHandle: string, password: string ): Promise<ProfileRecord> { const display = rawHandle.trim().replace(/^@+/, ""); const slug = display.toLowerCase();  if (slug.length < 3) { throw new Error("HANDLE MUST BE AT LEAST 3 CHARACTERS."); } if (password.length < 6) { throw new Error("PASSWORD MUST BE AT LEAST 6 CHARACTERS."); }  await ensureAuth();  const { data: existing, error: checkError } = await supabase .from("profiles") .select("id") .ilike("handle", display) .maybeSingle();  if (checkError) throw new Error(checkError.message); if (existing) { throw new Error(`HANDLE @${display.toUpperCase()} ALREADY TAKEN. USE [SIGN IN].`);
  }

  const passwordHash = await hashPassword(slug, password);
  const newId = generateSafeUuid();

  const { error: insertError } = await supabase.from("profiles").insert({
    id: newId,
    handle: display,
    password_hash: passwordHash,
    points: 0,
    unlocked_ids: [],
    quiz_completed: false,
    updated_at: new Date().toISOString(),
  });

  if (insertError) throw new Error(insertError.message);

  localStorage.setItem(ACTIVE_PROFILE_ID_KEY, newId);
  return {
    id: newId,
    handle: display,
    points: 0,
    unlocked_ids: [],
    quiz_completed: false,
  };
}

export async function loginOperative(
  rawHandle: string,
  password: string
): Promise<ProfileRecord> {
  const display = rawHandle.trim().replace(/^@+/, "");
  const slug = display.toLowerCase();

  if (!slug || !password) {
    throw new Error("ENTER BOTH OPERATIVE HANDLE AND PASSWORD.");
  }

  await ensureAuth();
  const passwordHash = await hashPassword(slug, password);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, handle, password_hash, points, unlocked_ids, quiz_completed")
    .ilike("handle", display)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile || profile.password_hash !== passwordHash) {
    throw new Error("INVALID HANDLE OR PASSWORD.");
  }

  localStorage.setItem(ACTIVE_PROFILE_ID_KEY, profile.id);
  return {
    id: profile.id,
    handle: profile.handle,
    points: profile.points,
    unlocked_ids: profile.unlocked_ids || [],
    quiz_completed: Boolean(profile.quiz_completed),
  };
}

export async function loadActiveSessionProfile(): Promise<ProfileRecord | null> {
  const profileId = localStorage.getItem(ACTIVE_PROFILE_ID_KEY);
  if (!profileId) return null;

  await ensureAuth();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, points, unlocked_ids, quiz_completed")
    .eq("id", profileId)
    .maybeSingle();

  return (profile as ProfileRecord) || null;
}

export async function syncProfileState(state: UserState): Promise<void> {
  const profileId = localStorage.getItem(ACTIVE_PROFILE_ID_KEY);
  if (!state.unlocked || !profileId) return;

  try {
    await ensureAuth();
    await supabase
      .from("profiles")
      .update({
        points: state.points,
        unlocked_ids: state.unlockedIds,
        quiz_completed: state.quizCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
  } catch (err) {
    console.warn("Profile sync skipped:", err);
  }
}

export async function logoutOperative(): Promise<void> {
  localStorage.removeItem(ACTIVE_PROFILE_ID_KEY);
}

export async function burnOperativeAccount(handleToScrub?: string): Promise<void> {
  const profileId = localStorage.getItem(ACTIVE_PROFILE_ID_KEY);
  await ensureAuth();

  if (profileId) {
    const { error } = await supabase.from("profiles").delete().eq("id", profileId);
    if (error) throw new Error(error.message);
  }

  // Scrub deleted handle on forum messages so threads stay readable with zero dead user profiles
  if (handleToScrub && handleToScrub.trim()) {
    await supabase
      .from("messages")
      .update({ nickname: "[DEAD SIGNAL // DELETED]" })
      .ilike("nickname", handleToScrub.trim());
  }

  localStorage.removeItem(ACTIVE_PROFILE_ID_KEY);
}
