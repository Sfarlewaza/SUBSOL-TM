import React, { useEffect, useState } from 'react';
import { isKnownBandHandle } from '../utils/supabaseClient';
import { AccountType } from '../types';
import { HAS_REAL_SUPABASE, supabase } from '../utils/supabaseClient';
import GigRadarMap, {
  MapGigSummary,
  TIMISOARA_REAL_VENUES,
} from './GigRadarMap';

interface CommsRoomProps {
  handle: string;
  accountType: AccountType;
  points: number;
  canPostForum: boolean;
  hasBackstageClearance: boolean;
}

type ChannelId = 'GIGPROMO' | 'GEARSWAP' | 'LOSTTAPES' | 'SUBSOL89';

interface ForumMessage {
  id: string;
  room_id: string;
  sender_handle: string;
  sender_role: AccountType;
  headline?: string;
  content: string;
  genre_tag?: string;
  photos?: string[];
  created_at: string;
}

interface PrivateRoom {
  code: string;
  name: string;
  createdBy: string;
}

const LOCAL_MESSAGES_KEY = 'frecventa77_forum_messages_v2';
const LOCAL_PRIVATE_ROOMS_KEY = 'frecventa77_private_rooms_v1';

const CHANNELS: { id: ChannelId; label: string; desc: string; restricted?: boolean }[] = [
  { id: 'GIGPROMO', label: '#GIG-PROMO', desc: 'Timișoara underground shows, flyers & roadie calls' },
  { id: 'GEARSWAP', label: '#GEAR-SWAP', desc: 'Amps, pedals, reel-to-reel tapes & schematics' },
  { id: 'LOSTTAPES', label: '#LOST-TAPES', desc: '1962–2026 Timișoara bootlegs, zines & archive lore' },
  {
    id: 'SUBSOL89',
    label: '#SUBSOL-89 [VIP]',
    desc: 'Deep-cover backstage frequency (requires Heavy-85 clearance or Band role)',
    restricted: true,
  },
];

const SEEDED_MESSAGES: ForumMessage[] = [
  {
    id: 'seed-gig-1',
    room_id: 'GIGPROMO',
    sender_handle: 'zgomot_subteran',
    sender_role: 'BAND',
    genre_tag: 'POST-PUNK',
    headline: 'TONIGHT 21:00 @ MANUFACTURA // LIVE SESSION + ROADIE CALL',
    content:
      '**ZGOMOT SUBTERAN** + opening act tonight in Fabric.\n> Doors 20:30 • Free entry for crew\n- Need 2 roadies for 18:30 amp load-in (Code: **AMP77**)\n- Cassettes & hand-printed patches at merch desk',
    created_at: '2026-11-15T18:00:00Z',
  },
  {
    id: 'seed-gig-2',
    room_id: 'GIGPROMO',
    sender_handle: 'halaciuga_tm',
    sender_role: 'BAND',
    genre_tag: 'GARAGE ROCK',
    headline: "FRIDAY 21:30 @ D'ARC PE MAL // BEGA FUZZ NIGHT",
    content:
      'Raw garage & fuzz session right by the Bega canal.\n> Bring earplugs & old C-90 tapes for live board dubbing.',
    created_at: '2026-11-15T17:15:00Z',
  },
  {
    id: 'seed-gear-1',
    room_id: 'GEARSWAP',
    sender_handle: 'amp_doctor_tm',
    sender_role: 'OPERATIVE',
    genre_tag: 'TUBE / DIY',
    headline: 'TESLA MONO 50 & SOVTEK MUFF SCHEMATICS + SPARE TUBES',
    content:
      'Have 2 matched **EL34** pairs and a modded Big Muff clone ready for trade.\n- Looking for a working spring reverb tank or 4-track cassette deck in Timișoara.',
    created_at: '2026-11-15T14:20:00Z',
  },
  {
    id: 'seed-tapes-1',
    room_id: 'LOSTTAPES',
    sender_handle: 'frecventa77',
    sender_role: 'ADMIN',
    genre_tag: '1973 ARCHIVE',
    headline: 'PROGRESIV TM — UNRELEASED PARCUL ROZELOR REHEARSAL REEL',
    content:
      '# SAMIZDAT TAPE LOG #04\nDigitized from a 1973 reel found in Elisabetin.\n> "The amps were custom-wound from radio transformers."',
    created_at: '2026-11-15T11:05:00Z',
  },
  {
    id: 'seed-priv-1',
    room_id: 'PRIV:BUNKER77',
    sender_handle: 'frecventa77',
    sender_role: 'ADMIN',
    headline: 'ENCRYPTED BACKSTAGE LINE // BUNKER77',
    content:
      'Private band & crew frequency active. Share your room code (**BUNKER77**) with bandmates or sound engineers.',
    created_at: '2026-11-15T10:00:00Z',
  },
];

