import React, { useEffect, useState } from 'react';
import { Landmark, UserState } from '../types';
import { burnOperativeAccount } from '../utils/supabaseClient';
import {
  getCustomDuties,
  getCustomLandmarks,
  getCustomMarketItems,
  isKnownBandHandle,
  saveCustomDuties,
  saveCustomLandmarks,
  saveCustomMarketItems,
} from '../utils/supabaseClient';
import { computeFastDHash, cropFileToSquareDataUrl } from '../utils/scannerHash';
import { CommunityDuty, Landmark, MarketItem as SharedMarketItem } from '../types';


interface PassAndMarketProps {
  mode: 'PASS' | 'MARKET';
  state: UserState;
  landmarks: Landmark[];
  hasMarketClearance?: boolean;
  hasMarketDiscount?: boolean;
  onSpendPoints: (cost: number) => boolean;
  onAccountBurned?: () => void;
  onContentUpdated?: () => void;
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
  hasMarketClearance = false,
  hasMarketDiscount = false,
  onSpendPoints,
  onAccountBurned,
  onContentUpdated,
}) => {
  const isBandAccount = ['BAND', 'ARTIST', 'ADMIN'].includes(String(state.accountType || '').toUpperCase()) || isKnownBandHandle(state.handle || '');

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

  const [showBandPortal, setShowBandPortal] = useState(true);
  const [bandName, setBandName] = useState(() => state.handle.toUpperCase());
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
      localStorage.removeItem('frecventa77_state');
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

  const getEffectiveCost = (baseCost: number) =>
    hasMarketDiscount ? Math.round(baseCost * 0.8) : baseCost;

  const handleRedeem = (item: MarketItem) => {
    if (!hasMarketClearance) {
      setMarketNotice('CLEARANCE LOCKED // DECRYPT NODE 02 IN [TRACK] QUIZ TREE TO REDEEM DROPS');
      return;
    }
    if (!item.approved) {
      setMarketNotice('PENDING CURATOR APPROVAL // APPROVE BAND DROP FIRST');
      return;
    }
    const finalCost = getEffectiveCost(item.cost);
    const success = onSpendPoints(finalCost);
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
    if (!isBandAccount) return;
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
    setRewardTitle('');
    setRewardDesc('');
    setShowBandPortal(false);
    const sharedDrop: SharedMarketItem = {
      id: newDrop.id,
      title: newDrop.title,
      vendor: newDrop.bandName,
      category: 'GIG ACCESS',
      createdByType: 'BAND',
      cost: newDrop.cost,
      description: newDrop.description,
      stock: 25,
      codePrefix: newDrop.prefix,
    };
    saveCustomMarketItems([sharedDrop, ...getCustomMarketItems()]);
    onContentUpdated?.();
    setMarketNotice(
      instantVerify
        ? `BAND TOKEN LIVE // ${newDrop.bandName} DROP PUBLISHED TO MARKET`
        : `APPLICATION LOGGED // AWAITING CURATOR SIGN-OFF`
    );
  };


  const [bandStudioTab, setBandStudioTab] = useState<'TOKEN' | 'NODE' | 'VOLUNTEER'>('TOKEN');
  const [bandNodeTitle, setBandNodeTitle] = useState('');
  const [bandNodeLocation, setBandNodeLocation] = useState('Manufactura / Timișoara');
  const [bandNodeRiddle, setBandNodeRiddle] = useState('');
  const [bandNodeStory, setBandNodeStory] = useState('');
  const [bandNodePoints, setBandNodePoints] = useState('150');
  const [bandNodePhoto, setBandNodePhoto] = useState('');
  const [bandNodeHash, setBandNodeHash] = useState('');

  const [bandDutyTitle, setBandDutyTitle] = useState('');
  const [bandDutyVenue, setBandDutyVenue] = useState('Manufactura');
  const [bandDutyType, setBandDutyType] = useState<CommunityDuty['dutyType']>('ROADIE SHIFT');
  const [bandDutyPoints, setBandDutyPoints] = useState('130');
  const [bandDutyPerk, setBandDutyPerk] = useState('FREE ENTRY + SOUNDCHECK + 1X DRINK TOKEN');
  const [bandDutyCode, setBandDutyCode] = useState('AMP77');
  const [bandDutyHint, setBandDutyHint] = useState('Stage door 60 mins before doors');

  const handleBandNodePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { dataUrl, wasCropped } = await cropFileToSquareDataUrl(file, 360, 0.78);
    if (!dataUrl) return;
    const dHash = await computeFastDHash(dataUrl);
    setBandNodeHash(dHash);
    setBandNodePhoto(dataUrl);
    if (wasCropped) {
      setMarketNotice('⚠ NON-SQUARE TARGET PHOTO AUTO-CROPPED TO CENTER 1:1 SQUARE.');
    }
  };

  const handleMintBandNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBandAccount || !bandNodeTitle.trim()) return;
    const newNode: Landmark = {
      id: `band-node-${Date.now()}`,
      title: bandNodeTitle.trim(),
      band: (state.handle || 'LOCAL BAND').toUpperCase(),
      era: '2026 // LIVE DROP',
      locationName: bandNodeLocation.trim() || 'Timișoara Underground',
      lat: 45.7537,
      lng: 21.2257,
      radiusMeters: 60,
      points: Number(bandNodePoints) || 150,
      difficulty: 'FIELD',
      trackOrder: landmarks.length + getCustomLandmarks().length + 1,
      createdByType: 'BAND',
      creatorHandle: state.handle,
      riddle: bandNodeRiddle.trim() || `Find @${state.handle}'s street sticker or poster drop.`,
      story: bandNodeStory.trim() || `Official field recon node minted by @${state.handle}.`,
      referenceImageUrl:
        bandNodePhoto ||
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=420&q=65',
      referenceDHash: bandNodeHash || '0'.repeat(64),
    };
    saveCustomLandmarks([newNode, ...getCustomLandmarks()]);
    onContentUpdated?.();
    setMarketNotice(`BAND NODE LIVE // "${newNode.title.toUpperCase()}" DEPLOYED TO [SCAN] RADAR`);
    setBandNodeTitle('');
    setBandNodeRiddle('');
    setBandNodeStory('');
    setBandNodePhoto('');
    setBandNodeHash('');
  };

  const handleMintBandDuty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBandAccount || !bandDutyTitle.trim()) return;
    const newDuty: CommunityDuty = {
      id: `band-duty-${Date.now()}`,
      title: bandDutyTitle.trim().toUpperCase(),
      bandOrVenue: `${(state.handle || 'BAND').toUpperCase()} @ ${bandDutyVenue.trim() || 'TIMIȘOARA'}`,
      dutyType: bandDutyType,
      points: Number(bandDutyPoints) || 130,
      instantReward: bandDutyPerk.trim() || 'GUESTLIST + BACKSTAGE HANG',
      repeatable: true,
      locationHint: bandDutyHint.trim() || 'Venue front desk / stage left',
      verificationCode: (bandDutyCode.trim() || 'AMP77').toUpperCase(),
      description: `Live gig volunteer shift posted by @${state.handle}.`,
    };
    saveCustomDuties([newDuty, ...getCustomDuties()]);
    onContentUpdated?.();
    setMarketNotice(`GIG VOLUNTEER SHIFT LIVE // "${newDuty.title}" PUBLISHED TO [TRACK -> 02. ROADIE]`);
    setBandDutyTitle('');
  };

  const toggleApproveItem = (id: string) => {
    if (!isBandAccount) return;
    setCustomItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, approved: !item.approved } : item))
    );
  };

  if (mode === 'PASS') {
    return (
      <div className="space-y-5">
        <section className="xerox-paper border-2 border-[#EAE6DF] text-[#0D0D0D] p-0 rounded-none">
          <div className="bg-[#0D0D0D] text-[#EAE6DF] px-4 py-2.5 border-b-2 border-[#0D0D0D] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-[#D9381E]" />
              <span className="text-xs font-bold uppercase tracking-widest">
                CARNET CLANDESTIN // C-90 MAGNETOFON
              </span>
            </div>
            <span className="text-[11px] font-bold bg-[#EAE6DF] text-[#0D0D0D] px-1.5 py-0.5 uppercase">
              {isBandAccount ? 'BAND // ' : ''}
              {rank.tier}
            </span>
          </div>

          <div className="p-4 space-y-4">
            <div className="border-2 border-[#0D0D0D] divide-y-2 divide-[#0D0D0D]">
              <div className="p-2.5 flex justify-between items-center bg-[#EAE6DF]">
                <span className="text-[11px] font-bold uppercase opacity-75">
                  {isBandAccount ? 'BAND / COLLECTIVE' : 'OPERATIVE HANDLE'}
                </span>
                <div className="flex items-center gap-2">
                  {isBandAccount && (
                    <span className="bg-[#D9381E] text-[#EAE6DF] text-[10px] font-bold px-1.5 py-0.5 uppercase">
                      VERIFIED BAND
                    </span>
                  )}
                  <span className="text-sm font-bold uppercase">{state.handle}</span>
                </div>
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
            Wipes your dossier, password hash, and signal credits from the central archive
            completely—leaving zero dead profiles behind and freeing{' '}
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

  // BLACK MARKET + BAND-ONLY TOKEN CREATOR VIEW
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

      {/* Band-Only Studio: Mint Market Tokens, Scan Nodes & Gig Volunteer Shifts */}
      {isBandAccount ? (
        <div className="border-2 border-[#33FF00] bg-[#141414] p-3">
          <button
            type="button"
            onClick={() => setShowBandPortal((prev) => !prev)}
            className="w-full flex items-center justify-between text-left text-xs font-bold uppercase tracking-wider text-[#33FF00]"
          >
            <span>[BAND / ARTIST STUDIO] MINT TOKENS, SCAN NODES &amp; GIG SHIFTS</span>
            <span>{showBandPortal ? '[-]' : '[+]'}</span>
          </button>

          {showBandPortal && (
            <div className="mt-3 pt-3 border-t border-[#EAE6DF]/30 space-y-3">
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ['TOKEN', '01. MARKET TOKEN'],
                    ['NODE', '02. SCAN NODE'],
                    ['VOLUNTEER', '03. GIG SHIFT'],
                  ] as const
                ).map(([tabKey, tabLabel]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setBandStudioTab(tabKey)}
                    className={`p-1.5 text-[10px] font-bold uppercase border ${
                      bandStudioTab === tabKey
                        ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                        : 'border-[#EAE6DF]/35 bg-black text-[#EAE6DF]'
                    }`}
                  >
                    {tabLabel}
                  </button>
                ))}
              </div>

              {bandStudioTab === 'TOKEN' && (
                <form onSubmit={handleCreateBandDrop} className="space-y-3">
                  <p className="text-[11px] text-[#EAE6DF]/80 leading-relaxed">
                    Verified Band Account active. Mint custom gig tickets, merch vouchers, or
                    backstage tokens redeemable with listener signal points.
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
                      [CURATOR MODE] Auto-Approve Band Drop
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

              {bandStudioTab === 'NODE' && (
                <form onSubmit={handleMintBandNode} className="space-y-2.5">
                  <p className="text-[11px] text-[#EAE6DF]/80">
                    Deploy a street poster, venue stamp, or hidden merch drop directly to the live [SCAN] radar.
                  </p>
                  <input
                    type="text"
                    required
                    placeholder="NODE TITLE (E.G. ZGOMOT SUBTERAN POSTER DROP)"
                    value={bandNodeTitle}
                    onChange={(e) => setBandNodeTitle(e.target.value)}
                    className="w-full border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="VENUE / STREET LOCATION"
                      value={bandNodeLocation}
                      onChange={(e) => setBandNodeLocation(e.target.value)}
                      className="border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                    />
                    <input
                      type="number"
                      placeholder="SIGNAL PTS (150)"
                      value={bandNodePoints}
                      onChange={(e) => setBandNodePoints(e.target.value)}
                      className="border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="RIDDLE / CLUE FOR FANS"
                    value={bandNodeRiddle}
                    onChange={(e) => setBandNodeRiddle(e.target.value)}
                    className="w-full border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  />
                  <div className="border border-[#EAE6DF]/40 bg-black p-2 text-[10px] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#33FF00]">
                        {bandNodePhoto ? '✓ 1:1 TARGET PHOTO + 256-BIT DHASH LOCKED' : 'UPLOAD TARGET PHOTO:'}
                      </span>
                      <input type="file" accept="image/*" onChange={handleBandNodePhoto} />
                    </div>
                    <div className="text-[9px] text-amber-300/90">
                      ⚠ 1:1 SQUARE ASPECT RATIO REQUIRED — NON-SQUARE PHOTOS ARE AUTO-CROPPED TO CENTER 1:1.
                    </div>
                    {bandNodePhoto && (
                      <div className="mx-auto aspect-square w-28 border border-[#33FF00]/70 overflow-hidden">
                        <img src={bandNodePhoto} alt="1:1 band node preview" className="h-full w-full object-cover" />
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="w-full border-2 border-[#EAE6DF] bg-[#33FF00] p-2.5 text-xs font-bold uppercase text-[#0D0D0D]"
                  >
                    MINT &amp; DEPLOY BAND SCAN NODE
                  </button>
                </form>
              )}

              {bandStudioTab === 'VOLUNTEER' && (
                <form onSubmit={handleMintBandDuty} className="space-y-2.5">
                  <p className="text-[11px] text-[#EAE6DF]/80">
                    Post a roadie, merch desk, or soundcheck shift. Fans enter your secret code at the gig to claim points &amp; perks.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="SHIFT TITLE (E.G. AMP LOAD-IN)"
                      value={bandDutyTitle}
                      onChange={(e) => setBandDutyTitle(e.target.value)}
                      className="border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                    />
                    <input
                      type="text"
                      required
                      placeholder="VENUE (E.G. MANUFACTURA)"
                      value={bandDutyVenue}
                      onChange={(e) => setBandDutyVenue(e.target.value)}
                      className="border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={bandDutyType}
                      onChange={(e) => setBandDutyType(e.target.value as CommunityDuty['dutyType'])}
                      className="border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                    >
                      <option value="ROADIE SHIFT">ROADIE SHIFT</option>
                      <option value="POSTER RUN">POSTER RUN</option>
                      <option value="MERCH DESK">MERCH DESK</option>
                      <option value="SOUNDCHECK HELP">SOUNDCHECK HELP</option>
                    </select>
                    <input
                      type="number"
                      placeholder="POINTS (130)"
                      value={bandDutyPoints}
                      onChange={(e) => setBandDutyPoints(e.target.value)}
                      className="border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                    />
                    <input
                      type="text"
                      placeholder="SECRET CODE"
                      value={bandDutyCode}
                      onChange={(e) => setBandDutyCode(e.target.value)}
                      className="border-2 border-[#EAE6DF] bg-black p-2 text-xs uppercase text-[#33FF00]"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="INSTANT REAL-WORLD PERK (E.G. GUESTLIST + DRINK TOKEN)"
                    value={bandDutyPerk}
                    onChange={(e) => setBandDutyPerk(e.target.value)}
                    className="w-full border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  />
                  <input
                    type="text"
                    placeholder="MEETING POINT & TIME"
                    value={bandDutyHint}
                    onChange={(e) => setBandDutyHint(e.target.value)}
                    className="w-full border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  />
                  <button
                    type="submit"
                    className="w-full border-2 border-[#EAE6DF] bg-[#33FF00] p-2.5 text-xs font-bold uppercase text-[#0D0D0D]"
                  >
                    MINT &amp; PUBLISH GIG VOLUNTEER JOB
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="border border-dashed border-[#EAE6DF]/35 bg-[#141414]/60 px-3 py-2.5 text-[11px] text-[#EAE6DF]/65 uppercase">
          [BAND MINTING LOCKED] // ONLY REGISTERED <span className="text-[#D9381E] font-bold">BAND / COLLECTIVE</span> ACCOUNTS CAN ISSUE MARKET TOKENS &amp; VOUCHERS.
        </div>
      )}

      {marketNotice && (
        <div className="border-2 border-[#D9381E] bg-[#D9381E]/15 p-3 text-xs font-bold text-[#D9381E] uppercase">
          &gt;&gt; {marketNotice}
        </div>
      )}

      <div className="space-y-3">
        {!hasMarketClearance && (
          <div className="border-2 border-[#D9381E] bg-[#141414] p-3 text-xs uppercase text-[#D9381E] font-bold">
            [WINDOW-SHOPPING MODE] // LOG 1 ROADIE SHIFT OR PASS CLEARANCE 01 IN [TRACK] TO UNLOCK REDEEMING (CLEARANCE 02 ADDS -20% DISCOUNT).
          </div>
        )}

        {hasMarketDiscount && (
          <div className="border border-[#33FF00] bg-[#33FF00]/10 px-3 py-1.5 text-[11px] font-bold uppercase text-[#33FF00]">
            &gt;&gt; NODE 02 PERK ACTIVE: -20% SAMIZDAT DISCOUNT APPLIED TO ALL DROPS
          </div>
        )}

        {allItems.map((item) => {
          const finalCost = getEffectiveCost(item.cost);
          const canAfford = hasMarketClearance && state.points >= finalCost && item.approved;
          return (
            <div
              key={item.id}
              className="border-2 border-[#EAE6DF] bg-[#141414] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-none"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-[#D9381E] text-[#EAE6DF] text-[10px] font-bold px-2 py-0.5 uppercase">
                    {finalCost} PTS {hasMarketDiscount ? `(WAS ${item.cost})` : ''}
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

                {!item.approved && isBandAccount && (
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
                {!hasMarketClearance ? '[CLEARANCE REQ]' : !item.approved ? '[PENDING]' : canAfford ? '[REDEEM]' : '[LOCKED]'}
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