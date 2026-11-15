import { createClient } from '@supabase/supabase-js';
import type {
  AccountType,
  CommunityDuty,
  Landmark,
  MarketItem,
  QuizNode,
  UserState,
} from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const HAS_REAL_SUPABASE =
  Boolean(SUPABASE_URL) &&
  !SUPABASE_URL.includes('placeholder.supabase.co') &&
  Boolean(SUPABASE_ANON_KEY) &&
  SUPABASE_ANON_KEY !== 'placeholder-key';

export const supabase = createClient(
  HAS_REAL_SUPABASE ? SUPABASE_URL : 'https://placeholder.supabase.co',
  HAS_REAL_SUPABASE ? SUPABASE_ANON_KEY : 'placeholder-key'
);

export const WHITELISTED_ADMINS = ['sfarleaza', 'admin', 'frecventa77', 'curator'];


const KNOWN_BAND_HANDLES_KEY = 'frecventa77_band_handles_v1';

export function rememberBandHandle(handle: string): void {
  try {
    const clean = handle.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return;
    const list: string[] = JSON.parse(localStorage.getItem(KNOWN_BAND_HANDLES_KEY) || '[]');
    if (!list.includes(clean)) {
      localStorage.setItem(KNOWN_BAND_HANDLES_KEY, JSON.stringify([...list, clean]));
    }
  } catch {
    // ignore
  }
}

export function isKnownBandHandle(handle: string): boolean {
  try {
    const clean = handle.trim().toLowerCase().replace(/^@/, '');
    const list: string[] = JSON.parse(localStorage.getItem(KNOWN_BAND_HANDLES_KEY) || '[]');
    return list.includes(clean);
  } catch {
    return false;
  }
}

export function isWhitelistedAdminHandle(handle: string): boolean {
  const clean = handle.trim().toLowerCase().replace(/^@/, '');
  return WHITELISTED_ADMINS.includes(clean);
}

export interface ProfileRecord {
  id: string;
  handle: string;
  account_type: AccountType;
  points: number;
  unlocked_ids: string[];
  quiz_completed: boolean;
}

const LOCAL_SESSION_KEY = 'frecventa77_local_profile_v1';

function handleToEmail(handle: string): string {
  const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `${clean || 'operative'}@frecventa77.local`;
}

function buildLocalFallbackProfile(
  cleanHandle: string,
  accountType: AccountType = 'OPERATIVE'
): ProfileRecord {
  if (accountType === 'BAND') rememberBandHandle(cleanHandle);
  const effectiveRole: AccountType = isWhitelistedAdminHandle(cleanHandle)
    ? 'ADMIN'
    : accountType;

  // Check if a saved state already exists in localStorage for this handle
  try {
    const savedState = JSON.parse(localStorage.getItem('frecventa77_state') || 'null');
    if (savedState && savedState.handle?.toLowerCase() === cleanHandle.toLowerCase()) {
      const restored: ProfileRecord = {
        id: `local-${cleanHandle.toLowerCase()}`,
        handle: cleanHandle,
        account_type: effectiveRole,
        points: Math.max(100, savedState.points ?? 100),
        unlocked_ids:
          savedState.unlockedIds?.length > 0 ? savedState.unlockedIds : ['sfintii-62'],
        quiz_completed: Boolean(savedState.quizCompleted),
      };
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(restored));
      return restored;
    }
  } catch {
    // ignore storage parse issues
  }

  const profile: ProfileRecord = {
    id: `local-${cleanHandle.toLowerCase()}`,
    handle: cleanHandle,
    account_type: effectiveRole,
    points: 100,
    unlocked_ids: ['sfintii-62'],
    quiz_completed: false,
  };
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(profile));
  return profile;
}

export async function ensureAuth() {
  if (!HAS_REAL_SUPABASE) {
    return { id: 'local-device-user' };
  }
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) return data.user;
    const { data: anonData, error } = await supabase.auth.signInAnonymously();
    if (error || !anonData.user) return { id: 'local-device-user' };
    return anonData.user;
  } catch {
    return { id: 'local-device-user' };
  }
}

