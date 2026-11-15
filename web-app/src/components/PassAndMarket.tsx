import React, { useEffect, useState } from 'react';
import { Landmark, UserState } from '../types';
import { burnOperativeAccount } from '../utils/supabaseClient';

interface PassAndMarketProps {
  mode: 'PASS' | 'MARKET';
  state: UserState;
  landmarks: Landmark[];
  onSpendPoints: (cost: number) => boolean;
  onAccountBurned?: () => void;
}

type RewardCategory = 'GIG TICKET' | 'MERCH VOUCHER' | 'BACKSTAGE PASS' | 'CUSTOM TOKEN';

interface MarketItem {
  id: string;
  bandName: string;
  category: RewardCategory;
  title: string;
  cost: number;
  description: string;
  prefix: string;
  approved: boolean;
}

interface RedeemedVoucher {
  itemId: string;
  bandName: string;
  title: string;
  code: string;
  timestamp: string;
}

const CUSTOM_ITEMS_KEY = 'frecventa77_band_rewards';
const VOUCHERS_KEY = 'frecventa77_vouchers';
const SECRET_ROOM_CODE = 'SUBSOL89';

const DEFAULT_MARKET_ITEMS: MarketItem[] = [
  {
    id: 'screen-print',
    bandName: 'ATELIER SAMIZDAT TM',
    category: 'MERCH VOUCHER',
    title: 'DIY LIVE SCREEN-PRINT VOUCHER',
    cost: 150,
    description: 'Bring your own jacket/tee to our next silkscreen session.',
    prefix: 'INK',
    approved: true,
  },
  {
    id: 'gig-pass',
    bandName: 'SUBSOL COLLECTIVE',
    category: 'GIG TICKET',
    title: 'UNDERGROUND GIG PASS (1x ENTRY)',
    cost: 300,
    description: 'Free door entry to a local Timișoara basement showcase.',
    prefix: 'GIG',
    approved: true,
  },
  {
    id: 'secret-coords',
    bandName: 'FRECVENȚA 77 PIRATES',
    category: 'BACKSTAGE PASS',
    title: 'SECRET GIG COORDINATES + SOUNDCHECK',
    cost: 450,
    description: 'Clandestine show coordinates & soundcheck access 2h prior.',
    prefix: 'LOC',
    approved: true,
  },
];

function getPirateRank(points: number): { title: string; tier: string } {
  if (points >= 500) {
    return { title: 'PIRATE BROADCASTER (Emisie Clandestină)', tier: 'LVL 04' };
  }
  if (points >= 300) {
    return { title: 'ROADIE (Tehnician)', tier: 'LVL 03' };
  }
  if (points >= 150) {
    return { title: 'TAPE TRADER (Colportor)', tier: 'LVL 02' };
  }
  return { title: 'LISTENER (Ascultător)', tier: 'LVL 01' };
}

function generateVoucherCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TM77-${prefix}-${suffix}`;
}

export const PassAndMarket: React.FC<PassAndMarketProps> = ({
  mode,
  state,
  landmarks,
  onSpendPoints,
  onAccountBurned,
}) => {
  const [copied, setCopied] = useState(false);
  const [marketNotice, setMarketNotice] = useState<string | null>(null);
  const [confirmBurn, setConfirmBurn] = useState(false);
  const [burning, setBurning] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);

  const [customItems, setCustomItems] = useState<MarketItem[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_ITEMS_KEY);
      return saved ? (JSON.parse(saved) as MarketItem[]) : [];
    } catch {
      return [];
    }
  });

  const [vouchers, setVouchers] = useState<RedeemedVoucher[]>(() => {
    try {
      const saved = localStorage.getItem(VOUCHERS_KEY);
      return saved ? (JSON.parse(saved) as RedeemedVoucher[]) : [];
    } catch {
      return [];
    }
  });

  const [showBandPortal, setShowBandPortal] = useState(false);
  const [bandName, setBandName] = useState('');
  const [category, setCategory] = useState<RewardCategory>('GIG TICKET');
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardCost, setRewardCost] = useState(150);
  const [rewardDesc, setRewardDesc] = useState('');
  const [instantVerify, setInstantVerify] = useState(true);

  useEffect(() => {
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customItems));
  }, [customItems]);

  useEffect(() => {
    localStorage.setItem(VOUCHERS_KEY, JSON.stringify(vouchers));
  }, [vouchers]);

  const rank = getPirateRank(state.points);
  const allItems = [...customItems, ...DEFAULT_MARKET_ITEMS];

  const handleCopyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(SECRET_ROOM_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleBurnAccount = async () => {
    setBurning(true);
    setBurnError(null);
    try {
      await burnOperativeAccount(state.handle);
      localStorage.removeItem('frecventa77_user_state_v1');
      localStorage.removeItem(VOUCHERS_KEY);
      if (onAccountBurned) {
        onAccountBurned();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setBurnError(err instanceof Error ? err.message.toUpperCase() : 'FAILED TO ERASE PROFILE');
      setBurning(false);
    }
  };

  const handleRedeem = (item: MarketItem) => {
    if (!item.approved) {
      setMarketNotice('PENDING CURATOR APPROVAL // APPROVE BAND DROP FIRST');
      return;
    }
    const success = onSpendPoints(item.cost);
    if (!success) {
      setMarketNotice(`INSUFFICIENT SIGNAL // NEED ${item.cost} PTS FOR ${item.title}`);
      return;
    }

    const code = generateVoucherCode(item.prefix);
    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    setVouchers((prev) => [
      {
        itemId: item.id,
        bandName: item.bandName,
        title: item.title,
        code,
        timestamp: timeLabel,
      },
      ...prev,
    ]);
    setMarketNotice(null);
  };

  const handleCreateBandDrop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bandName.trim() || !rewardTitle.trim()) return;

    const prefixMap: Record<RewardCategory, string> = {
      'GIG TICKET': 'GIG',
      'MERCH VOUCHER': 'MRC',
      'BACKSTAGE PASS': 'VIP',
      'CUSTOM TOKEN': 'TKN',
    };

    const newDrop: MarketItem = {
      id: `band-${Date.now()}`,
      bandName: bandName.trim().toUpperCase(),
      category,
      title: rewardTitle.trim().toUpperCase(),
      cost: Math.max(50, Number(rewardCost) || 150),
      description:
        rewardDesc.trim() ||
        `Official underground drop issued by ${bandName.trim()} for Timișoara listeners.`,
      prefix: prefixMap[category],
      approved: instantVerify,
    };

    setCustomItems((prev) => [newDrop, ...prev]);
    setBandName('');
    setRewardTitle('');
    setRewardDesc('');
    setShowBandPortal(false);
    setMarketNotice(
      instantVerify
        ? `BAND TOKEN LIVE // ${newDrop.bandName} DROP PUBLISHED TO MARKET`
        : `APPLICATION LOGGED // AWAITING CURATOR SIGN-OFF`
    );
  };

  const toggleApproveItem = (id: string) => {
    setCustomItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, approved: !item.approved } : item))
    );
  };

  if (mode === 'PASS') {
    return (
      <div className="space-y-5">
        {/* 1970s Underground Union Card / Bootleg Cassette J-Card */}
        <section className="xerox-paper border-2 border-[#EAE6DF] text-[#0D0D0D] p-0 rounded-none">
          <div className="bg-[#0D0D0D] text-[#EAE6DF] px-4 py-2.5 border-b-2 border-[#0D0D0D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-[#D9381E]" />
              <span className="text-xs font-bold uppercase tracking-widest">
                CARNET CLANDESTIN // C-90 MAGNETOFON
              </span>
            </div>
            <span className="text-[11px] font-bold bg-[#EAE6DF] text-[#0D0D0D] px-1.5 py-0.5 uppercase">
              {rank.tier}
            </span>
          </div>

          <div className="p-4 space-y-4">
            <div className="border-2 border-[#0D0D0D] divide-y-2 divide-[#0D0D0D]">
              <div className="p-2.5 flex justify-between items-center bg-[#EAE6DF]">
                <span className="text-[11px] font-bold uppercase opacity-75">OPERATIVE HANDLE</span>
                <span className="text-sm font-bold uppercase">{state.handle}</span>
              </div>
              <div className="p-2.5 flex justify-between items-center bg-[#EAE6DF]">
                <span className="text-[11px] font-bold uppercase opacity-75">SIGNAL CREDITS</span>
                <span className="text-sm font-bold uppercase bg-[#0D0D0D] text-[#33FF00] px-2 py-0.5">
                  {state.points} PTS
                </span>
              </div>
              <div className="p-2.5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 bg-[#EAE6DF]">
                <span className="text-[11px] font-bold uppercase opacity-75">NETWORK RANK</span>
                <span className="text-xs sm:text-sm font-bold uppercase text-[#D9381E]">
                  {rank.title}
                </span>
              </div>
            </div>

            {/* 2x2 Ink-Stamp Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b-2 border-[#0D0D0D] pb-1">
                <span className="text-xs font-bold uppercase tracking-wider">
                  FIELD VERIFICATION STAMPS
                </span>
                <span className="text-xs font-bold">
                  [{state.unlockedIds.length}/{landmarks.length}]
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                {landmarks.map((spot, index) => {
                  const isUnlocked = state.unlockedIds.includes(spot.id);
                  return (
                    <div
                      key={spot.id}
                      className={`p-3 min-h-[108px] flex flex-col justify-between rounded-none ${
                        isUnlocked
                          ? 'border-2 border-[#D9381E] bg-[#D9381E]/10 text-[#0D0D0D]'
                          : 'border-2 border-dashed border-[#0D0D0D]/40 bg-transparent text-[#0D0D0D]/55'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[10px] font-bold uppercase">
                          NODE 0{index + 1}
                        </span>
                        {isUnlocked ? (
                          <span className="border-2 border-[#D9381E] bg-[#D9381E] text-[#EAE6DF] text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wider -rotate-2">
                            UNLOCKED
                          </span>
                        ) : (
                          <span className="border border-dashed border-[#0D0D0D]/50 text-[10px] font-bold px-1.5 py-0.5 uppercase">
                            LOCKED
                          </span>
                        )}
                      </div>

                      <div className="mt-2">
                        <div className="text-[11px] font-bold uppercase leading-tight">
                          {spot.band}
                        </div>
                        <div className="text-[10px] uppercase mt-0.5 opacity-80 leading-tight">
                          {isUnlocked ? spot.title : 'SIGNAL UNVERIFIED'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t-2 border-dashed border-[#0D0D0D] pt-2 flex justify-between text-[10px] font-bold uppercase opacity-75">
              <span>SIDE A // TIMIȘOARA UNDERGROUND</span>
              <span>NO. 77-RO</span>
            </div>
          </div>
        </section>

        {/* Native Comms Secret Frequency Clearance (Unlocked at 150+ pts) */}
        {state.points >= 150 && (
          <section className="border-2 border-[#33FF00] bg-[#141414] p-4 space-y-3 rounded-none">
            <div className="flex items-center justify-between border-b-2 border-[#33FF00]/40 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#33FF00] phosphor-glow">
                PIRATE FREQUENCY CLEARANCE // COMMS KEY
              </span>
              <span className="bg-[#33FF00] text-[#0D0D0D] text-[10px] font-bold px-1.5 py-0.5 uppercase">
                UNLOCKED
              </span>
            </div>

            <p className="text-xs text-[#EAE6DF]/90 leading-relaxed">
              Your Tape Trader rank unlocks the clandestine gig &amp; merch frequency in the{' '}
              <span className="text-[#33FF00] font-bold">[COMMS]</span> tab. Tune directly to:
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 bg-[#0D0D0D] border-2 border-[#EAE6DF] px-3 py-2 text-xs sm:text-sm font-bold tracking-widest text-[#33FF00] select-all">
                ROOM CODE: {SECRET_ROOM_CODE}
              </div>
              <button
                type="button"
                onClick={handleCopyRoomCode}
                className={`px-3 py-2 text-xs font-bold uppercase border-2 transition-colors rounded-none whitespace-nowrap ${
                  copied
                    ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                    : 'border-[#EAE6DF] bg-[#EAE6DF] text-[#0D0D0D] hover:bg-[#D9381E] hover:text-[#EAE6DF] hover:border-[#D9381E]'
                }`}
              >
                {copied ? '[COPIED!]' : '[COPY CODE]'}
              </button>
            </div>
          </section>
        )}

        {/* Counter-Surveillance / Permanent Account Self-Destruct */}
        <section className="border-2 border-[#D9381E] bg-[#141414] p-4 space-y-3 rounded-none">
          <div className="flex items-center justify-between border-b border-[#D9381E]/40 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#D9381E]">
              [COUNTER-SURVEILLANCE // DEMAGNETIZE TAPE]
            </span>
            <span className="border border-[#D9381E] px-1.5 py-0.5 text-[10px] font-bold text-[#D9381E] uppercase">
              IRREVERSIBLE
            </span>
          </div>

          <p className="text-[11px] text-[#EAE6DF]/80 leading-relaxed">
            Wipes your operative dossier, password hash, and signal credits from the central
            archive completely—leaving zero dead profiles behind and freeing{' '}
            <span className="font-bold text-[#EAE6DF]">@{state.handle.toUpperCase()}</span>.
          </p>

          {burnError && (
            <div className="border border-[#D9381E] bg-[#D9381E]/20 p-2 text-[11px] font-bold text-[#D9381E] uppercase">
              &gt;&gt; {burnError}
            </div>
          )}

          {!confirmBurn ? (
            <button
              type="button"
              onClick={() => setConfirmBurn(true)}
              className="w-full border-2 border-[#D9381E] bg-black px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#D9381E] hover:bg-[#D9381E] hover:text-[#EAE6DF] transition-colors rounded-none"
            >
              [BURN DOSSIER // PURGE OPERATIVE]
            </button>
          ) : (
            <div className="space-y-2 border-2 border-[#D9381E] bg-[#D9381E]/10 p-3">
              <div className="text-[11px] font-bold uppercase text-[#EAE6DF]">
                CONFIRM TAPE DEMAGNETIZATION FOR @{state.handle.toUpperCase()}?
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={burning}
                  onClick={() => setConfirmBurn(false)}
                  className="border-2 border-[#EAE6DF] bg-black py-2 text-xs font-bold uppercase text-[#EAE6DF]"
                >
                  [ABORT]
                </button>
                <button
                  type="button"
                  disabled={burning}
                  onClick={handleBurnAccount}
                  className="border-2 border-[#EAE6DF] bg-[#D9381E] py-2 text-xs font-bold uppercase text-[#EAE6DF]"
                >
                  {burning ? '[PURGING...]' : '[CONFIRM BURN]'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  // BLACK MARKET + BAND TOKEN CREATOR VIEW
  return (
    <div className="space-y-5">
      <div className="border-2 border-[#EAE6DF] bg-[#141414] p-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase text-[#D9381E] tracking-wider">
            [CONTRABAND &amp; BAND DROPS]
          </div>
          <h2 className="text-base font-bold uppercase mt-0.5">UNDERGROUND MARKET</h2>
        </div>
        <div className="border-2 border-[#33FF00] bg-[#0D0D0D] px-3 py-1.5 text-right">
          <div className="text-[10px] text-[#EAE6DF]/70 uppercase">BALANCE</div>
          <div className="text-sm font-bold text-[#33FF00] phosphor-glow">
            {state.points} PTS
          </div>
        </div>
      </div>

      <div className="border-2 border-[#EAE6DF] bg-[#141414] p-3">
        <button
          type="button"
          onClick={() => setShowBandPortal((prev) => !prev)}
          className="w-full flex items-center justify-between text-left text-xs font-bold uppercase tracking-wider text-[#33FF00]"
        >
          <span>[+ BAND / ARTIST PORTAL] APPLY &amp; MINT CUSTOM REWARD</span>
          <span>{showBandPortal ? '[-]' : '[+]'}</span>
        </button>

        {showBandPortal && (
          <form onSubmit={handleCreateBandDrop} className="mt-4 pt-3 border-t border-[#EAE6DF]/30 space-y-3">
            <p className="text-[11px] text-[#EAE6DF]/80 leading-relaxed">
              Local Timișoara bands &amp; DIY collectives can apply to mint custom gig tickets,
              merch vouchers, or backstage tokens redeemable with listener points.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                  BAND / COLLECTIVE NAME *
                </label>
                <input
                  type="text"
                  required
                  value={bandName}
                  onChange={(e) => setBandName(e.target.value)}
                  placeholder="EX: ZGOMOT SUBTERAN"
                  className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs uppercase text-[#EAE6DF]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                  TOKEN / REWARD TYPE
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as RewardCategory)}
                  className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs uppercase text-[#EAE6DF]"
                >
                  <option value="GIG TICKET">GIG TICKET</option>
                  <option value="MERCH VOUCHER">MERCH VOUCHER</option>
                  <option value="BACKSTAGE PASS">BACKSTAGE PASS</option>
                  <option value="CUSTOM TOKEN">CUSTOM TOKEN</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                  REWARD TITLE *
                </label>
                <input
                  type="text"
                  required
                  value={rewardTitle}
                  onChange={(e) => setRewardTitle(e.target.value)}
                  placeholder="EX: FREE ENTRY + CASSETTE DEMO"
                  className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs uppercase text-[#EAE6DF]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                  POINT COST
                </label>
                <input
                  type="number"
                  min={50}
                  max={2000}
                  step={50}
                  value={rewardCost}
                  onChange={(e) => setRewardCost(Number(e.target.value))}
                  className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                REDEMPTION DETAILS / VENUE
              </label>
              <input
                type="text"
                value={rewardDesc}
                onChange={(e) => setRewardDesc(e.target.value)}
                placeholder="Show voucher code at the door before 22:00."
                className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
            </div>

            <label className="flex items-center justify-between border border-dashed border-[#EAE6DF]/40 bg-black p-2 text-[11px] cursor-pointer">
              <span className="uppercase text-[#EAE6DF]/80">
                [CURATOR MODE] Auto-Approve Band Application
              </span>
              <input
                type="checkbox"
                checked={instantVerify}
                onChange={(e) => setInstantVerify(e.target.checked)}
                className="h-4 w-4 accent-[#33FF00]"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-none border-2 border-[#EAE6DF] bg-[#33FF00] p-2.5 text-xs font-bold uppercase tracking-wider text-[#0D0D0D]"
            >
              MINT &amp; PUBLISH BAND REWARD
            </button>
          </form>
        )}
      </div>

      {marketNotice && (
        <div className="border-2 border-[#D9381E] bg-[#D9381E]/15 p-3 text-xs font-bold text-[#D9381E] uppercase">
          &gt;&gt; {marketNotice}
        </div>
      )}

      <div className="space-y-3">
        {allItems.map((item) => {
          const canAfford = state.points >= item.cost && item.approved;
          return (
            <div
              key={item.id}
              className="border-2 border-[#EAE6DF] bg-[#141414] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-none"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-[#D9381E] text-[#EAE6DF] text-[10px] font-bold px-2 py-0.5 uppercase">
                    {item.cost} PTS
                  </span>
                  <span className="border border-[#EAE6DF]/50 text-[#EAE6DF] text-[10px] font-bold px-1.5 py-0.5 uppercase">
                    {item.category}
                  </span>
                  <span className="text-[10px] font-bold uppercase text-[#33FF00]">
                    BY {item.bandName}
                  </span>
                </div>
                <h3 className="text-sm font-bold uppercase text-[#EAE6DF] pt-0.5">{item.title}</h3>
                <p className="text-xs text-[#EAE6DF]/80 leading-relaxed">{item.description}</p>

                {!item.approved && (
                  <button
                    type="button"
                    onClick={() => toggleApproveItem(item.id)}
                    className="mt-1 border border-[#33FF00] px-2 py-0.5 text-[10px] font-bold uppercase text-[#33FF00]"
                  >
                    [CURATOR: APPROVE APPLICATION]
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={!canAfford}
                onClick={() => handleRedeem(item)}
                className={`px-4 py-2.5 text-xs font-bold uppercase border-2 rounded-none whitespace-nowrap transition-colors ${
                  canAfford
                    ? 'border-[#EAE6DF] bg-[#EAE6DF] text-[#0D0D0D] hover:bg-[#D9381E] hover:text-[#EAE6DF] hover:border-[#D9381E]'
                    : 'border-[#EAE6DF]/30 bg-[#0D0D0D] text-[#EAE6DF]/35 cursor-not-allowed'
                }`}
              >
                {!item.approved ? '[PENDING]' : canAfford ? '[REDEEM]' : '[LOCKED]'}
              </button>
            </div>
          );
        })}
      </div>

      {vouchers.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="text-xs font-bold uppercase text-[#33FF00] tracking-wider">
            &gt;&gt; ISSUED CONTRABAND VOUCHERS ({vouchers.length})
          </div>
          {vouchers.map((v, idx) => (
            <div
              key={`${v.code}-${idx}`}
              className="xerox-paper border-2 border-[#EAE6DF] p-4 text-[#0D0D0D] space-y-2 rounded-none"
            >
              <div className="flex items-center justify-between border-b-2 border-[#0D0D0D] pb-1.5">
                <span className="text-[11px] font-bold uppercase">
                  *** {v.bandName} DISPATCH ***
                </span>
                <span className="border-2 border-[#D9381E] text-[#D9381E] text-[10px] font-bold px-1.5 py-0.5 uppercase">
                  STAMPED // {v.timestamp}
                </span>
              </div>

              <div className="text-xs font-bold uppercase">{v.title}</div>

              <div className="bg-[#0D0D0D] text-[#33FF00] p-2.5 border-2 border-[#0D0D0D] font-bold text-xs sm:text-sm tracking-wider select-all text-center">
                [ {v.code} ]
              </div>

              <div className="flex justify-between text-[10px] uppercase font-bold opacity-75 pt-1">
                <span>HOLDER: {state.handle}</span>
                <span>PRESENT AT DOOR / MERCH TABLE</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PassAndMarket;