const UPCOMING_CALENDAR_GIGS: (MapGigSummary & { dateLabel: string; venueName: string })[] = [
  {
    id: 'cal-1',
    date: '2026-11-15',
    dateLabel: 'TONIGHT // 21:00',
    venueId: 'manufactura',
    venueName: 'MANUFACTURA',
    band: 'Zgomot Subteran',
    genre: 'POST-PUNK',
    title: 'Zgomot Subteran Live @ Manufactura',
    time: '21:00',
  },
  {
    id: 'cal-2',
    date: '2026-11-20',
    dateLabel: 'FRI 20 NOV // 21:30',
    venueId: 'darc',
    venueName: "D'ARC PE MAL",
    band: 'Hălăciugă',
    genre: 'GARAGE FUZZ',
    title: "Bega Fuzz Session @ D'arc pe Mal",
    time: '21:30',
  },
  {
    id: 'cal-3',
    date: '2026-11-21',
    dateLabel: 'SAT 21 NOV // 20:00',
    venueId: 'reflektor',
    venueName: 'REFLEKTOR VENUE',
    band: 'Timișoara 1973–2026 Collective',
    genre: 'PROG / HEAVY',
    title: 'Progresiv TM & Cargo Tribute Night',
    time: '20:00',
  },
  {
    id: 'cal-4',
    date: '2026-11-26',
    dateLabel: 'THU 26 NOV // 20:30',
    venueId: 'casatineretului',
    venueName: 'CASA TINERETULUI',
    band: 'Subsol 89 Showcase',
    genre: 'ALT / EXPERIMENTAL',
    title: 'Underground Tape & Synth Showcase',
    time: '20:30',
  },
];