export async function registerOperative(
  rawHandle: string,
  passphrase: string,
  accountType: AccountType = 'OPERATIVE'
): Promise<ProfileRecord> {
  const cleanHandle = rawHandle.trim().replace(/^@/, '').slice(0, 24);
  if (!cleanHandle) {
    throw new Error('Operative handle is required.');
  }

  if (accountType === 'BAND') rememberBandHandle(cleanHandle);
  const effectiveRole: AccountType = isWhitelistedAdminHandle(cleanHandle)
    ? 'ADMIN'
    : accountType;

  if (!HAS_REAL_SUPABASE) {
    return buildLocalFallbackProfile(cleanHandle, effectiveRole);
  }

  try {
    const email = handleToEmail(cleanHandle);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: passphrase,
    });

    let user = data?.user ?? null;
    if (error || !user) {
      const anon = await supabase.auth.signInAnonymously();
      if (anon.error || !anon.data.user) {
        return buildLocalFallbackProfile(cleanHandle, effectiveRole);
      }
      user = anon.data.user;
    }

    const starterProfile: ProfileRecord = {
      id: user.id,
      handle: cleanHandle,
      account_type: effectiveRole,
      points: 100,
      unlocked_ids: ['sfintii-62'],
      quiz_completed: false,
    };

    await supabase.from('profiles').upsert({
      id: starterProfile.id,
      handle: starterProfile.handle,
      account_type: starterProfile.account_type,
      points: starterProfile.points,
      unlocked_ids: starterProfile.unlocked_ids,
      quiz_completed: starterProfile.quiz_completed,
    });

    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(starterProfile));
    return starterProfile;
  } catch {
    // Graceful offline / network-unreachable fallback so login never fails with NetworkError
    return buildLocalFallbackProfile(cleanHandle, effectiveRole);
  }
}

export async function loginOperative(
  rawHandle: string,
  passphrase: string
): Promise<ProfileRecord> {
  const cleanHandle = rawHandle.trim().replace(/^@/, '').slice(0, 24);
  if (!cleanHandle) {
    throw new Error('Operative handle is required.');
  }

  if (!HAS_REAL_SUPABASE) {
    return buildLocalFallbackProfile(cleanHandle, 'OPERATIVE');
  }

  try {
    const email = handleToEmail(cleanHandle);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: passphrase,
    });

    let user = data?.user ?? null;
    if (error || !user) {
      const anon = await supabase.auth.signInAnonymously();
      if (anon.error || !anon.data.user) {
        return buildLocalFallbackProfile(cleanHandle, 'OPERATIVE');
      }
      user = anon.data.user;
    }

    let { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      const byHandle = await supabase
        .from('profiles')
        .select('*')
        .ilike('handle', cleanHandle)
        .order('points', { ascending: false })
        .limit(1)
        .maybeSingle();
      existing = byHandle.data;
    }

    const resolvedRole: AccountType = isWhitelistedAdminHandle(cleanHandle)
      ? 'ADMIN'
      : (existing?.account_type as AccountType) ||
        (isKnownBandHandle(cleanHandle) ? 'BAND' : 'OPERATIVE');

    if (resolvedRole === 'BAND') rememberBandHandle(cleanHandle);

    const profile: ProfileRecord = {
      id: user.id,
      handle: existing?.handle || cleanHandle,
      account_type: resolvedRole,
      points: Math.max(100, existing?.points ?? 100),
      unlocked_ids:
        existing?.unlocked_ids && existing.unlocked_ids.length > 0
          ? existing.unlocked_ids
          : ['sfintii-62'],
      quiz_completed: Boolean(existing?.quiz_completed),
    };

    await supabase.from('profiles').upsert({
      id: profile.id,
      handle: profile.handle,
      account_type: profile.account_type,
      points: profile.points,
      unlocked_ids: profile.unlocked_ids,
      quiz_completed: profile.quiz_completed,
    });

    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(profile));
    return profile;
  } catch {
    // Graceful offline / network-unreachable fallback so login never fails with NetworkError
    return buildLocalFallbackProfile(cleanHandle, 'OPERATIVE');
  }
}

