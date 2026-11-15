import React, { useEffect, useState } from 'react';
import {
  AccountType,
  CommunityDuty,
  Landmark,
  MarketItem,
  QuizNode,
  QuizTopic,
} from '../types';
import {
  getCustomDuties,
  getCustomLandmarks,
  getCustomMarketItems,
  getCustomQuizzes,
  HAS_REAL_SUPABASE,
  ProfileRecord,
  saveCustomDuties,
  saveCustomLandmarks,
  saveCustomMarketItems,
  saveCustomQuizzes,
  supabase,
  WHITELISTED_ADMINS,
} from '../utils/supabaseClient';
import {
  computeFastDHash,
  loadScannerSandbox,
  saveScannerSandbox,
  ScannerSandboxConfig,
} from '../utils/scannerHash';

interface AdminConsoleProps {
  adminHandle: string;
  baseLandmarks: Landmark[];
  onSwitchToClientView: () => void;
  onSignOut: () => void;
}

type AdminSection = 'SCANNER' | 'NODES' | 'QUIZZES' | 'DUTIES' | 'MARKET' | 'ACCOUNTS';

export default function AdminConsole({
  adminHandle,
  baseLandmarks = [],
  onSwitchToClientView,
  onSignOut,
}: AdminConsoleProps) {
  const [section, setSection] = useState<AdminSection>('SCANNER');
  const [banner, setBanner] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState<ScannerSandboxConfig>(() => loadScannerSandbox());

  // Persisted admin collections
  const [customLandmarks, setCustomLandmarks] = useState<Landmark[]>(() => getCustomLandmarks());
  const [customQuizzes, setCustomQuizzes] = useState<QuizNode[]>(() => getCustomQuizzes());
  const [customDuties, setCustomDuties] = useState<CommunityDuty[]>(() => getCustomDuties());
  const [customMarket, setCustomMarket] = useState<MarketItem[]>(() => getCustomMarketItems());

  // Accounts list (Supabase profiles if connected)
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // Landmark form
  const [lmTitle, setLmTitle] = useState('');
  const [lmBand, setLmBand] = useState('');
  const [lmEra, setLmEra] = useState('1973 // TIMIȘOARA');
  const [lmLocation, setLmLocation] = useState('Piața Victoriei');
  const [lmDifficulty, setLmDifficulty] = useState<'RECON' | 'FIELD' | 'DEEP COVER'>('FIELD');
  const [lmRiddle, setLmRiddle] = useState('');
  const [lmStory, setLmStory] = useState('');
  const [lmRefImage, setLmRefImage] = useState('');
  const [lmRefHash, setLmRefHash] = useState('');
  const [lmPoints, setLmPoints] = useState('140');

  // Quiz form
  const [qTitle, setQTitle] = useState('');
  const [qTopic, setQTopic] = useState<QuizTopic>('HISTORY & CENSORSHIP');
  const [qQuestion, setQQuestion] = useState('');
  const [qOpts, setQOpts] = useState(['', '', '', '']);
  const [qCorrect, setQCorrect] = useState(0);
  const [qReward, setQReward] = useState('125');

  // Duty form
  const [dtTitle, setDtTitle] = useState('');
  const [dtVenue, setDtVenue] = useState('Manufactura');
  const [dtType, setDtType] = useState<CommunityDuty['dutyType']>('ROADIE SHIFT');
  const [dtPoints, setDtPoints] = useState('120');
  const [dtReward, setDtReward] = useState('BACKSTAGE SOUNDCHECK + 1X BAR TOKEN + FUTURE GUESTLIST');
  const [dtHint, setDtHint] = useState('Front door / stage left 45 mins before doors');
  const [dtCode, setDtCode] = useState('CREW77');
  const [dtDesc, setDtDesc] = useState('');

  // Market item form
  const [mkTitle, setMkTitle] = useState('');
  const [mkVendor, setMkVendor] = useState('SUBSOL ARCHIVE');
  const [mkCategory, setMkCategory] = useState<MarketItem['category']>('GIG ACCESS');
  const [mkCost, setMkCost] = useState('250');
  const [mkStock, setMkStock] = useState('15');
  const [mkDesc, setMkDesc] = useState('');

  function flash(msg: string) {
    setBanner(msg);
    setTimeout(() => setBanner(null), 3500);
  }

  useEffect(() => {
    if (section !== 'ACCOUNTS' || !HAS_REAL_SUPABASE) return;
    setLoadingProfiles(true);
    supabase
      .from('profiles')
      .select('*')
      .order('points', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (Array.isArray(data)) {
          setProfiles(data as ProfileRecord[]);
        }
      })
      .finally(() => setLoadingProfiles(false));
  }, [section]);

  function updateSandbox(patch: Partial<ScannerSandboxConfig>) {
    setSandbox((prev) => {
      const next = { ...prev, ...patch };
      saveScannerSandbox(next);
      return next;
    });
  }

  function handleSandboxRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 320 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        updateSandbox({
          refImageDataUrl: canvas.toDataURL('image/jpeg', 0.7),
          enabled: true,
        });
        flash('✓ CUSTOM SCANNER REFERENCE LOADED INTO ADMIN TEST TOKEN.');
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  async function handleLandmarkPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dHash = await computeFastDHash(file);
    setLmRefHash(dHash);

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 320 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setLmRefImage(canvas.toDataURL('image/jpeg', 0.65));
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function handleAddLandmark(e: React.FormEvent) {
    e.preventDefault();
    if (!lmTitle.trim() || !lmBand.trim()) return;
    const newL: Landmark = {
      id: `custom-spot-${Date.now()}`,
      title: lmTitle.trim(),
      band: lmBand.trim(),
      era: lmEra.trim(),
      locationName: lmLocation.trim(),
      lat: 45.7537,
      lng: 21.2257,
      radiusMeters: 60,
      points: Number(lmPoints) || 140,
      difficulty: lmDifficulty,
      trackOrder: baseLandmarks.length + customLandmarks.length + 1,
      createdByType: 'ADMIN',
      creatorHandle: adminHandle || 'sfarleaza',
      riddle: lmRiddle.trim() || 'Locate the underground samizdat marker.',
      story: lmStory.trim() || 'Custom recon node deployed from root console.',
      referenceImageUrl:
        lmRefImage ||
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=420&q=65',
      referenceDHash: lmRefHash || '0'.repeat(64),
    };
    const next = [newL, ...customLandmarks];
    setCustomLandmarks(next);
    saveCustomLandmarks(next);
    flash(`✓ DEPLOYED SCAN NODE "${newL.title}" TO FIELD RADAR.`);
    setLmTitle('');
    setLmBand('');
    setLmRiddle('');
    setLmStory('');
    setLmRefImage('');
    setLmRefHash('');
  }

  function handleDeleteLandmark(id: string) {
    const next = customLandmarks.filter((item) => item.id !== id);
    setCustomLandmarks(next);
    saveCustomLandmarks(next);
    flash('✓ REMOVED CUSTOM SCAN NODE.');
  }

  function handleAddQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!qTitle.trim() || !qQuestion.trim() || qOpts.some((o) => !o.trim())) return;
    const newQ: QuizNode = {
      id: `custom-quiz-${Date.now()}`,
      tier: 1,
      code: `ADM-${Math.floor(10 + Math.random() * 89)}`,
      title: qTitle.trim().toUpperCase(),
      topic: qTopic,
      createdByType: 'ADMIN',
      creatorHandle: adminHandle || 'sfarleaza',
      rewardPoints: Number(qReward) || 125,
      perkLabel: `+${Number(qReward) || 125} SIGNAL PTS & ARCHIVE STAMP`,
      briefing: `Root archive clearance test issued by @${adminHandle || 'sfarleaza'}.`,
      questions: [
        {
          question: qQuestion.trim(),
          options: [...qOpts],
          correctIndex: qCorrect,
        },
      ],
    };
    const next = [newQ, ...customQuizzes];
    setCustomQuizzes(next);
    saveCustomQuizzes(next);
    flash(`✓ DEPLOYED TRIVIA NODE "${newQ.title}".`);
    setQTitle('');
    setQQuestion('');
    setQOpts(['', '', '', '']);
  }

  function handleDeleteQuiz(id: string) {
    const next = customQuizzes.filter((q) => q.id !== id);
    setCustomQuizzes(next);
    saveCustomQuizzes(next);
    flash('✓ REMOVED CUSTOM QUIZ NODE.');
  }

  function handleAddDuty(e: React.FormEvent) {
    e.preventDefault();
    if (!dtTitle.trim()) return;
    const newD: CommunityDuty = {
      id: `custom-duty-${Date.now()}`,
      title: dtTitle.trim().toUpperCase(),
      bandOrVenue: dtVenue.trim() || 'Timișoara Underground',
      dutyType: dtType,
      points: Number(dtPoints) || 120,
      instantReward: dtReward.trim() || 'BACKSTAGE HANG + BAR TOKEN',
      repeatable: true,
      locationHint: dtHint.trim() || 'Timișoara Venue',
      verificationCode: (dtCode.trim() || 'CREW77').toUpperCase(),
      description: dtDesc.trim() || 'Repeatable community volunteer shift.',
    };
    const next = [newD, ...customDuties];
    setCustomDuties(next);
    saveCustomDuties(next);
    flash(`✓ DEPLOYED VOLUNTEER SHIFT "${newD.title}".`);
    setDtTitle('');
    setDtDesc('');
  }

  function handleDeleteDuty(id: string) {
    const next = customDuties.filter((d) => d.id !== id);
    setCustomDuties(next);
    saveCustomDuties(next);
    flash('✓ REMOVED CUSTOM VOLUNTEER SHIFT.');
  }

  function handleAddMarketItem(e: React.FormEvent) {
    e.preventDefault();
    if (!mkTitle.trim()) return;
    const newM: MarketItem = {
      id: `custom-mkt-${Date.now()}`,
      title: mkTitle.trim().toUpperCase(),
      vendor: mkVendor.trim().toUpperCase() || 'SUBSOL ARCHIVE',
      category: mkCategory,
      createdByType: 'ADMIN',
      cost: Number(mkCost) || 250,
      description: mkDesc.trim() || 'Official underground reward voucher.',
      stock: Number(mkStock) || 15,
      codePrefix: 'SUB77',
    };
    const next = [newM, ...customMarket];
    setCustomMarket(next);
    saveCustomMarketItems(next);
    flash(`✓ PUBLISHED MARKET REWARD "${newM.title}".`);
    setMkTitle('');
    setMkDesc('');
  }

  function handleDeleteMarketItem(id: string) {
    const next = customMarket.filter((m) => m.id !== id);
    setCustomMarket(next);
    saveCustomMarketItems(next);
    flash('✓ REMOVED CUSTOM MARKET DROP.');
  }

  async function handleUpdateUserRole(profileId: string, newType: AccountType) {
    if (!HAS_REAL_SUPABASE) return;
    await supabase.from('profiles').update({ account_type: newType }).eq('id', profileId);
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, account_type: newType } : p))
    );
    flash(`✓ UPDATED ACCOUNT CLEARANCE TO ${newType}.`);
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-[#EAE6DF] font-mono">
      {/* Top Root Admin Bar */}
      <header className="border-b-2 border-[#33FF00] bg-[#141414] px-4 py-3">
        <div className="max-w-xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase text-[#33FF00]">
              // ROOT ADMIN DECK (`{adminHandle || 'sfarleaza'}`)
            </div>
            <div className="text-[10px] text-[#EAE6DF]/70">
              FRECVENȚA 77 // FULL SYSTEM &amp; FIELD CONTROL
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSwitchToClientView}
              className="border border-[#33FF00] bg-black px-2.5 py-1 text-[10px] font-bold uppercase text-[#33FF00]"
            >
              [OPERATIVE VIEW]
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="border border-[#D9381E] bg-black px-2.5 py-1 text-[10px] font-bold uppercase text-[#D9381E]"
            >
              [SIGN OUT]
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 space-y-5">
        {banner && (
          <div className="border-2 border-[#33FF00] bg-[#141414] p-2.5 text-xs font-bold text-[#33FF00]">
            {banner}
          </div>
        )}

        {/* Section Navigation Bar */}
        <nav className="grid grid-cols-3 sm:grid-cols-6 gap-1 border border-[#EAE6DF]/40 bg-[#141414] p-1.5">
          {(
            [
              ['SCANNER', 'SCAN LAB'],
              ['NODES', `NODES (${customLandmarks.length})`],
              ['QUIZZES', `QUIZ (${customQuizzes.length})`],
              ['DUTIES', `SHIFTS (${customDuties.length})`],
              ['MARKET', `DROPS (${customMarket.length})`],
              ['ACCOUNTS', 'ROLES'],
            ] as [AdminSection, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`px-2 py-1.5 text-[10px] font-bold uppercase border ${
                section === key
                  ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                  : 'border-[#EAE6DF]/25 bg-black text-[#EAE6DF]/80'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* 1. SCANNER CALIBRATION & LOCAL public/refs LAB */}
        {section === 'SCANNER' && (
          <div className="border-2 border-[#33FF00] bg-[#101810] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase text-[#33FF00]">
                // SCANNER CALIBRATION &amp; LOCAL `public/refs` LAB
              </span>
              <span className="bg-[#33FF00] px-1.5 py-0.5 text-[9px] font-bold text-[#0D0D0D]">
                ACTIVE
              </span>
            </div>

            <label className="flex items-center justify-between gap-2 border border-[#EAE6DF]/30 bg-black p-2.5 text-xs cursor-pointer">
              <span className="font-bold">USE LOCAL `public/refs/*.jpg` FOR LANDMARKS</span>
              <input
                type="checkbox"
                checked={sandbox.usePublicRefs}
                onChange={(e) => {
                  updateSandbox({ usePublicRefs: e.target.checked });
                  flash(e.target.checked ? '✓ USING LOCAL /REFS IMAGES.' : '✓ USING ARCHIVE IMAGES.');
                }}
              />
            </label>

            <label className="flex items-center justify-between gap-2 border border-[#EAE6DF]/30 bg-black p-2.5 text-xs cursor-pointer">
              <span className="font-bold">SHOW ADMIN TEST TOKEN IN [SCAN]</span>
              <input
                type="checkbox"
                checked={sandbox.enabled}
                onChange={(e) => {
                  updateSandbox({ enabled: e.target.checked });
                  flash(
                    e.target.checked
                      ? '✓ ADMIN TEST TOKEN ENABLED IN [SCAN].'
                      : '✓ ADMIN TEST TOKEN HIDDEN.'
                  );
                }}
              />
            </label>

            <label className="flex items-center justify-between gap-2 border border-[#EAE6DF]/30 bg-black p-2.5 text-xs cursor-pointer">
              <span className="font-bold">LIVE PITCH MODE: AWARD +150 PTS &amp; UNLOCK CLEARANCE</span>
              <input
                type="checkbox"
                checked={sandbox.awardPointsInLiveDemo}
                onChange={(e) => updateSandbox({ awardPointsInLiveDemo: e.target.checked })}
              />
            </label>

            <div className="space-y-2 border border-[#EAE6DF]/30 bg-black p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-[#EAE6DF]/70">
                  MAX HAMMING DISTANCE TOLERANCE: {sandbox.maxHammingDistance}/64 BITS
                </span>
                <input
                  type="range"
                  min={8}
                  max={36}
                  value={sandbox.maxHammingDistance}
                  onChange={(e) => updateSandbox({ maxHammingDistance: Number(e.target.value) })}
                />
              </div>

              <input
                type="text"
                value={sandbox.refLabel}
                onChange={(e) => updateSandbox({ refLabel: e.target.value })}
                placeholder="TEST TOKEN LABEL (E.G. LandmarkTest1.jpg)"
                className="w-full border border-[#EAE6DF]/50 bg-[#141414] p-2 text-xs text-[#EAE6DF]"
              />

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] uppercase text-[#EAE6DF]/70">BUNDLED /REFS:</span>
                <button
                  type="button"
                  onClick={() => {
                    updateSandbox({
                      refImageDataUrl: './refs/LandmarkTest1.jpg',
                      refLabel: 'LandmarkTest1.jpg',
                      enabled: true,
                    });
                    flash('✓ LOADED ./refs/LandmarkTest1.jpg INTO ADMIN TEST TOKEN.');
                  }}
                  className="border border-[#33FF00] bg-[#141414] px-2 py-1 text-[10px] font-bold text-[#33FF00]"
                >
                  [USE LandmarkTest1.jpg]
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateSandbox({
                      refImageDataUrl: './refs/LandmarkTest2.jpg',
                      refLabel: 'LandmarkTest2.jpg',
                      enabled: true,
                    });
                    flash('✓ LOADED ./refs/LandmarkTest2.jpg INTO ADMIN TEST TOKEN.');
                  }}
                  className="border border-[#33FF00] bg-[#141414] px-2 py-1 text-[10px] font-bold text-[#33FF00]"
                >
                  [USE LandmarkTest2.jpg]
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-[#33FF00]">
                  {sandbox.refImageDataUrl ? '✓ REFERENCE PICTURE LOADED' : 'OR UPLOAD CUSTOM PHOTO:'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSandboxRefUpload}
                  className="text-[10px] text-[#EAE6DF]"
                />
              </div>

              {sandbox.refImageDataUrl && (
                <img
                  src={sandbox.refImageDataUrl}
                  alt="Calibration preview"
                  className="mt-2 h-28 w-full object-cover border border-[#33FF00]/60 grayscale contrast-125"
                />
              )}
            </div>
          </div>
        )}

        {/* 2. SCAN NODES MANAGER */}
        {section === 'NODES' && (
          <div className="space-y-4">
            <form
              onSubmit={handleAddLandmark}
              className="border-2 border-[#EAE6DF] bg-[#141414] p-3.5 space-y-2.5"
            >
              <div className="text-xs font-bold uppercase text-[#33FF00]">
                // DEPLOY NEW SCAN NODE ({baseLandmarks.length + customLandmarks.length} ACTIVE)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="NODE TITLE"
                  value={lmTitle}
                  onChange={(e) => setLmTitle(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  required
                />
                <input
                  type="text"
                  placeholder="BAND OR SCENE"
                  value={lmBand}
                  onChange={(e) => setLmBand(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="ERA"
                  value={lmEra}
                  onChange={(e) => setLmEra(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
                <select
                  value={lmDifficulty}
                  onChange={(e) =>
                    setLmDifficulty(e.target.value as 'RECON' | 'FIELD' | 'DEEP COVER')
                  }
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                >
                  <option value="RECON">RECON</option>
                  <option value="FIELD">FIELD</option>
                  <option value="DEEP COVER">DEEP COVER</option>
                </select>
                <input
                  type="number"
                  placeholder="POINTS"
                  value={lmPoints}
                  onChange={(e) => setLmPoints(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>
              <input
                type="text"
                placeholder="LOCATION HINT"
                value={lmLocation}
                onChange={(e) => setLmLocation(e.target.value)}
                className="w-full border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
              <input
                type="text"
                placeholder="RIDDLE / CLUE"
                value={lmRiddle}
                onChange={(e) => setLmRiddle(e.target.value)}
                className="w-full border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
              <input
                type="text"
                placeholder="ARCHIVE LORE / STORY"
                value={lmStory}
                onChange={(e) => setLmStory(e.target.value)}
                className="w-full border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
              <div className="flex items-center justify-between gap-2 border border-[#EAE6DF]/40 bg-black p-2 text-xs">
                <span className="text-[10px] uppercase text-[#EAE6DF]/80">
                  {lmRefImage ? '✓ REFERENCE PHOTO + DHASH READY' : 'UPLOAD TARGET PHOTO:'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLandmarkPhotoUpload}
                  className="text-[10px] text-[#33FF00]"
                />
              </div>
              <button
                type="submit"
                className="w-full border-2 border-[#EAE6DF] bg-[#33FF00] p-2.5 text-xs font-bold uppercase text-[#0D0D0D]"
              >
                DEPLOY SCAN NODE TO FIELD RADAR
              </button>
            </form>

            {customLandmarks.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase text-[#EAE6DF]/70">
                  CUSTOM DEPLOYED NODES ({customLandmarks.length})
                </div>
                {customLandmarks.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border border-[#EAE6DF]/40 bg-[#141414] p-2.5 text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#EAE6DF]">{item.title}</div>
                      <div className="text-[10px] text-[#33FF00]">
                        {item.band} • +{item.points} PTS
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteLandmark(item.id)}
                      className="border border-[#D9381E] px-2 py-1 text-[10px] font-bold text-[#D9381E]"
                    >
                      [DELETE]
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. ARCHIVE TRIVIA QUIZZES */}
        {section === 'QUIZZES' && (
          <div className="space-y-4">
            <form
              onSubmit={handleAddQuiz}
              className="border-2 border-[#EAE6DF] bg-[#141414] p-3.5 space-y-2.5"
            >
              <div className="text-xs font-bold uppercase text-[#33FF00]">
                // DEPLOY ARCHIVE TRIVIA CHALLENGE
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="CHALLENGE TITLE"
                  value={qTitle}
                  onChange={(e) => setQTitle(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  required
                />
                <select
                  value={qTopic}
                  onChange={(e) => setQTopic(e.target.value as QuizTopic)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                >
                  <option value="HISTORY & CENSORSHIP">HISTORY &amp; CENSORSHIP</option>
                  <option value="GEAR & SOUND">GEAR &amp; SOUND</option>
                  <option value="LOCAL SCENE & BANDS">LOCAL SCENE &amp; BANDS</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="TRIVIA QUESTION"
                value={qQuestion}
                onChange={(e) => setQQuestion(e.target.value)}
                className="w-full border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {qOpts.map((opt, idx) => (
                  <input
                    key={idx}
                    type="text"
                    placeholder={`OPTION ${idx + 1} ${idx === qCorrect ? '(CORRECT)' : ''}`}
                    value={opt}
                    onChange={(e) => {
                      const next = [...qOpts];
                      next[idx] = e.target.value;
                      setQOpts(next);
                    }}
                    className={`border p-2 text-xs bg-black text-[#EAE6DF] ${
                      idx === qCorrect ? 'border-[#33FF00]' : 'border-[#EAE6DF]/50'
                    }`}
                    required
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={qCorrect}
                  onChange={(e) => setQCorrect(Number(e.target.value))}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                >
                  <option value={0}>CORRECT ANSWER: #1</option>
                  <option value={1}>CORRECT ANSWER: #2</option>
                  <option value={2}>CORRECT ANSWER: #3</option>
                  <option value={3}>CORRECT ANSWER: #4</option>
                </select>
                <input
                  type="number"
                  placeholder="REWARD PTS"
                  value={qReward}
                  onChange={(e) => setQReward(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>
              <button
                type="submit"
                className="w-full border-2 border-[#EAE6DF] bg-[#33FF00] p-2.5 text-xs font-bold uppercase text-[#0D0D0D]"
              >
                DEPLOY QUIZ NODE TO ARCHIVE
              </button>
            </form>

            {customQuizzes.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between border border-[#EAE6DF]/40 bg-[#141414] p-2.5 text-xs"
              >
                <div>
                  <div className="font-bold text-[#EAE6DF]">{q.title}</div>
                  <div className="text-[10px] text-[#33FF00]">
                    {q.topic} • +{q.rewardPoints} PTS
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteQuiz(q.id)}
                  className="border border-[#D9381E] px-2 py-1 text-[10px] font-bold text-[#D9381E]"
                >
                  [DELETE]
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 4. REPEATABLE VOLUNTEER SHIFTS */}
        {section === 'DUTIES' && (
          <div className="space-y-4">
            <form
              onSubmit={handleAddDuty}
              className="border-2 border-[#EAE6DF] bg-[#141414] p-3.5 space-y-2.5"
            >
              <div className="text-xs font-bold uppercase text-[#33FF00]">
                // DEPLOY REPEATABLE VOLUNTEER SHIFT
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="SHIFT TITLE (E.G. AMP LOAD-IN)"
                  value={dtTitle}
                  onChange={(e) => setDtTitle(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  required
                />
                <input
                  type="text"
                  placeholder="VENUE OR BAND"
                  value={dtVenue}
                  onChange={(e) => setDtVenue(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={dtType}
                  onChange={(e) => setDtType(e.target.value as CommunityDuty['dutyType'])}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                >
                  <option value="ROADIE SHIFT">ROADIE SHIFT</option>
                  <option value="POSTER RUN">POSTER RUN</option>
                  <option value="MERCH DESK">MERCH DESK</option>
                  <option value="SOUNDCHECK HELP">SOUNDCHECK HELP</option>
                </select>
                <input
                  type="number"
                  placeholder="POINTS"
                  value={dtPoints}
                  onChange={(e) => setDtPoints(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
                <input
                  type="text"
                  placeholder="CODE (CREW77)"
                  value={dtCode}
                  onChange={(e) => setDtCode(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>
              <input
                type="text"
                placeholder="INSTANT REAL-WORLD PERK (E.G. BACKSTAGE + BAR TOKEN)"
                value={dtReward}
                onChange={(e) => setDtReward(e.target.value)}
                className="w-full border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
              <input
                type="text"
                placeholder="LOCATION / CHECK-IN INSTRUCTIONS"
                value={dtHint}
                onChange={(e) => setDtHint(e.target.value)}
                className="w-full border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
              <button
                type="submit"
                className="w-full border-2 border-[#EAE6DF] bg-[#33FF00] p-2.5 text-xs font-bold uppercase text-[#0D0D0D]"
              >
                DEPLOY REPEATABLE SHIFT
              </button>
            </form>

            {customDuties.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between border border-[#EAE6DF]/40 bg-[#141414] p-2.5 text-xs"
              >
                <div>
                  <div className="font-bold text-[#EAE6DF]">{d.title}</div>
                  <div className="text-[10px] text-[#33FF00]">
                    {d.bandOrVenue} • CODE: {d.verificationCode} • +{d.points} PTS
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteDuty(d.id)}
                  className="border border-[#D9381E] px-2 py-1 text-[10px] font-bold text-[#D9381E]"
                >
                  [DELETE]
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 5. MARKET DROPS & VOUCHERS */}
        {section === 'MARKET' && (
          <div className="space-y-4">
            <form
              onSubmit={handleAddMarketItem}
              className="border-2 border-[#EAE6DF] bg-[#141414] p-3.5 space-y-2.5"
            >
              <div className="text-xs font-bold uppercase text-[#33FF00]">
                // PUBLISH MARKET REWARD OR GIG PASS
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="REWARD TITLE"
                  value={mkTitle}
                  onChange={(e) => setMkTitle(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                  required
                />
                <input
                  type="text"
                  placeholder="VENDOR / VENUE"
                  value={mkVendor}
                  onChange={(e) => setMkVendor(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={mkCategory}
                  onChange={(e) => setMkCategory(e.target.value as MarketItem['category'])}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                >
                  <option value="GIG ACCESS">GIG ACCESS</option>
                  <option value="BAND MERCH">BAND MERCH</option>
                  <option value="ARCHIVE MEDIA">ARCHIVE MEDIA</option>
                  <option value="BACKSTAGE">BACKSTAGE</option>
                </select>
                <input
                  type="number"
                  placeholder="COST (PTS)"
                  value={mkCost}
                  onChange={(e) => setMkCost(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
                <input
                  type="number"
                  placeholder="STOCK"
                  value={mkStock}
                  onChange={(e) => setMkStock(e.target.value)}
                  className="border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>
              <input
                type="text"
                placeholder="DESCRIPTION & REDEMPTION DETAILS"
                value={mkDesc}
                onChange={(e) => setMkDesc(e.target.value)}
                className="w-full border border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
              <button
                type="submit"
                className="w-full border-2 border-[#EAE6DF] bg-[#33FF00] p-2.5 text-xs font-bold uppercase text-[#0D0D0D]"
              >
                PUBLISH TO SUBSOL MARKET
              </button>
            </form>

            {customMarket.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border border-[#EAE6DF]/40 bg-[#141414] p-2.5 text-xs"
              >
                <div>
                  <div className="font-bold text-[#EAE6DF]">{m.title}</div>
                  <div className="text-[10px] text-[#33FF00]">
                    {m.vendor} • {m.cost} PTS • STOCK: {m.stock}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteMarketItem(m.id)}
                  className="border border-[#D9381E] px-2 py-1 text-[10px] font-bold text-[#D9381E]"
                >
                  [DELETE]
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 6. ACCOUNTS & CLEARANCE ROLES */}
        {section === 'ACCOUNTS' && (
          <div className="border-2 border-[#EAE6DF] bg-[#141414] p-3.5 space-y-3">
            <div className="text-xs font-bold uppercase text-[#33FF00]">
              // REGISTERED OPERATIVES &amp; CLEARANCE ROLES
            </div>
            <div className="text-[11px] text-[#EAE6DF]/75">
              WHITELISTED ROOT HANDLES: {WHITELISTED_ADMINS.join(', ')}
            </div>
            {!HAS_REAL_SUPABASE ? (
              <div className="border border-[#EAE6DF]/30 bg-black p-3 text-xs text-[#EAE6DF]/70">
                Running in local offline mode — account role switching is available when Supabase
                env keys are active.
              </div>
            ) : loadingProfiles ? (
              <div className="text-xs text-[#33FF00]">LOADING PROFILES...</div>
            ) : (
              <div className="space-y-2">
                {profiles.map((prof) => (
                  <div
                    key={prof.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-[#EAE6DF]/35 bg-black p-2.5 text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#EAE6DF]">@{prof.handle}</div>
                      <div className="text-[10px] text-[#33FF00]">
                        {prof.account_type} • {prof.points} PTS
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {(['OPERATIVE', 'BAND', 'ADMIN'] as AccountType[]).map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => handleUpdateUserRole(prof.id, role)}
                          className={`px-2 py-1 text-[9px] font-bold border ${
                            prof.account_type === role
                              ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                              : 'border-[#EAE6DF]/35 bg-[#141414] text-[#EAE6DF]'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
