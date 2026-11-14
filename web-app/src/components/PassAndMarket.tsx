import React, { useState } from 'react';
import { Landmark, UserState } from '../types';

interface PassAndMarketProps {
  mode: 'PASS' | 'MARKET';
  state: UserState;
  landmarks: Landmark[];
  onSpendPoints: (cost: number) => boolean;
}

interface MarketItem {
  id: string;
  title: string;
  cost: number;
  description: string;
  prefix: string;
}

interface RedeemedVoucher {
  itemId: string;
  title: string;
  code: string;
  timestamp: string;
}

const MARKET_ITEMS: MarketItem[] = [
  {
    id: 'screen-print',
    title: 'DIY LIVE SCREEN-PRINT VOUCHER',
    cost: 150,
    description: 'Bring your own jacket/tee to our next workshop.',
    prefix: 'INK',
  },
  {
    id: 'gig-pass',
    title: 'UNDERGROUND GIG PASS (1x ENTRY)',
    cost: 300,
    description: 'Free entry to a local Timișoara underground show.',
    prefix: 'GIG',
  },
  {
    id: 'secret-coords',
    title: 'SECRET GIG COORDINATES',
    cost: 500,
    description: 'Clandestine show location dropped 2h prior.',
    prefix: 'LOC',
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
  for (let i = 0; i < 3; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `VOUCHER-TM77-${prefix}-${suffix}`;
}

export const PassAndMarket: React.FC<PassAndMarketProps> = ({
  mode,
  state,
  landmarks,
  onSpendPoints,
}) => {
  const [copied, setCopied] = useState(false);
  const [vouchers, setVouchers] = useState<RedeemedVoucher[]>([]);
  const [marketNotice, setMarketNotice] = useState<string | null>(null);

  const rank = getPirateRank(state.points);
  const cleanHandle = state.handle.replace('@', '');
  const discordCommand = `!tune-77B-${cleanHandle}`;

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(discordCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback for non-HTTPS demo environments
      const textArea = document.createElement('textarea');
      textArea.value = discordCommand;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleRedeem = (item: MarketItem) => {
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
        title: item.title,
        code,
        timestamp: timeLabel,
      },
      ...prev,
    ]);
    setMarketNotice(null);
  };

  if (mode === 'PASS') {
    return (
      <div className="space-y-5">
        {/* 1970s Underground Union Card / Bootleg Cassette J-Card */}
        <section className="xerox-paper border-2 border-[#EAE6DF] text-[#0D0D0D] p-0 rounded-none">
          {/* J-Card Spine Header */}
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

          {/* Union Card Metadata Grid */}
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

            {/* 2x2 Ink-Stamp Grid for the 4 Landmarks */}
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

            {/* Cassette J-Card Perforation Footer */}
            <div className="border-t-2 border-dashed border-[#0D0D0D] pt-2 flex justify-between text-[10px] font-bold uppercase opacity-75">
              <span>SIDE A // TIMIȘOARA UNDERGROUND</span>
              <span>NO. 77-RO</span>
            </div>
          </div>
        </section>

        {/* The Human Bridge (Discord Role Sync) — Unlocked at 150+ pts */}
        {state.points >= 150 && (
          <section className="border-2 border-[#33FF00] bg-[#141414] p-4 space-y-3 rounded-none">
            <div className="flex items-center justify-between border-b-2 border-[#33FF00]/40 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#33FF00] phosphor-glow">
                THE HUMAN BRIDGE // DISCORD SYNC
              </span>
              <span className="bg-[#33FF00] text-[#0D0D0D] text-[10px] font-bold px-1.5 py-0.5 uppercase">
                UPLINK READY
              </span>
            </div>

            <p className="text-xs text-[#EAE6DF]/90 leading-relaxed">
              Your signal clearance qualifies for Pirate Network role verification. Copy your
              encrypted claim key below and paste it into{' '}
              <span className="text-[#33FF00] font-bold">#frequency-check</span> on Discord:
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 bg-[#0D0D0D] border-2 border-[#EAE6DF] px-3 py-2 text-xs sm:text-sm font-bold text-[#33FF00] select-all">
                {discordCommand}
              </div>
              <button
                type="button"
                onClick={handleCopyCommand}
                className={`px-3 py-2 text-xs font-bold uppercase border-2 transition-colors rounded-none whitespace-nowrap ${
                  copied
                    ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                    : 'border-[#EAE6DF] bg-[#EAE6DF] text-[#0D0D0D] hover:bg-[#D9381E] hover:text-[#EAE6DF] hover:border-[#D9381E]'
                }`}
              >
                {copied ? '[COPIED!]' : '[COPY COMMAND]'}
              </button>
            </div>
          </section>
        )}
      </div>
    );
  }

  // BLACK MARKET VIEW ([BLACK MARKET] tab)
  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="border-2 border-[#EAE6DF] bg-[#141414] p-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase text-[#D9381E] tracking-wider">
            [CONTRABAND EXCHANGE // SUBTERRANEAN]
          </div>
          <h2 className="text-base font-bold uppercase mt-0.5">BLACK MARKET</h2>
        </div>
        <div className="border-2 border-[#33FF00] bg-[#0D0D0D] px-3 py-1.5 text-right">
          <div className="text-[10px] text-[#EAE6DF]/70 uppercase">BALANCE</div>
          <div className="text-sm font-bold text-[#33FF00] phosphor-glow">
            {state.points} PTS
          </div>
        </div>
      </div>

      {marketNotice && (
        <div className="border-2 border-[#D9381E] bg-[#D9381E]/15 p-3 text-xs font-bold text-[#D9381E] uppercase">
          &gt;&gt; {marketNotice}
        </div>
      )}

      {/* 3 Redeemable Underground Rewards */}
      <div className="space-y-3">
        {MARKET_ITEMS.map((item) => {
          const canAfford = state.points >= item.cost;
          return (
            <div
              key={item.id}
              className="border-2 border-[#EAE6DF] bg-[#141414] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-none"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-[#D9381E] text-[#EAE6DF] text-[11px] font-bold px-2 py-0.5 uppercase">
                    {item.cost} PTS
                  </span>
                  <h3 className="text-sm font-bold uppercase text-[#EAE6DF]">{item.title}</h3>
                </div>
                <p className="text-xs text-[#EAE6DF]/80 leading-relaxed">{item.description}</p>
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
                {canAfford ? '[REDEEM]' : '[LOCKED]'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Stamped ASCII / Mock Voucher Tickets */}
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
                  *** SAMIZDAT DISPATCH TICKET ***
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
                <span>PRESENT AT DOOR / WORKSHOP</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PassAndMarket;