export async function burnOperativeAccount(): Promise<void> {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  if (!HAS_REAL_SUPABASE) return;
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from('profiles').delete().eq('id', data.user.id);
    }
    await supabase.auth.signOut();
  } catch {
    // ignore network error on account burn
  }
}

export async function loadActiveSessionProfile(): Promise<ProfileRecord | null> {
  if (!HAS_REAL_SUPABASE) {
    try {
      const local = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
      if (local && local.handle) {
        return {
          ...local,
          account_type: isWhitelistedAdminHandle(local.handle)
            ? 'ADMIN'
            : local.account_type || (isKnownBandHandle(local.handle) ? 'BAND' : 'OPERATIVE'),
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const local = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
      return local && local.handle ? local : null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      const local = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
      return local && local.handle ? local : null;
    }

    const effectiveType: AccountType = isWhitelistedAdminHandle(profile.handle)
      ? 'ADMIN'
      : (profile.account_type as AccountType) || (isKnownBandHandle(profile.handle) ? 'BAND' : 'OPERATIVE');

    return {
      id: profile.id,
      handle: profile.handle,
      account_type: effectiveType,
      points: Math.max(100, profile.points ?? 100),
      unlocked_ids:
        profile.unlocked_ids && profile.unlocked_ids.length > 0
          ? profile.unlocked_ids
          : ['sfintii-62'],
      quiz_completed: Boolean(profile.quiz_completed),
    };
  } catch {
    try {
      const local = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
      return local && local.handle ? local : null;
    } catch {
      return null;
    }
  }
}

export async function syncProfileState(state: UserState): Promise<void> {
  if (!state.handle) return;
  const effectiveType: AccountType = isWhitelistedAdminHandle(state.handle)
    ? 'ADMIN'
    : state.accountType;

  try {
    localStorage.setItem(
      LOCAL_SESSION_KEY,
      JSON.stringify({
        id: `local-${state.handle.toLowerCase()}`,
        handle: state.handle,
        account_type: effectiveType,
        points: state.points,
        unlocked_ids: state.unlockedIds,
        quiz_completed: state.quizCompleted,
      })
    );
  } catch {
    // ignore storage quota errors
  }

  if (!HAS_REAL_SUPABASE) return;

  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;

    await supabase.from('profiles').upsert({
      id: data.user.id,
      handle: state.handle,
      account_type: effectiveType,
      points: state.points,
      unlocked_ids: state.unlockedIds,
      quiz_completed: state.quizCompleted,
    });
  } catch {
    // silently ignore network issues during background sync
  }
}

export async function logoutOperative(): Promise<void> {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  if (!HAS_REAL_SUPABASE) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore network error on logout
  }
}

// Local + Shared Custom Registry Keys (Admin & Band Created Content)
const CUSTOM_QUIZZES_KEY = 'frecventa77_custom_quizzes_v1';
const CUSTOM_LANDMARKS_KEY = 'frecventa77_custom_landmarks_v1';
const CUSTOM_MARKET_KEY = 'frecventa77_custom_market_v1';
const CUSTOM_DUTIES_KEY = 'frecventa77_custom_duties_v1';

export function getCustomQuizzes(): QuizNode[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_QUIZZES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCustomQuizzes(items: QuizNode[]): void {
  localStorage.setItem(CUSTOM_QUIZZES_KEY, JSON.stringify(items));
}

export function getCustomLandmarks(): Landmark[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_LANDMARKS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCustomLandmarks(items: Landmark[]): void {
  localStorage.setItem(CUSTOM_LANDMARKS_KEY, JSON.stringify(items));
}

export function getCustomMarketItems(): MarketItem[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_MARKET_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCustomMarketItems(items: MarketItem[]): void {
  localStorage.setItem(CUSTOM_MARKET_KEY, JSON.stringify(items));
}

export function getCustomDuties(): CommunityDuty[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_DUTIES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCustomDuties(items: CommunityDuty[]): void {
  localStorage.setItem(CUSTOM_DUTIES_KEY, JSON.stringify(items));
}
