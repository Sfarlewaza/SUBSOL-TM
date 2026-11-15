import React, { useState, useEffect } from 'react';
import { CommunityDuty, UserState } from './types';
import { landmarks as baseLandmarks } from './data/landmarks';
import { Gatekeeper } from './components/Gatekeeper';
import { PassAndMarket } from './components/PassAndMarket';
import ScannerView from './components/ScannerView';
import ArchiveAndQuiz from './components/ArchiveAndQuiz';
import CommsRoom from './components/CommsRoom';
import AdminConsole from './components/AdminConsole';
import {
  getCustomLandmarks,
  hydrateSharedRegistriesFromSupabase,
  isKnownBandHandle,
  isWhitelistedAdminHandle,
  loadActiveSessionProfile,
  logoutOperative,
  syncProfileState,
  type ProfileRecord,
} from './utils/supabaseClient';

const STORAGE_KEY = 'frecventa77_state';

const INITIAL_STATE: UserState = {
  unlocked: false,
  handle: '',
  accountType: 'OPERATIVE',
  points: 0,
  unlockedIds: [],
  quizCompleted: false,
  completedQuizNodes: [],
  completedDutyIds: [],
};

type ActiveTab = 'SCANNER' | 'ARCHIVE' | 'COMMS' | 'PASS' | 'MARKET';

function isAdminPathRequested(): boolean {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return path.endsWith('/admin') || hash.includes('admin');
}

