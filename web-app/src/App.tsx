import React, { useState, useEffect } from 'react';
import { UserState } from './types';
import { landmarks } from './data/landmarks';
import { Gatekeeper } from './components/Gatekeeper';
import { PassAndMarket } from './components/PassAndMarket';
import ScannerView from './components/ScannerView';
import ArchiveAndQuiz from './components/ArchiveAndQuiz';
import CommsRoom from './components/CommsRoom';

const STORAGE_KEY = 'frecventa77_state';

const INITIAL_STATE: UserState = {
  unlocked: false,
  handle: '',
  points: 0,
  unlockedIds: [],
  quizCompleted: false,
};

type ActiveTab = 'SCANNER' | 'ARCHIVE' | 'COMMS' | 'PASS' | 'MARKET';

export function App() {
  const [state, setState] = useState<UserState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as UserState;
      }
    } catch (err) {
      console.error('Failed to parse localStorage state:', err);
    }
    return INITIAL_STATE;
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('SCANNER');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save state to localStorage:', err);
    }
  }, [state]);

  const unlockApp = (handle: string) => {
    setState((prev) => ({
      ...prev,
      unlocked: true,
      handle: handle.trim() || 'OPERATIVE-77',
    }));
  };

  const unlockSpot = (landmarkId: string) => {
    setState((prev) => {
      if (prev.unlockedIds.includes(landmarkId)) {
        return prev;
      }
      const landmark = landmarks.find((l) => l.id === landmarkId);
      const earnedPoints = landmark ? landmark.points : 150;
      return {
        ...prev,
        points: prev.points + earnedPoints,
        unlockedIds: [...prev.unlockedIds, landmarkId],
      };
    });
  };

  const completeQuiz = (bonusPoints: number) => {
    setState((prev) => {
      if (prev.quizCompleted) {
        return prev;
      }
      return {
        ...prev,
        points: prev.points + bonusPoints,
        quizCompleted: true,
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

  const resetDemo = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_STATE);
    setActiveTab('SCANNER');
  };

  if (!state.unlocked) {
    return <Gatekeeper onUnlock={unlockApp} />;
  }

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'SCANNER', label: 'SCAN' },
    { id: 'ARCHIVE', label: 'FILES' },
    { id: 'COMMS', label: 'COMMS' },
    { id: 'PASS', label: 'PASS' },
    { id: 'MARKET', label: 'MARKET' },
  ];

  return (
    <div className="min-h-screen samizdat-bg text-[#EAE6DF] font-mono flex flex-col justify-between pb-20">
      {/* Top Signal Header */}
      <header className="border-b-2 border-[#EAE6DF] bg-[#0D0D0D] px-4 py-3 sticky top-0 z-20">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 bg-[#D9381E]" />
              <h1 className="text-base font-bold tracking-wider uppercase">FRECVENȚA 77</h1>
            </div>
            <div className="text-[11px] text-[#EAE6DF]/70 uppercase">
              ID: {state.handle} // TM-UNDERGROUND
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

      {/* Main Viewport */}
      <main className="max-w-xl w-full mx-auto px-4 py-5 flex-1 space-y-6">
        {activeTab === 'SCANNER' && (
          <ScannerView
            landmarks={landmarks}
            unlockedIds={state.unlockedIds}
            onUnlockSpot={unlockSpot}
          />
        )}

        {activeTab === 'ARCHIVE' && (
          <ArchiveAndQuiz
            landmarks={landmarks}
            unlockedIds={state.unlockedIds}
            quizCompleted={state.quizCompleted}
            onCompleteQuiz={completeQuiz}
          />
        )}

        {activeTab === 'COMMS' && (
          <CommsRoom handle={state.handle} points={state.points} />
        )}

        {activeTab === 'PASS' && (
          <PassAndMarket
            mode="PASS"
            state={state}
            landmarks={landmarks}
            onSpendPoints={spendPoints}
          />
        )}

        {activeTab === 'MARKET' && (
          <PassAndMarket
            mode="MARKET"
            state={state}
            landmarks={landmarks}
            onSpendPoints={spendPoints}
          />
        )}

        {/* Footer with Reset Signal Trigger */}
        <footer className="pt-4 border-t border-[#EAE6DF]/20 flex items-center justify-between text-[11px] text-[#EAE6DF]/50">
          <span>SAMIZDAT BROADCAST // 1977–2026</span>
          <button
            type="button"
            onClick={resetDemo}
            className="text-[#D9381E] hover:underline uppercase font-bold tracking-wider"
          >
            [RESET SIGNAL]
          </button>
        </footer>
      </main>

      {/* Fixed Bottom Navigation Bar */}
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