function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="text-[#33FF00] font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function RichSamizdatBody({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-[#EAE6DF]/90">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith('# ')) {
          return (
            <div
              key={i}
              className="text-sm sm:text-base font-bold uppercase tracking-wide text-[#33FF00] border-b border-[#33FF00]/40 pb-0.5"
            >
              {trimmed.slice(2)}
            </div>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <div key={i} className="text-xs sm:text-sm font-bold uppercase text-[#EAE6DF]">
              {trimmed.slice(3)}
            </div>
          );
        }
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-[#D9381E] bg-black/60 pl-2.5 py-1 text-[11px] italic text-[#EAE6DF]/85"
            >
              {renderInlineBold(trimmed.slice(2))}
            </blockquote>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-[#33FF00] font-bold">▪</span>
              <span>{renderInlineBold(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={i}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

async function compressForumPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => reject(new Error('Image decode error'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

export default function CommsRoom({
  handle,
  accountType,
  canPostForum: canPostForumProp,
  hasBackstageClearance: hasBackstageProp,
}: CommsRoomProps) {
  const isBandOrAdminRole =
    ['BAND', 'ARTIST', 'ADMIN'].includes(String(accountType || '').toUpperCase()) ||
    isKnownBandHandle(handle || '');
  const canPostForum = Boolean(canPostForumProp || isBandOrAdminRole);
  const hasBackstageClearance = Boolean(hasBackstageProp || isBandOrAdminRole);
  const [viewMode, setViewMode] = useState<'FORUMS' | 'PRIVATE' | 'RADAR'>('FORUMS');
  const [activeChannel, setActiveChannel] = useState<ChannelId>('GIGPROMO');
  const [selectedVenueFilter, setSelectedVenueFilter] = useState<string>('ALL');

  // Private small chat rooms
  const [privateRooms, setPrivateRooms] = useState<PrivateRoom[]>(() => {
    let base: PrivateRoom[] = [
      { code: 'BUNKER77', name: 'TIMIȘOARA SOUNDCHECK & CREW', createdBy: 'frecventa77' },
    ];
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_PRIVATE_ROOMS_KEY) || 'null');
      if (Array.isArray(saved) && saved.length > 0) base = saved;
    } catch {
      // ignore
    }
    if (hasBackstageClearance && !base.some((r) => r.code === 'SUBSOL89')) {
      base = [
        ...base,
        { code: 'SUBSOL89', name: 'SUBSOL-89 VIP BACKSTAGE FREQUENCY', createdBy: 'frecventa77' },
      ];
    }
    return base;
  });

  useEffect(() => {
    if (hasBackstageClearance) {
      setPrivateRooms((prev) =>
        prev.some((r) => r.code === 'SUBSOL89')
          ? prev
          : [
              ...prev,
              { code: 'SUBSOL89', name: 'SUBSOL-89 VIP BACKSTAGE FREQUENCY', createdBy: 'frecventa77' },
            ]
      );
    }
  }, [hasBackstageClearance]);
  const [activePrivateCode, setActivePrivateCode] = useState<string>('BUNKER77');
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Messages store
  const [messages, setMessages] = useState<ForumMessage[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_MESSAGES_KEY) || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {
      // ignore
    }
    return SEEDED_MESSAGES;
  });

  // Rich bulletin composer state
  const [headline, setHeadline] = useState('');
  const [genreTag, setGenreTag] = useState('LIVE GIG');
  const [draft, setDraft] = useState('');
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [privateDraft, setPrivateDraft] = useState('');

  useEffect(() => {
    localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(LOCAL_PRIVATE_ROOMS_KEY, JSON.stringify(privateRooms));
  }, [privateRooms]);

  // Load Supabase messages if available
  useEffect(() => {
    if (!HAS_REAL_SUPABASE) return;
    supabase
      .from('forum_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setMessages((prev) => {
            const ids = new Set(data.map((d: any) => d.id));
            return [...(data as ForumMessage[]), ...prev.filter((m) => !ids.has(m.id))];
          });
        }
      });
  }, []);

  function appendFormatToken(token: string) {
    setDraft((prev) => (prev ? `${prev}\n${token}` : token));
  }

  async function handleSelectForumPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remainingSlots = Math.max(0, 5 - draftPhotos.length);
    const slice = files.slice(0, remainingSlots);
    const compressed: string[] = [];
    for (const file of slice) {
      try {
        compressed.push(await compressForumPhoto(file));
      } catch {
        // skip unreadable image
      }
    }
    if (compressed.length > 0) {
      setDraftPhotos((prev) => [...prev, ...compressed].slice(0, 5));
    }
    e.target.value = '';
  }

  async function handlePostForum(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    if (activeChannel === 'SUBSOL89' && !hasBackstageClearance) return;

    const msg: ForumMessage = {
      id: `msg-${Date.now()}`,
      room_id: activeChannel,
      sender_handle: handle || 'operative',
      sender_role: accountType,
      headline: headline.trim().toUpperCase() || undefined,
      genre_tag: genreTag.trim().toUpperCase() || undefined,
      photos: draftPhotos.length > 0 ? draftPhotos : undefined,
      content: draft.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [msg, ...prev]);
    setHeadline('');
    setDraft('');
    setDraftPhotos([]);
    setShowPreview(false);

    if (HAS_REAL_SUPABASE) {
      await supabase.from('forum_messages').upsert({
        id: msg.id,
        room_id: msg.room_id,
        sender_handle: msg.sender_handle,
        sender_role: msg.sender_role,
        headline: msg.headline || null,
        genre_tag: msg.genre_tag || null,
        photos: msg.photos || null,
        content: msg.content,
        created_at: msg.created_at,
      }, { onConflict: 'id' });
    }
  }

  function handleCreatePrivateRoom(e: React.FormEvent) {
    e.preventDefault();
    const code = `TM${Math.floor(1000 + Math.random() * 8999)}`;
    const room: PrivateRoom = {
      code,
      name: newRoomName.trim().toUpperCase() || `PIRATE FREQ ${code}`,
      createdBy: handle || 'operative',
    };
    setPrivateRooms((prev) => [room, ...prev]);
    setActivePrivateCode(code);
    setNewRoomName('');
  }

  function handleJoinPrivateRoom(e: React.FormEvent) {
    e.preventDefault();
    const clean = joinCodeInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!clean) return;
    if (!privateRooms.some((r) => r.code === clean)) {
      setPrivateRooms((prev) => [
        { code: clean, name: `ENCRYPTED CHANNEL // ${clean}`, createdBy: 'INVITE' },
        ...prev,
      ]);
    }
    setActivePrivateCode(clean);
    setJoinCodeInput('');
  }

  async function handleSendPrivateMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!privateDraft.trim() || !activePrivateCode) return;
    const roomKey = `PRIV:${activePrivateCode}`;
    const msg: ForumMessage = {
      id: `priv-${Date.now()}`,
      room_id: roomKey,
      sender_handle: handle || 'operative',
      sender_role: accountType,
      content: privateDraft.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [msg, ...prev]);
    setPrivateDraft('');

    if (HAS_REAL_SUPABASE) {
      await supabase.from('forum_messages').insert({
        room_id: roomKey,
        sender_handle: msg.sender_handle,
        sender_role: msg.sender_role,
        content: msg.content,
      });
    }
  }

  const channelMeta = CHANNELS.find((c) => c.id === activeChannel)!;
  const channelMessages = messages.filter((m) => m.room_id === activeChannel);
  const privateRoomMessages = messages
    .filter((m) => m.room_id === `PRIV:${activePrivateCode}`)
    .slice()
    .reverse();

  const visibleCalendarGigs =
    selectedVenueFilter === 'ALL'
      ? UPCOMING_CALENDAR_GIGS
      : UPCOMING_CALENDAR_GIGS.filter((g) => g.venueId === selectedVenueFilter);

  return (
    <div className="space-y-4 font-mono text-[#EAE6DF]">
      {/* Header & Top Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#EAE6DF] pb-2">
        <h2 className="text-base sm:text-lg font-bold uppercase tracking-wider">
          // SUBSOL COMMS &amp; GIG RADAR
        </h2>
        <div className="flex items-center gap-1">
          {(
            [
              ['FORUMS', 'ZINE FORUMS'],
              ['PRIVATE', `PRIVATE ROOMS (${privateRooms.length})`],
              ['RADAR', 'MAP & CALENDAR'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-2 py-1 text-[10px] font-bold uppercase border ${
                viewMode === mode
                  ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                  : 'border-[#EAE6DF]/40 bg-[#141414] text-[#EAE6DF]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* MODE 1: BIG TEXT FORMATTING SAMIZDAT FORUMS */}
      {viewMode === 'FORUMS' && (
        <div className="space-y-4">
          {/* Channel Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {CHANNELS.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setActiveChannel(ch.id)}
                className={`p-2 text-left border-2 ${
                  activeChannel === ch.id
                    ? 'border-[#33FF00] bg-[#141414] text-[#33FF00]'
                    : 'border-[#EAE6DF]/30 bg-[#0D0D0D] text-[#EAE6DF]/75'
                }`}
              >
                <div className="text-[10px] font-bold uppercase">{ch.label}</div>
              </button>
            ))}
          </div>

          <div className="border-l-2 border-[#33FF00] pl-2.5 text-[11px] text-[#EAE6DF]/75">
            {channelMeta.desc}
          </div>

          {activeChannel === 'SUBSOL89' && !hasBackstageClearance ? (
            <div className="border-2 border-[#D9381E] bg-[#141414] p-4 text-xs space-y-1">
              <div className="font-bold uppercase text-[#D9381E]">
                [FREQUENCY ENCRYPTED // CLEARANCE REQUIRED]
              </div>
              <p className="text-[#EAE6DF]/80">
                Complete the <strong>HEAVY-85</strong> archive quiz or log in with a verified Band
                account to unlock #SUBSOL-89 backstage comms.
              </p>
            </div>
          ) : (
            <>
              {/* Big Text Samizdat Bulletin Composer */}
              {canPostForum ? (
                <form
                  onSubmit={handlePostForum}
                  className="border-2 border-[#EAE6DF] bg-[#141414] p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-[#33FF00]">
                      // BROADCAST SAMIZDAT BULLETIN TO {channelMeta.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPreview((p) => !p)}
                      className="border border-[#EAE6DF]/50 px-2 py-0.5 text-[9px] font-bold uppercase text-[#EAE6DF]"
                    >
                      {showPreview ? '[EDIT RAW]' : '[LIVE PREVIEW]'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder="BIG BULLETIN HEADLINE..."
                      className="sm:col-span-2 border border-[#EAE6DF] bg-black p-2 text-xs font-bold uppercase text-[#EAE6DF]"
                    />
                    <input
                      type="text"
                      value={genreTag}
                      onChange={(e) => setGenreTag(e.target.value)}
                      placeholder="TAG (E.G. GIG / AMP)"
                      className="border border-[#EAE6DF]/60 bg-black p-2 text-xs uppercase text-[#33FF00]"
                    />
                  </div>

                  {/* Formatting Toolbar */}
                  <div className="flex flex-wrap items-center gap-1 border border-[#EAE6DF]/30 bg-black p-1.5">
                    <span className="text-[9px] uppercase text-[#EAE6DF]/60 mr-1">FORMAT:</span>
                    <button
                      type="button"
                      onClick={() => appendFormatToken('# BIG BANNER')}
                      className="border border-[#EAE6DF]/40 px-1.5 py-0.5 text-[10px] font-bold text-[#33FF00]"
                    >
                      H1 BIG
                    </button>
                    <button
                      type="button"
                      onClick={() => appendFormatToken('## SUBHEAD')}
                      className="border border-[#EAE6DF]/40 px-1.5 py-0.5 text-[10px] font-bold"
                    >
                      H2
                    </button>
                    <button
                      type="button"
                      onClick={() => appendFormatToken('**BOLD TEXT**')}
                      className="border border-[#EAE6DF]/40 px-1.5 py-0.5 text-[10px] font-bold"
                    >
                      **BOLD**
                    </button>
                    <button
                      type="button"
                      onClick={() => appendFormatToken('> VENUE / TIME CALLOUT')}
                      className="border border-[#EAE6DF]/40 px-1.5 py-0.5 text-[10px]"
                    >
                      &gt; QUOTE
                    </button>
                    <button
                      type="button"
                      onClick={() => appendFormatToken('- SETLIST / GEAR ITEM')}
                      className="border border-[#EAE6DF]/40 px-1.5 py-0.5 text-[10px]"
                    >
                      - LIST
                    </button>
                  </div>

                  {showPreview ? (
                    <div className="border border-[#33FF00]/60 bg-black p-3 space-y-1.5">
                      {headline && (
                        <div className="text-sm sm:text-base font-bold uppercase text-[#EAE6DF]">
                          {headline}
                        </div>
                      )}
                      <RichSamizdatBody content={draft || '_Nothing drafted yet..._'} />
                    </div>
                  ) : (
                    <textarea
                      rows={4}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write formatted gig promo, gear listing, or archive story (# Big Header, **bold**, > callout, - bullet)..."
                      className="w-full border border-[#EAE6DF] bg-black p-2.5 text-xs text-[#EAE6DF] leading-relaxed"
                      required
                    />
                  )}

                  {/* Photo Attachments (Max 5 per post) */}
                  <div className="border border-[#EAE6DF]/30 bg-black/70 p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase text-[#EAE6DF]/80">
                        ZINE PHOTOS ({draftPhotos.length}/5 MAX)
                      </span>
                      {draftPhotos.length < 5 && (
                        <label className="cursor-pointer border border-[#33FF00] bg-[#141414] px-2 py-0.5 text-[10px] font-bold uppercase text-[#33FF00]">
                          + ADD PHOTOS
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleSelectForumPhotos}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                    {draftPhotos.length > 0 && (
                      <div className="grid grid-cols-5 gap-1.5">
                        {draftPhotos.map((src, idx) => (
                          <div
                            key={idx}
                            className="relative aspect-square border border-[#33FF00]/60 bg-black overflow-hidden"
                          >
                            <img
                              src={src}
                              alt={`Attachment ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDraftPhotos((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="absolute top-0.5 right-0.5 bg-black/85 border border-[#D9381E] px-1 text-[9px] font-bold text-[#D9381E]"
                            >
                              X
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full border-2 border-[#EAE6DF] bg-[#33FF00] p-2 text-xs font-bold uppercase text-[#0D0D0D]"
                  >
                    TRANSMIT BULLETIN TO {channelMeta.label}
                  </button>
                </form>
              ) : (
                <div className="border border-dashed border-[#EAE6DF]/40 bg-[#141414] p-2.5 text-[11px] text-[#EAE6DF]/75">
                  [READ-ONLY] Scan 2 landmarks, complete 1 volunteer shift, or pass GENESIS-62 to
                  broadcast on public zine channels (Private Rooms remain open!).
                </div>
              )}

              {/* Forum Thread Feed */}
              <div className="space-y-3">
                {channelMessages.map((msg) => {
                  const isBandPost =
                    msg.sender_role === 'BAND' ||
                    msg.sender_role === 'ARTIST' ||
                    isKnownBandHandle(msg.sender_handle);
                  const isAdminPost = msg.sender_role === 'ADMIN';
                  const cardTone = isAdminPost
                    ? 'border-2 border-[#33FF00] border-l-4 bg-[#101C10] shadow-[0_0_12px_rgba(51,255,0,0.12)]'
                    : isBandPost
                    ? 'border-2 border-[#D9381E] border-l-4 bg-[#1B1110] shadow-[0_0_12px_rgba(217,56,30,0.14)]'
                    : 'border-2 border-[#EAE6DF]/45 bg-[#141414]';
                  return (
                  <article
                    key={msg.id}
                    className={`${cardTone} p-3.5 space-y-2`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EAE6DF]/20 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold ${
                            isAdminPost
                              ? 'text-[#33FF00]'
                              : isBandPost
                              ? 'text-[#FF6B52]'
                              : 'text-[#EAE6DF]'
                          }`}
                        >
                          @{msg.sender_handle}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            isAdminPost
                              ? 'bg-[#33FF00] text-[#0D0D0D]'
                              : isBandPost
                              ? 'bg-[#D9381E] text-[#EAE6DF]'
                              : 'bg-[#EAE6DF]/20 text-[#EAE6DF]'
                          }`}
                        >
                          {isAdminPost
                            ? '⚡ SYSOP // ADMIN'
                            : isBandPost
                            ? '★ VERIFIED BAND'
                            : msg.sender_role}
                        </span>
                      </div>
                      {msg.genre_tag && (
                        <span className="border border-[#EAE6DF]/40 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#EAE6DF]/80">
                          {msg.genre_tag}
                        </span>
                      )}
                    </div>

                    {msg.headline && (
                      <h3 className="text-sm sm:text-base font-bold uppercase tracking-wide text-[#EAE6DF]">
                        {msg.headline}
                      </h3>
                    )}

                    <RichSamizdatBody content={msg.content} />

                    {Array.isArray(msg.photos) && msg.photos.length > 0 && (
                      <div
                        className={`grid gap-1.5 pt-1 ${
                          msg.photos.length === 1
                            ? 'grid-cols-1'
                            : msg.photos.length === 2
                            ? 'grid-cols-2'
                            : 'grid-cols-3'
                        }`}
                      >
                        {msg.photos.slice(0, 5).map((photoSrc, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => setLightboxPhoto(photoSrc)}
                            className="group relative overflow-hidden border border-[#EAE6DF]/40 bg-black focus:outline-none"
                          >
                            <img
                              src={photoSrc}
                              alt={`Bulletin attachment ${pIdx + 1}`}
                              loading="lazy"
                              className="h-32 sm:h-40 w-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <span className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 text-[8px] font-bold text-[#33FF00]">
                              [ZOOM {pIdx + 1}/{msg.photos!.length}]
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <div className="max-w-lg w-full border-2 border-[#33FF00] bg-[#0D0D0D] p-2 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[#33FF00]">
              <span>// ZINE PHOTO INSPECTION</span>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="border border-[#D9381E] px-2 py-0.5 text-[#D9381E]"
              >
                [CLOSE X]
              </button>
            </div>
            <img
              src={lightboxPhoto}
              alt="Full size zine attachment"
              className="max-h-[75vh] w-full object-contain bg-black"
            />
          </div>
        </div>
      )}

      {/* MODE 2: PRIVATE SMALL CHAT ROOMS (PIRATE FREQUENCIES) */}
      {viewMode === 'PRIVATE' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Create Small Private Room */}
            <form
              onSubmit={handleCreatePrivateRoom}
              className="border border-[#33FF00]/60 bg-[#141414] p-3 space-y-2"
            >
              <div className="text-[10px] font-bold uppercase text-[#33FF00]">
                // SPIN UP PRIVATE FREQUENCY
              </div>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="ROOM NAME (E.G. BAND REHEARSAL)"
                className="w-full border border-[#EAE6DF]/50 bg-black p-2 text-xs text-[#EAE6DF]"
              />
              <button
                type="submit"
                className="w-full border border-[#EAE6DF] bg-[#33FF00] p-1.5 text-[10px] font-bold uppercase text-[#0D0D0D]"
              >
                + GENERATE INVITE ROOM
              </button>
            </form>

            {/* Join Existing Code */}
            <form
              onSubmit={handleJoinPrivateRoom}
              className="border border-[#EAE6DF]/40 bg-[#141414] p-3 space-y-2"
            >
              <div className="text-[10px] font-bold uppercase text-[#EAE6DF]">
                // TUNE INTO INVITE CODE
              </div>
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="ENTER CODE (E.G. BUNKER77)"
                className="w-full border border-[#EAE6DF]/50 bg-black p-2 text-xs uppercase text-[#EAE6DF]"
              />
              <button
                type="submit"
                className="w-full border border-[#33FF00] bg-black p-1.5 text-[10px] font-bold uppercase text-[#33FF00]"
              >
                TUNE FREQUENCY
              </button>
            </form>
          </div>

          {/* Room Selector Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {privateRooms.map((room) => (
              <button
                key={room.code}
                type="button"
                onClick={() => setActivePrivateCode(room.code)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase border ${
                  activePrivateCode === room.code
                    ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                    : 'border-[#EAE6DF]/35 bg-[#141414] text-[#EAE6DF]'
                }`}
              >
                🔒 {room.code}
              </button>
            ))}
          </div>

          {/* Active Small Chat Window */}
          <div className="border-2 border-[#33FF00] bg-[#141414] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EAE6DF]/30 pb-2">
              <div>
                <div className="text-xs font-bold uppercase text-[#33FF00]">
                  🔒 {privateRooms.find((r) => r.code === activePrivateCode)?.name || activePrivateCode}
                </div>
                <div className="text-[10px] text-[#EAE6DF]/70">
                  INVITE CODE: <span className="font-bold text-[#EAE6DF]">{activePrivateCode}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(activePrivateCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="border border-[#33FF00] bg-black px-2 py-1 text-[10px] font-bold text-[#33FF00]"
              >
                {copiedCode ? '✓ COPIED' : '[COPY CODE]'}
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 bg-black p-2.5 border border-[#EAE6DF]/25">
              {privateRoomMessages.length === 0 ? (
                <div className="text-[11px] text-[#EAE6DF]/60">
                  No transmissions on {activePrivateCode} yet. Share the invite code with your crew.
                </div>
              ) : (
                privateRoomMessages.map((m) => {
                  const isBandMsg =
                    m.sender_role === 'BAND' ||
                    m.sender_role === 'ARTIST' ||
                    isKnownBandHandle(m.sender_handle);
                  const isAdminMsg = m.sender_role === 'ADMIN';
                  return (
                  <div
                    key={m.id}
                    className={`text-xs border-b pb-1.5 px-2 py-1 ${
                      isAdminMsg
                        ? 'border-[#33FF00]/40 bg-[#33FF00]/10 border-l-2 border-l-[#33FF00]'
                        : isBandMsg
                        ? 'border-[#D9381E]/40 bg-[#D9381E]/10 border-l-2 border-l-[#D9381E]'
                        : 'border-[#EAE6DF]/15'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-bold ${
                          isAdminMsg
                            ? 'text-[#33FF00]'
                            : isBandMsg
                            ? 'text-[#FF6B52]'
                            : 'text-[#EAE6DF]'
                        }`}
                      >
                        @{m.sender_handle}
                      </span>
                      <span
                        className={`px-1 py-0.2 text-[8px] font-bold uppercase ${
                          isAdminMsg
                            ? 'bg-[#33FF00] text-[#0D0D0D]'
                            : isBandMsg
                            ? 'bg-[#D9381E] text-[#EAE6DF]'
                            : 'text-[#EAE6DF]/50'
                        }`}
                      >
                        {isAdminMsg ? '⚡ ADMIN' : isBandMsg ? '★ BAND' : `[${m.sender_role}]`}
                      </span>
                    </div>
                    <div className="text-[#EAE6DF]/95 mt-0.5">{m.content}</div>
                  </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleSendPrivateMessage} className="flex gap-2">
              <input
                type="text"
                value={privateDraft}
                onChange={(e) => setPrivateDraft(e.target.value)}
                placeholder={`Message ${activePrivateCode}...`}
                className="flex-1 border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
              <button
                type="submit"
                className="border-2 border-[#EAE6DF] bg-[#33FF00] px-3 py-2 text-xs font-bold uppercase text-[#0D0D0D]"
              >
                SEND
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODE 3: TIMIȘOARA UNDERGROUND MAP & GIG CALENDAR */}
      {viewMode === 'RADAR' && (
        <div className="space-y-4">
          <GigRadarMap
            venues={TIMISOARA_REAL_VENUES}
            gigs={UPCOMING_CALENDAR_GIGS}
            selectedVenueId={selectedVenueFilter}
            onSelectVenue={(venueId) =>
              setSelectedVenueFilter((prev) => (prev === venueId ? 'ALL' : venueId))
            }
          />

          <div className="border-2 border-[#EAE6DF] bg-[#141414] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-[#33FF00]">
                // TIMIȘOARA LIVE GIG CALENDAR ({visibleCalendarGigs.length})
              </span>
              {selectedVenueFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedVenueFilter('ALL')}
                  className="text-[10px] underline text-[#D9381E]"
                >
                  [RESET FILTER]
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setSelectedVenueFilter('ALL')}
                className={`px-2 py-0.5 text-[9px] font-bold border ${
                  selectedVenueFilter === 'ALL'
                    ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                    : 'border-[#EAE6DF]/30 bg-black text-[#EAE6DF]'
                }`}
              >
                ALL VENUES
              </button>
              {TIMISOARA_REAL_VENUES.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => setSelectedVenueFilter(v.id)}
                  className={`px-2 py-0.5 text-[9px] font-bold border ${
                    selectedVenueFilter === v.id
                      ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                      : 'border-[#EAE6DF]/30 bg-black text-[#EAE6DF]'
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {visibleCalendarGigs.map((gig) => (
                <div
                  key={gig.id}
                  className="border border-[#EAE6DF]/35 bg-black p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="bg-[#D9381E] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#EAE6DF]">
                      {gig.dateLabel}
                    </span>
                    <span className="text-[10px] font-bold text-[#33FF00]">{gig.genre}</span>
                  </div>
                  <div className="font-bold text-[#EAE6DF]">{gig.title}</div>
                  <div className="text-[11px] text-[#EAE6DF]/75">
                    📍 {gig.venueName} • {gig.band}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