export function App() {
  const [state, setState] = useState<UserState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<UserState>;
        const handle = parsed.handle || '';
        return {
          ...INITIAL_STATE,
          ...parsed,
          accountType: isWhitelistedAdminHandle(handle)
            ? 'ADMIN'
            : parsed.accountType || 'OPERATIVE',
          completedQuizNodes: parsed.completedQuizNodes || [],
          completedDutyIds: parsed.completedDutyIds || [],
        };
      }
    } catch (err) {
      console.error('Failed to parse localStorage state:', err);
    }
    return INITIAL_STATE;
  });

  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('SCANNER');
  const [forceClientPreview, setForceClientPreview] = useState(false);
  const [contentVersion, setContentVersion] = useState(0);

  
  const isBandOrAdmin =
    ['BAND', 'ARTIST', 'ADMIN'].includes(String(state.accountType || '').toUpperCase()) ||
    isWhitelistedAdminHandle(state.handle || '') ||
    isKnownBandHandle(state.handle || '');

  const mergedLandmarks = React.useMemo(() => [...getCustomLandmarks(), ...baseLandmarks], [contentVersion]);

  useEffect(() => {
    let active = true;
    hydrateSharedRegistriesFromSupabase().then((updated) => {
      if (active && updated) setContentVersion((v) => v + 1);
    });
    return () => {
      active = false;
    };
  }, [activeTab]);

  useEffect(() => {
    let active = true;
    loadActiveSessionProfile()
      .then((profile) => {
        if (!active) return;
        if (profile) {
          const baseIds =
            profile.unlocked_ids && profile.unlocked_ids.length > 0
              ? profile.unlocked_ids
              : ['sfintii-62'];
          const basePoints = Math.max(100, profile.points || 0);
          const resolvedType = isWhitelistedAdminHandle(profile.handle)
            ? 'ADMIN'
            : profile.account_type || 'OPERATIVE';

          setState((prev) => ({
            unlocked: true,
            handle: profile.handle,
            accountType: resolvedType,
            points: basePoints,
            unlockedIds: baseIds,
            quizCompleted: Boolean(profile.quiz_completed),
            completedQuizNodes:
              prev.completedQuizNodes?.length > 0
                ? prev.completedQuizNodes
                : profile.quiz_completed
                ? ['tree-genesis-62', 'tree-samizdat-70s', 'tree-heavy-85']
                : [],
            completedDutyIds: prev.completedDutyIds || [],
          }));
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setState(INITIAL_STATE);
        }
      })
      .catch(() => {
        if (active) {
          localStorage.removeItem(STORAGE_KEY);
          setState(INITIAL_STATE);
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (checkingSession) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save state to localStorage:', err);
    }
    if (state.unlocked) {
      void syncProfileState(state);
    }
  }, [state, checkingSession]);

  const handleAuthenticated = (profile: ProfileRecord) => {
    const starterUnlocked =
      profile.unlocked_ids && profile.unlocked_ids.length > 0
        ? profile.unlocked_ids
        : ['sfintii-62'];
    const starterPoints = Math.max(100, profile.points || 0);
    const resolvedType = isWhitelistedAdminHandle(profile.handle)
      ? 'ADMIN'
      : profile.account_type || 'OPERATIVE';

    setForceClientPreview(false);
    setState({
      unlocked: true,
      handle: profile.handle,
      accountType: resolvedType,
      points: starterPoints,
      unlockedIds: starterUnlocked,
      quizCompleted: Boolean(profile.quiz_completed),
      completedQuizNodes: profile.quiz_completed
        ? ['tree-genesis-62', 'tree-samizdat-70s', 'tree-heavy-85']
        : [],
      completedDutyIds: [],
    });
  };

  const handleSignOut = async () => {
    await logoutOperative();
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_STATE);
    setActiveTab('SCANNER');
    setForceClientPreview(false);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen samizdat-bg text-[#33FF00] font-mono flex items-center justify-center p-4">
        <div className="border-2 border-[#EAE6DF] bg-[#141414] px-6 py-4 text-xs uppercase tracking-widest">
          &gt;&gt; VERIFYING CARRIER SESSION...
        </div>
      </div>
    );
  }

  if (!state.unlocked) {
    return (
      <div>
        {isAdminPathRequested() && (
          <div className="bg-[#D9381E] text-[#EAE6DF] font-mono text-[11px] font-bold uppercase text-center py-1.5 px-3">
            // ADMIN GATEWAY DETECTED — SIGN IN WITH WHITELISTED HANDLE TO LAUNCH CONTROL DECK
          </div>
        )}
        <Gatekeeper onAuthenticated={handleAuthenticated} />
      </div>
    );
  }

  const isAdmin =
    state.accountType === 'ADMIN' || isWhitelistedAdminHandle(state.handle);

  // Whitelisted Admin View (unless admin toggles Operative Preview)
  if (isAdmin && !forceClientPreview) {
    return (
      <AdminConsole
        adminHandle={state.handle}
        baseLandmarks={baseLandmarks}
        onSwitchToClientView={() => setForceClientPreview(true)}
        onSignOut={handleSignOut}
      />
    );
  }

  const isBand = state.accountType === 'BAND' || isAdmin;
  const hasScanAmplifier = state.completedQuizNodes.includes('tree-genesis-62');

  const canPostForum =
    isBand ||
    state.unlockedIds.length >= 2 ||
    state.completedDutyIds.length >= 1 ||
    state.completedQuizNodes.includes('tree-genesis-62');

  const hasMarketClearance =
    isBand ||
    state.completedDutyIds.length >= 1 ||
    state.completedQuizNodes.includes('tree-genesis-62');

  const hasMarketDiscount = state.completedQuizNodes.includes('tree-samizdat-70s') || isAdmin;
  const hasFullHistorianClearance =
    isBand || state.completedQuizNodes.includes('tree-heavy-85');

  const unlockSpot = (landmarkId: string) => {
    setState((prev) => {
      if (prev.unlockedIds.includes(landmarkId)) {
        return prev;
      }
      const landmark = mergedLandmarks.find((l) => l.id === landmarkId);
      const basePoints = landmark ? landmark.points : 100;
      const earnedPoints = prev.completedQuizNodes.includes('tree-genesis-62')
        ? Math.round(basePoints * 1.25)
        : basePoints;
      return {
        ...prev,
        points: prev.points + earnedPoints,
        unlockedIds: [...prev.unlockedIds, landmarkId],
      };
    });
  };

  const completeQuizNode = (nodeId: string, bonusPoints: number) => {
    setState((prev) => {
      if (prev.completedQuizNodes.includes(nodeId)) {
        return prev;
      }
      const nextNodes = [...prev.completedQuizNodes, nodeId];
      return {
        ...prev,
        points: prev.points + bonusPoints,
        completedQuizNodes: nextNodes,
        quizCompleted: nextNodes.length >= 3,
      };
    });
  };

  const completeDuty = (duty: CommunityDuty) => {
    setState((prev) => {
      if (!duty.repeatable && prev.completedDutyIds.includes(duty.id)) {
        return prev;
      }
      return {
        ...prev,
        points: prev.points + duty.points,
        completedDutyIds: [...prev.completedDutyIds, duty.id],
      };
    });
  };

  const spendPoints = (cost: number): boolean => {
    if (state.points < cost) {
      return false;
    }
    setState((prev) => ({
      ...prev,
      points: prev.points - cost,
    }));
    return true;
  };

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'SCANNER', label: 'SCAN' },
    { id: 'ARCHIVE', label: 'TRACK' },
    { id: 'COMMS', label: 'COMMS' },
    { id: 'PASS', label: 'PASS' },
    { id: 'MARKET', label: 'MARKET' },
  ];

  return (
    <div className="min-h-screen samizdat-bg text-[#EAE6DF] font-mono flex flex-col justify-between pb-20">
      {isAdmin && forceClientPreview && (
        <div className="bg-[#D9381E] text-[#EAE6DF] px-4 py-1.5 text-[10px] font-bold uppercase flex items-center justify-between">
          <span>PREVIEWING OPERATIVE VIEW AS @{state.handle}</span>
          <button
            type="button"
            onClick={() => setForceClientPreview(false)}
            className="bg-[#0D0D0D] text-[#33FF00] px-2 py-0.5 border border-[#EAE6DF]"
          >
            [RETURN TO /ADMIN DECK]
          </button>
        </div>
      )}

      <header className="border-b-2 border-[#EAE6DF] bg-[#0D0D0D] px-4 py-3 sticky top-0 z-20">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 bg-[#D9381E]" />
              <h1 className="text-base font-bold tracking-wider uppercase">FRECVENȚA 77</h1>
              {isBand && (
                <span className="bg-[#D9381E] text-[#EAE6DF] text-[9px] font-bold px-1.5 py-0.5 uppercase">
                  {isAdmin ? 'ADMIN' : 'BAND'}
                </span>
              )}
              {!isBand && hasFullHistorianClearance && (
                <span className="border border-[#33FF00] text-[#33FF00] text-[9px] font-bold px-1.5 py-0.5 uppercase">
                  ROADIE // HISTORIAN
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#EAE6DF]/70 uppercase">
              ID: @{state.handle} // {state.completedDutyIds.length} SHIFTS
            </div>
          </div>
          <div className="border-2 border-[#33FF00] bg-[#0D0D0D] px-2.5 py-1 text-right">
            <div className="text-[10px] text-[#33FF00] uppercase leading-none">SIGNAL</div>
            <div className="text-sm font-bold text-[#33FF00] phosphor-glow leading-tight">
              {state.points} PTS
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-xl w-full mx-auto px-4 py-5 flex-1 space-y-6">
        {activeTab === 'SCANNER' && (
          <ScannerView
            landmarks={mergedLandmarks}
            unlockedIds={state.unlockedIds}
            accountType={state.accountType}
            hasScanAmplifier={hasScanAmplifier}
            onUnlockSpot={unlockSpot}
          />
        )}

        {activeTab === 'ARCHIVE' && (
          <ArchiveAndQuiz
            landmarks={mergedLandmarks}
            unlockedIds={state.unlockedIds}
            completedQuizNodes={state.completedQuizNodes}
            completedDutyIds={state.completedDutyIds}
            accountType={state.accountType}
            handle={state.handle}
            onCompleteQuizNode={completeQuizNode}
            onCompleteDuty={completeDuty}
          />
        )}

        {activeTab === 'COMMS' && (
          <CommsRoom
            handle={state.handle}
            accountType={isBandOrAdmin ? 'BAND' : state.accountType}
            points={state.points}
            canPostForum={canPostForum || isBandOrAdmin}
            hasBackstageClearance={hasFullHistorianClearance || isBandOrAdmin}
          />
        )}

        {activeTab === 'PASS' && (
          <PassAndMarket
            mode="PASS"
            state={state}
            landmarks={mergedLandmarks}
            hasMarketClearance={hasMarketClearance || isBandOrAdmin}
            hasMarketDiscount={hasMarketDiscount || isBandOrAdmin}
            onSpendPoints={spendPoints}
            onAccountBurned={() => {
              localStorage.removeItem(STORAGE_KEY);
              setState(INITIAL_STATE);
              setActiveTab('SCANNER');
            }}
          />
        )}

        {activeTab === 'MARKET' && (
          <PassAndMarket
            mode="MARKET"
            state={state}
            landmarks={mergedLandmarks}
            hasMarketClearance={hasMarketClearance || isBandOrAdmin}
            hasMarketDiscount={hasMarketDiscount || isBandOrAdmin}
            onSpendPoints={spendPoints}
            onContentUpdated={() => setContentVersion((v) => v + 1)}
          />
        )}

        <footer className="pt-4 border-t border-[#EAE6DF]/20 flex items-center justify-between text-[11px] text-[#EAE6DF]/50">
          <span>SAMIZDAT BROADCAST // 1962–2026</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[#D9381E] hover:underline uppercase font-bold tracking-wider"
          >
            [SIGN OUT]
          </button>
        </footer>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0D0D0D] border-t-2 border-[#EAE6DF] z-30">
        <div className="max-w-xl mx-auto grid grid-cols-5">
          {navItems.map((item, idx) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-3.5 px-1 text-[10px] sm:text-xs font-bold uppercase tracking-tight transition-colors rounded-none ${
                  idx < navItems.length - 1 ? 'border-r-2 border-[#EAE6DF]' : ''
                } ${
                  isActive
                    ? 'bg-[#D9381E] text-[#EAE6DF]'
                    : 'bg-[#0D0D0D] text-[#EAE6DF] hover:bg-[#EAE6DF] hover:text-[#0D0D0D]'
                }`}
              >
                [{item.label}]
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default App;
