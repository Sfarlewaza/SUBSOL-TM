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

async function hashPassphrase(raw: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(`f77:${raw.trim()}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return btoa(unescape(encodeURIComponent(`f77:${raw.trim()}`)));
  }
}

function buildLocalFallbackProfile(
  cleanHandle: string,
  accountType: AccountType = 'OPERATIVE'
): ProfileRecord {
  if (accountType === 'BAND') rememberBandHandle(cleanHandle);
  const effectiveRole: AccountType = isWhitelistedAdminHandle(cleanHandle)
    ? 'ADMIN'
    : accountType;

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
    const passHash = await hashPassphrase(passphrase);
    const email = handleToEmail(cleanHandle);

    // Check if handle already exists in Supabase profiles
    const { data: existingByHandle } = await supabase
      .from('profiles')
      .select('*')
      .ilike('handle', cleanHandle)
      .limit(1)
      .maybeSingle();

    if (existingByHandle) {
      if (existingByHandle.passphrase_hash && existingByHandle.passphrase_hash !== passHash) {
        throw new Error('Handle already registered with a different passphrase.');
      }
      const restoredRole: AccountType = isWhitelistedAdminHandle(cleanHandle)
        ? 'ADMIN'
        : (existingByHandle.account_type as AccountType) || effectiveRole;
      if (restoredRole === 'BAND') rememberBandHandle(cleanHandle);

      const profile: ProfileRecord = {
        id: existingByHandle.id,
        handle: existingByHandle.handle,
        account_type: restoredRole,
        points: Math.max(100, existingByHandle.points ?? 100),
        unlocked_ids:
          existingByHandle.unlocked_ids?.length > 0
            ? existingByHandle.unlocked_ids
            : ['sfintii-62'],
        quiz_completed: Boolean(existingByHandle.quiz_completed),
      };
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(profile));
      return profile;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: passphrase,
    });

    let userId = data?.user?.id ?? null;
    if (error || !userId) {
      const anon = await supabase.auth.signInAnonymously();
      userId = anon.data?.user?.id ?? crypto.randomUUID();
    }

    const starterProfile: ProfileRecord = {
      id: userId,
      handle: cleanHandle,
      account_type: effectiveRole,
      points: 100,
      unlocked_ids: ['sfintii-62'],
      quiz_completed: false,
    };

    const { error: upsertErr } = await supabase.from('profiles').upsert(
      {
        id: starterProfile.id,
        handle: starterProfile.handle,
        passphrase_hash: passHash,
        account_type: starterProfile.account_type,
        points: starterProfile.points,
        unlocked_ids: starterProfile.unlocked_ids,
        quiz_completed: starterProfile.quiz_completed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'handle' }
    );

    if (upsertErr) {
      console.error('Supabase profile register upsert error:', upsertErr.message);
    }

    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(starterProfile));
    return starterProfile;
  } catch (err) {
    if (err instanceof Error && err.message.includes('already registered')) {
      throw err;
    }
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
    return buildLocalFallbackProfile(
      cleanHandle,
      isKnownBandHandle(cleanHandle) ? 'BAND' : 'OPERATIVE'
    );
  }

  try {
    const passHash = await hashPassphrase(passphrase);
    const email = handleToEmail(cleanHandle);

    // Try standard email/password auth first
    const { data } = await supabase.auth.signInWithPassword({
      email,
      password: passphrase,
    });

    // Always look up the canonical profile row by handle so cross-device logins find the exact account & role
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .ilike('handle', cleanHandle)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.passphrase_hash && existing.passphrase_hash !== passHash) {
      throw new Error('Invalid passphrase for this handle.');
    }

    let profileId = existing?.id || data?.user?.id || null;
    if (!profileId) {
      const anon = await supabase.auth.signInAnonymously();
      profileId = anon.data?.user?.id ?? crypto.randomUUID();
    }

    const resolvedRole: AccountType = isWhitelistedAdminHandle(cleanHandle)
      ? 'ADMIN'
      : (existing?.account_type as AccountType) ||
        (isKnownBandHandle(cleanHandle) ? 'BAND' : 'OPERATIVE');

    if (resolvedRole === 'BAND') rememberBandHandle(cleanHandle);

    const profile: ProfileRecord = {
      id: profileId,
      handle: existing?.handle || cleanHandle,
      account_type: resolvedRole,
      points: Math.max(100, existing?.points ?? 100),
      unlocked_ids:
        existing?.unlocked_ids && existing.unlocked_ids.length > 0
          ? existing.unlocked_ids
          : ['sfintii-62'],
      quiz_completed: Boolean(existing?.quiz_completed),
    };

    await supabase.from('profiles').upsert(
      {
        id: profile.id,
        handle: profile.handle,
        passphrase_hash: existing?.passphrase_hash || passHash,
        account_type: profile.account_type,
        points: profile.points,
        unlocked_ids: profile.unlocked_ids,
        quiz_completed: profile.quiz_completed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'handle' }
    );

    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(profile));
    return profile;
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid passphrase')) {
      throw err;
    }
    return buildLocalFallbackProfile(
      cleanHandle,
      isKnownBandHandle(cleanHandle) ? 'BAND' : 'OPERATIVE'
    );
  }
}

export async function burnOperativeAccount(rawHandle?: string): Promise<void> {
  const localRaw = localStorage.getItem(LOCAL_SESSION_KEY);
  localStorage.removeItem(LOCAL_SESSION_KEY);
  localStorage.removeItem('frecventa77_state');

  let targetHandle = rawHandle;
  if (!targetHandle && localRaw) {
    try {
      const parsed = JSON.parse(localRaw);
      targetHandle = parsed?.handle;
    } catch {
      // ignore
    }
  }

  if (!HAS_REAL_SUPABASE) return;
  try {
    if (targetHandle) {
      const clean = targetHandle.trim().replace(/^@/, '');
      await supabase.from('profiles').delete().ilike('handle', clean);
    }
    const { data: authUser } = await supabase.auth.getUser();
    if (authUser.user) {
      await supabase.from('profiles').delete().eq('id', authUser.user.id);
    }
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Error burning account on Supabase:', err);
  }
}

export async function loadActiveSessionProfile(): Promise<ProfileRecord | null> {
  let localProfile: ProfileRecord | null = null;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
    if (parsed && parsed.handle) {
      localProfile = parsed;
    }
  } catch {
    localProfile = null;
  }

  if (!HAS_REAL_SUPABASE) {
    if (!localProfile) return null;
    return {
      ...localProfile,
      account_type: isWhitelistedAdminHandle(localProfile.handle)
        ? 'ADMIN'
        : localProfile.account_type ||
          (isKnownBandHandle(localProfile.handle) ? 'BAND' : 'OPERATIVE'),
    };
  }

  try {
    // Prefer refreshing the locally stored handle from Supabase so cross-device updates (points, BAND role) sync on reload
    if (localProfile?.handle) {
      const { data: remoteByHandle } = await supabase
        .from('profiles')
        .select('*')
        .ilike('handle', localProfile.handle)
        .limit(1)
        .maybeSingle();

      if (remoteByHandle) {
        const effectiveType: AccountType = isWhitelistedAdminHandle(remoteByHandle.handle)
          ? 'ADMIN'
          : (remoteByHandle.account_type as AccountType) ||
            localProfile.account_type ||
            (isKnownBandHandle(remoteByHandle.handle) ? 'BAND' : 'OPERATIVE');

        if (effectiveType === 'BAND') rememberBandHandle(remoteByHandle.handle);

        const merged: ProfileRecord = {
          id: remoteByHandle.id,
          handle: remoteByHandle.handle,
          account_type: effectiveType,
          points: Math.max(100, remoteByHandle.points ?? localProfile.points ?? 100),
          unlocked_ids:
            remoteByHandle.unlocked_ids?.length > 0
              ? remoteByHandle.unlocked_ids
              : localProfile.unlocked_ids || ['sfintii-62'],
          quiz_completed: Boolean(remoteByHandle.quiz_completed || localProfile.quiz_completed),
        };
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(merged));
        return merged;
      }
      return localProfile;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) return null;

    const effectiveType: AccountType = isWhitelistedAdminHandle(profile.handle)
      ? 'ADMIN'
      : (profile.account_type as AccountType) ||
        (isKnownBandHandle(profile.handle) ? 'BAND' : 'OPERATIVE');

    if (effectiveType === 'BAND') rememberBandHandle(profile.handle);

    const hydrated: ProfileRecord = {
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
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(hydrated));
    return hydrated;
  } catch {
    return localProfile;
  }
}

export async function syncProfileState(state: UserState): Promise<void> {
  if (!state.handle) return;
  const effectiveType: AccountType = isWhitelistedAdminHandle(state.handle)
    ? 'ADMIN'
    : state.accountType;

  if (effectiveType === 'BAND') rememberBandHandle(state.handle);

  let existingId = `local-${state.handle.toLowerCase()}`;
  try {
    const prevLocal = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
    if (prevLocal?.id) existingId = prevLocal.id;
    localStorage.setItem(
      LOCAL_SESSION_KEY,
      JSON.stringify({
        id: existingId,
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
    const rowId = existingId.startsWith('local-') ? crypto.randomUUID() : existingId;
    await supabase.from('profiles').upsert(
      {
        id: rowId,
        handle: state.handle,
        account_type: effectiveType,
        points: state.points,
        unlocked_ids: state.unlockedIds,
        quiz_completed: state.quizCompleted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'handle' }
    );
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

// ============================================================================
// SHARED CUSTOM REGISTRIES (Local Cache + Real-Time Supabase Table Sync)
// ============================================================================
const CUSTOM_QUIZZES_KEY = 'frecventa77_custom_quizzes_v1';
const CUSTOM_LANDMARKS_KEY = 'frecventa77_custom_landmarks_v1';
const CUSTOM_MARKET_KEY = 'frecventa77_custom_market_v1';
const CUSTOM_DUTIES_KEY = 'frecventa77_custom_duties_v1';

async function pushRegistryToSupabase<T extends { id: string }>(
  table: string,
  items: T[],
  mapExtra?: (item: T) => Record<string, unknown>
): Promise<void> {
  if (!HAS_REAL_SUPABASE) return;
  try {
    if (items.length > 0) {
      const rows = items.map((item) => ({
        id: item.id,
        payload: item,
        updated_at: new Date().toISOString(),
        ...(mapExtra ? mapExtra(item) : {}),
      }));
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) console.error(`Supabase upsert failed on ${table}:`, error.message);
    }

    // Remove any rows deleted in Admin/Band console
    const { data: existingRows } = await supabase.from(table).select('id');
    if (Array.isArray(existingRows)) {
      const keepIds = new Set(items.map((i) => i.id));
      const toDelete = existingRows.map((r) => r.id).filter((id) => !keepIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from(table).delete().in('id', toDelete);
      }
    }
  } catch (err) {
    console.error(`Supabase sync exception on ${table}:`, err);
  }
}

export async function hydrateSharedRegistriesFromSupabase(): Promise<boolean> {
  if (!HAS_REAL_SUPABASE) return false;
  try {
    const [lmRes, dutyRes, mktRes, quizRes] = await Promise.all([
      supabase.from('custom_landmarks').select('payload').order('updated_at', { ascending: false }),
      supabase.from('custom_duties').select('payload').order('updated_at', { ascending: false }),
      supabase.from('custom_market_items').select('payload').order('updated_at', { ascending: false }),
      supabase.from('custom_quizzes').select('payload').order('updated_at', { ascending: false }),
    ]);

    if (Array.isArray(lmRes.data)) {
      const remoteLandmarks = lmRes.data.map((r) => r.payload as Landmark).filter(Boolean);
      const localLandmarks = getCustomLandmarks();
      const remoteIds = new Set(remoteLandmarks.map((l) => l.id));
      // Also push any local-only landmarks that haven't reached Supabase yet
      const unsyncedLocal = localLandmarks.filter((l) => !remoteIds.has(l.id));
      const merged = [...unsyncedLocal, ...remoteLandmarks];
      localStorage.setItem(CUSTOM_LANDMARKS_KEY, JSON.stringify(merged));
      if (unsyncedLocal.length > 0) {
        void pushRegistryToSupabase('custom_landmarks', merged, (item) => ({
          created_by_type: item.createdByType || 'BAND',
          creator_handle: item.band || null,
        }));
      }
    }

    if (Array.isArray(dutyRes.data)) {
      const remoteDuties = dutyRes.data.map((r) => r.payload as CommunityDuty).filter(Boolean);
      const localDuties = getCustomDuties();
      const remoteIds = new Set(remoteDuties.map((d) => d.id));
      const unsyncedLocal = localDuties.filter((d) => !remoteIds.has(d.id));
      const merged = [...unsyncedLocal, ...remoteDuties];
      localStorage.setItem(CUSTOM_DUTIES_KEY, JSON.stringify(merged));
      if (unsyncedLocal.length > 0) {
        void pushRegistryToSupabase('custom_duties', merged, (item) => ({
          creator_handle: item.bandOrVenue || null,
        }));
      }
    }

    if (Array.isArray(mktRes.data)) {
      const remoteMarket = mktRes.data.map((r) => r.payload as MarketItem).filter(Boolean);
      const localMarket = getCustomMarketItems();
      const remoteIds = new Set(remoteMarket.map((m) => m.id));
      const unsyncedLocal = localMarket.filter((m) => !remoteIds.has(m.id));
      const merged = [...unsyncedLocal, ...remoteMarket];
      localStorage.setItem(CUSTOM_MARKET_KEY, JSON.stringify(merged));
      if (unsyncedLocal.length > 0) {
        void pushRegistryToSupabase('custom_market_items', merged);
      }
    }

    if (Array.isArray(quizRes.data)) {
      const remoteQuizzes = quizRes.data.map((r) => r.payload as QuizNode).filter(Boolean);
      const localQuizzes = getCustomQuizzes();
      const remoteIds = new Set(remoteQuizzes.map((q) => q.id));
      const unsyncedLocal = localQuizzes.filter((q) => !remoteIds.has(q.id));
      const merged = [...unsyncedLocal, ...remoteQuizzes];
      localStorage.setItem(CUSTOM_QUIZZES_KEY, JSON.stringify(merged));
      if (unsyncedLocal.length > 0) {
        void pushRegistryToSupabase('custom_quizzes', merged);
      }
    }

    return true;
  } catch (err) {
    console.error('Failed to hydrate shared registries from Supabase:', err);
    return false;
  }
}

export function getCustomQuizzes(): QuizNode[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_QUIZZES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCustomQuizzes(items: QuizNode[]): void {
  localStorage.setItem(CUSTOM_QUIZZES_KEY, JSON.stringify(items));
  void pushRegistryToSupabase('custom_quizzes', items);
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
  void pushRegistryToSupabase('custom_landmarks', items, (item) => ({
    created_by_type: item.createdByType || 'BAND',
    creator_handle: item.band || null,
  }));
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
  void pushRegistryToSupabase('custom_market_items', items);
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
  void pushRegistryToSupabase('custom_duties', items, (item) => ({
    creator_handle: item.bandOrVenue || null,
  }));
}
