import React, { useMemo, useState } from 'react';
import {
  AccountType,
  CommunityDuty,
  Landmark,
  QuizNode,
  QuizTopic,
} from '../types';
import {
  getCustomDuties,
  getCustomQuizzes,
  saveCustomQuizzes,
} from '../utils/supabaseClient';

interface ArchiveAndQuizProps {
  landmarks: Landmark[];
  unlockedIds: string[];
  completedQuizNodes: string[];
  completedDutyIds: string[];
  accountType?: AccountType;
  handle?: string;
  onCompleteQuizNode: (nodeId: string, bonusPoints: number) => void;
  onCompleteDuty: (duty: CommunityDuty) => void;
}

const CORE_QUIZ_NODES: QuizNode[] = [
  {
    id: 'tree-genesis-62',
    tier: 1,
    code: 'NODE-01',
    title: 'CLEARANCE 01: GENESIS & CENSORSHIP (1962–1973)',
    topic: 'HISTORY & CENSORSHIP',
    createdByType: 'ADMIN',
    creatorHandle: 'FRECVENTA77',
    requiredLandmarkId: 'sfintii-62',
    rewardPoints: 150,
    perkLabel: 'UNLOCKS +25% SCAN AMPLIFIER & FORUM POSTING',
    briefing:
      'Prove you understand how Timișoara’s earliest rock pioneers survived state censorship and name bans.',
    questions: [
      {
        question: 'Why did Sfinții have to change their name to Phoenix in 1965?',
        options: [
          'Communist authorities banned religious references like "The Saints"',
          'Another band in Bucharest already copyrighted the name',
          'Their vinyl label Electrecord misprinted the cover',
        ],
        correctIndex: 0,
      },
      {
        question: 'Which Timișoara band performed acoustic/folk-rock anthems from 1973 through the 1989 Revolution?',
        options: ['Pro Musica (Ilie Stepan)', 'Metallica', 'Iris'],
        correctIndex: 0,
      },
    ],
  },
  {
    id: 'tree-samizdat-70s',
    tier: 2,
    code: 'NODE-02',
    title: 'CLEARANCE 02: THE MARSHALL ESCAPE & REELS (1977)',
    topic: 'GEAR & SOUND',
    createdByType: 'ADMIN',
    creatorHandle: 'FRECVENTA77',
    requiredLandmarkId: 'progresiv-tm',
    rewardPoints: 200,
    perkLabel: 'UNLOCKS -20% SAMIZDAT MARKET DISCOUNT',
    briefing:
      'Verify knowledge of the 1977 border escape and underground magnetic tape circulation.',
    questions: [
      {
        question: 'How did Phoenix members escape Romania in June 1977?',
        options: [
          'Hidden inside hollowed-out Marshall speaker cabinets',
          'Disguised as diplomats on a train to Vienna',
          'By swimming across the Danube near Orsova',
        ],
        correctIndex: 0,
      },
      {
        question: 'How did censored tracks by Progresiv TM spread across Romania in the 1970s?',
        options: [
          'Duplicated privately on open-reel magnetic tapes (magnetofon)',
          'Broadcast nightly on national state television',
          'Distributed as free CDs with Scînteia newspaper',
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    id: 'tree-heavy-85',
    tier: 3,
    code: 'NODE-03',
    title: 'CLEARANCE 03: HEAVY RESISTANCE & ROADIE OATH',
    topic: 'LOCAL SCENE & BANDS',
    createdByType: 'ADMIN',
    creatorHandle: 'FRECVENTA77',
    requiredDutyCount: 3,
    rewardPoints: 300,
    perkLabel: 'UNLOCKS [SUBSOL89] SECRET GIGS & [ROADIE // HISTORIAN] BADGE',
    briefing:
      'Complete 3 real-world Roadie/Volunteer shifts and pass final interrogation to join the inner backstage circle.',
    questions: [
      {
        question: 'Who founded Timișoara heavy rock pioneers Cargo in 1985?',
        options: ['Adi Bărar', 'Nicu Covaci', 'Ilie Stepan'],
        correctIndex: 0,
      },
      {
        question: 'What keeps Timișoara’s underground rock scene alive today?',
        options: [
          'Operatives showing up for local bands, hauling gear, and filling small venues',
          'Waiting for mainstream radio to play underground bands',
          'Keeping music history locked inside museums',
        ],
        correctIndex: 0,
      },
    ],
  },
];

const CORE_DUTIES: CommunityDuty[] = [
  {
    id: 'duty-roadie-manufactura',
    title: 'AMP LOAD-IN & SOUNDCHECK CREW',
    bandOrVenue: 'Manufactura // Zgomot Subteran',
    dutyType: 'ROADIE SHIFT',
    points: 120,
    instantReward: 'SOUNDCHECK BACKSTAGE HANG + 1x GUESTLIST TOKEN FOR NEXT SHOW',
    locationHint: 'Splaiul Tudor Vladimirescu 9 (18:30 Soundcheck)',
    verificationCode: 'AMP77',
    description:
      'You are already inside for the gig—help haul 4x12 cabs & mic stands pre-doors and hang with the band at soundcheck.',
  },
  {
    id: 'duty-poster-complex',
    title: 'SAMIZDAT FLYERING RUN — COMPLEXUL STUDENȚESC',
    bandOrVenue: 'Frecvența 77 Street Team',
    dutyType: 'POSTER RUN',
    points: 100,
    instantReward: 'FREE DOOR ENTRY FOR TONIGHT’S GIG + RISOGRAPH ZINE',
    locationHint: 'Aleea Studenților / Cămine UPT',
    verificationCode: 'ZINE77',
    description:
      'Put up 15 risograph gig posters on legal campus boards before the show to earn your way onto tonight’s door list.',
  },
  {
    id: 'duty-merch-darc',
    title: 'INDIE MERCH & TAPE DESK SHIFT',
    bandOrVenue: "D'arc pe Mal // Hălăciugă",
    dutyType: 'MERCH DESK',
    points: 130,
    instantReward: 'FREE BAND CASSETTE / PATCH FROM TABLE + DRINK VOUCHER',
    locationHint: 'Malul Begăi (21:00–22:30)',
    verificationCode: 'TAPE77',
    description:
      'Watch the cassette & screen-printed patch table while the band plays their set; take home a tape & bar token.',
  },
  {
    id: 'duty-standing-open-call',
    title: 'STANDING SCENE CALL: GEAR TEARDOWN & VAN PACK',
    bandOrVenue: 'Any Timișoara Underground Venue (Always Open)',
    dutyType: 'SOUNDCHECK HELP',
    points: 110,
    instantReward: 'REPEATABLE SHIFT • +110 PTS + REHEARSAL ROOM / BAR TOKEN',
    repeatable: true,
    locationHint: 'End-of-night stage load-out (Manufactura / Reflektor / D’arc)',
    verificationCode: 'CREW77',
    description:
      'Always-available volunteer shift: help local bands coil cables and pack amps after the encore. Can be logged every gig night.',
  },
];

export default function ArchiveAndQuiz({
  landmarks,
  unlockedIds,
  completedQuizNodes,
  completedDutyIds,
  accountType = 'OPERATIVE',
  handle = 'OPERATIVE',
  onCompleteQuizNode,
  onCompleteDuty,
}: ArchiveAndQuizProps) {
  const [subTab, setSubTab] = useState<'DOSSIERS' | 'ROADIE' | 'CLEARANCE'>('CLEARANCE');
  const [customQuizzes, setCustomQuizzes] = useState<QuizNode[]>(() => getCustomQuizzes());
  const allQuizzes = useMemo(() => [...customQuizzes, ...CORE_QUIZ_NODES], [customQuizzes]);
  const allDuties = useMemo(() => [...getCustomDuties(), ...CORE_DUTIES], []);

  // Filters for Quizzes
  const [creatorFilter, setCreatorFilter] = useState<'ALL' | 'ADMIN' | 'BAND'>('ALL');
  const [topicFilter, setTopicFilter] = useState<'ALL' | QuizTopic>('ALL');

  // Active Quiz runner state
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);

  // Band Quiz Composer state
  const [showBandQuizForm, setShowBandQuizForm] = useState(false);
  const [bqTitle, setBqTitle] = useState('');
  const [bqTopic, setBqTopic] = useState<QuizTopic>('LOCAL SCENE & BANDS');
  const [bqQuestion, setBqQuestion] = useState('');
  const [bqOptA, setBqOptA] = useState('');
  const [bqOptB, setBqOptB] = useState('');
  const [bqOptC, setBqOptC] = useState('');
  const [bqCorrect, setBqCorrect] = useState(0);

  // Roadie verification code input
  const [dutyCodes, setDutyCodes] = useState<Record<string, string>>({});
  const [dutyFeedback, setDutyFeedback] = useState<string | null>(null);

  const canCreateQuiz = accountType === 'BAND' || accountType === 'ADMIN';

  const filteredQuizzes = allQuizzes.filter((q) => {
    if (creatorFilter !== 'ALL' && q.createdByType !== creatorFilter) return false;
    if (topicFilter !== 'ALL' && q.topic !== topicFilter) return false;
    return true;
  });

  function handleSubmitQuiz(node: QuizNode) {
    const allCorrect = node.questions.every((q, idx) => answers[idx] === q.correctIndex);
    if (!allCorrect) {
      setQuizFeedback('[X] INTERROGATION FAILED — CHECK THE ARCHIVE DOSSIERS & RETRY.');
      return;
    }
    onCompleteQuizNode(node.id, node.rewardPoints);
    setQuizFeedback(`✓ ${node.code} VERIFIED! +${node.rewardPoints} SIGNAL PTS CREDITED.`);
    setActiveQuizId(null);
    setAnswers({});
  }

  function handleCreateBandQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!bqTitle.trim() || !bqQuestion.trim()) return;
    const created: QuizNode = {
      id: `band-qz-${Date.now()}`,
      tier: 1,
      code: `BAND-${Math.floor(10 + Math.random() * 89)}`,
      title: bqTitle.trim().toUpperCase(),
      topic: bqTopic,
      createdByType: accountType === 'ADMIN' ? 'ADMIN' : 'BAND',
      creatorHandle: handle,
      rewardPoints: 125,
      perkLabel: '+125 SIGNAL PTS & BAND LORE STAMP',
      briefing: `Official band challenge created by @${handle}.`,
      questions: [
        {
          question: bqQuestion.trim(),
          options: [
            bqOptA.trim() || 'Answer A',
            bqOptB.trim() || 'Answer B',
            bqOptC.trim() || 'Answer C',
          ],
          correctIndex: bqCorrect,
        },
      ],
    };
    const next = [created, ...customQuizzes];
    setCustomQuizzes(next);
    saveCustomQuizzes(next);
    setBqTitle('');
    setBqQuestion('');
    setBqOptA('');
    setBqOptB('');
    setBqOptC('');
    setShowBandQuizForm(false);
    setQuizFeedback(`✓ PUBLISHED BAND QUIZ: ${created.title}`);
  }

  function handleVerifyDuty(duty: CommunityDuty) {
    const entered = (dutyCodes[duty.id] || '').trim().toUpperCase();
    if (entered !== duty.verificationCode.toUpperCase()) {
      setDutyFeedback(
        `[X] INVALID STAGE CODE FOR "${duty.title}". ASK THE BAND/COORDINATOR ON SITE (DEMO HINT: ${duty.verificationCode}).`
      );
      return;
    }
    onCompleteDuty(duty);
    setDutyFeedback(`✓ SHIFT LOGGED: ${duty.title} (+${duty.points} PTS)`);
  }

  return (
    <div className="space-y-4 font-mono text-[#EAE6DF]">
      <div className="flex items-center justify-between border-b-2 border-[#EAE6DF] pb-2">
        <h2 className="text-lg font-bold uppercase tracking-widest">// History, Shifts &amp; Quizzes</h2>
        <span className="text-xs text-[#33FF00]">
          {completedQuizNodes.length}/{allQuizzes.length} NODES
        </span>
      </div>

      {/* 3-Part Sub-navigation */}
      <div className="grid grid-cols-3 border-2 border-[#EAE6DF] bg-[#141414]">
        <button
          type="button"
          onClick={() => setSubTab('CLEARANCE')}
          className={`p-2 text-[10px] sm:text-xs font-bold uppercase border-r border-[#EAE6DF] ${
            subTab === 'CLEARANCE' ? 'bg-[#D9381E] text-[#EAE6DF]' : 'text-[#EAE6DF]/75'
          }`}
        >
          01. QUIZZES
        </button>
        <button
          type="button"
          onClick={() => setSubTab('ROADIE')}
          className={`p-2 text-[10px] sm:text-xs font-bold uppercase border-r border-[#EAE6DF] ${
            subTab === 'ROADIE' ? 'bg-[#D9381E] text-[#EAE6DF]' : 'text-[#EAE6DF]/75'
          }`}
        >
          02. ROADIE ({completedDutyIds.length}/3)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('DOSSIERS')}
          className={`p-2 text-[10px] sm:text-xs font-bold uppercase ${
            subTab === 'DOSSIERS' ? 'bg-[#D9381E] text-[#EAE6DF]' : 'text-[#EAE6DF]/75'
          }`}
        >
          03. ARCHIVE ({unlockedIds.length}/{landmarks.length})
        </button>
      </div>

      {/* SUBTAB 1: CLEARANCE & BAND QUIZZES WITH CREATOR + TOPIC FILTERS */}
      {subTab === 'CLEARANCE' && (
        <div className="space-y-3">
          {/* Creator & Topic Filter Controls */}
          <div className="border border-[#EAE6DF]/40 bg-[#141414] p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[9px] uppercase text-[#EAE6DF]/60 mr-1">CREATOR:</span>
              {(
                [
                  ['ALL', 'ALL'],
                  ['ADMIN', 'ADMIN ARCHIVE'],
                  ['BAND', 'LOCAL BANDS'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCreatorFilter(val)}
                  className={`px-2 py-0.5 text-[9px] font-bold uppercase border ${
                    creatorFilter === val
                      ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                      : 'border-[#EAE6DF]/30 bg-black text-[#EAE6DF]/75'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[9px] uppercase text-[#EAE6DF]/60 mr-1">TOPIC:</span>
              {(
                [
                  'ALL',
                  'HISTORY & CENSORSHIP',
                  'GEAR & SOUND',
                  'LOCAL SCENE & BANDS',
                ] as const
              ).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopicFilter(t)}
                  className={`px-2 py-0.5 text-[9px] font-bold uppercase border ${
                    topicFilter === t
                      ? 'border-[#D9381E] bg-[#D9381E] text-[#EAE6DF]'
                      : 'border-[#EAE6DF]/30 bg-black text-[#EAE6DF]/75'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Band / Admin Quiz Creator Button */}
          {canCreateQuiz && (
            <div>
              <button
                type="button"
                onClick={() => setShowBandQuizForm((p) => !p)}
                className="w-full border-2 border-[#33FF00] bg-black p-2 text-xs font-bold uppercase text-[#33FF00]"
              >
                {showBandQuizForm
                  ? '[- CLOSE BAND QUIZ EDITOR]'
                  : '[+ PUBLISH BAND / SCENE QUIZ]'}
              </button>

              {showBandQuizForm && (
                <form
                  onSubmit={handleCreateBandQuiz}
                  className="mt-2 border-2 border-[#33FF00] bg-[#141414] p-3 space-y-2"
                >
                  <input
                    required
                    value={bqTitle}
                    onChange={(e) => setBqTitle(e.target.value)}
                    placeholder="QUIZ TITLE (EX: ZGOMOT SUBTERAN LYRIC CHECK)"
                    className="w-full border border-[#EAE6DF] bg-black p-2 text-xs"
                  />
                  <select
                    value={bqTopic}
                    onChange={(e) => setBqTopic(e.target.value as QuizTopic)}
                    className="w-full border border-[#EAE6DF] bg-black p-2 text-xs"
                  >
                    <option value="LOCAL SCENE & BANDS">TOPIC: LOCAL SCENE &amp; BANDS</option>
                    <option value="GEAR & SOUND">TOPIC: GEAR &amp; SOUND</option>
                    <option value="HISTORY & CENSORSHIP">TOPIC: HISTORY &amp; CENSORSHIP</option>
                  </select>
                  <input
                    required
                    value={bqQuestion}
                    onChange={(e) => setBqQuestion(e.target.value)}
                    placeholder="QUESTION FOR FANS / OPERATIVES"
                    className="w-full border border-[#EAE6DF] bg-black p-2 text-xs"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    <input
                      required
                      value={bqOptA}
                      onChange={(e) => setBqOptA(e.target.value)}
                      placeholder="OPTION A"
                      className="border border-[#EAE6DF] bg-black p-1.5 text-xs"
                    />
                    <input
                      required
                      value={bqOptB}
                      onChange={(e) => setBqOptB(e.target.value)}
                      placeholder="OPTION B"
                      className="border border-[#EAE6DF] bg-black p-1.5 text-xs"
                    />
                    <input
                      required
                      value={bqOptC}
                      onChange={(e) => setBqOptC(e.target.value)}
                      placeholder="OPTION C"
                      className="border border-[#EAE6DF] bg-black p-1.5 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={bqCorrect}
                      onChange={(e) => setBqCorrect(Number(e.target.value))}
                      className="border border-[#EAE6DF] bg-black p-1.5 text-xs"
                    >
                      <option value={0}>CORRECT: OPTION A</option>
                      <option value={1}>CORRECT: OPTION B</option>
                      <option value={2}>CORRECT: OPTION C</option>
                    </select>
                    <button
                      type="submit"
                      className="border border-[#EAE6DF] bg-[#33FF00] px-3 py-1.5 text-xs font-bold uppercase text-[#0D0D0D]"
                    >
                      PUBLISH QUIZ
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {quizFeedback && (
            <div className="border-2 border-[#33FF00] bg-[#141414] p-2.5 text-xs font-bold text-[#33FF00]">
              {quizFeedback}
            </div>
          )}

          {filteredQuizzes.map((node) => {
            const isPassed = completedQuizNodes.includes(node.id);
            const missingLandmark =
              node.requiredLandmarkId && !unlockedIds.includes(node.requiredLandmarkId);
            const missingDuties =
              node.requiredDutyCount && completedDutyIds.length < node.requiredDutyCount;
            const isLocked = Boolean(missingLandmark || missingDuties);
            const isOpen = activeQuizId === node.id;

            return (
              <div
                key={node.id}
                className={`border-2 p-3 space-y-2 ${
                  isPassed
                    ? 'border-[#33FF00] bg-[#101A10]'
                    : isLocked
                    ? 'border-[#EAE6DF]/35 bg-[#141414] opacity-75'
                    : 'border-[#EAE6DF] bg-[#141414]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        node.createdByType === 'BAND'
                          ? 'bg-[#D9381E] text-[#EAE6DF]'
                          : 'bg-[#EAE6DF] text-[#0D0D0D]'
                      }`}
                    >
                      {node.createdByType === 'BAND'
                        ? `BAND: @${node.creatorHandle}`
                        : 'ADMIN ARCHIVE'}
                    </span>
                    <span className="border border-[#33FF00]/60 px-1.5 py-0.5 text-[9px] text-[#33FF00]">
                      {node.topic}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-[#33FF00]">
                    {isPassed ? '✓ DECRYPTED' : `+${node.rewardPoints} PTS`}
                  </span>
                </div>

                <div className="text-xs sm:text-sm font-bold uppercase">{node.title}</div>
                <p className="text-[11px] text-[#EAE6DF]/75">{node.briefing}</p>
                <div className="text-[10px] font-bold uppercase text-[#33FF00]">
                  PERK: {node.perkLabel}
                </div>

                {isLocked ? (
                  <div className="border border-dashed border-[#D9381E] p-2 text-[10px] uppercase text-[#D9381E]">
                    {missingLandmark
                      ? `[LOCKED] SCAN REQUIRED TARGET (${node.requiredLandmarkId}) FIRST`
                      : `[LOCKED] COMPLETE ${node.requiredDutyCount} ROADIE SHIFTS FIRST (${completedDutyIds.length}/${node.requiredDutyCount})`}
                  </div>
                ) : (
                  !isPassed && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveQuizId(isOpen ? null : node.id);
                        setAnswers({});
                        setQuizFeedback(null);
                      }}
                      className="w-full border-2 border-[#EAE6DF] bg-[#D9381E] p-2 text-xs font-bold uppercase text-[#EAE6DF]"
                    >
                      {isOpen ? '[- ABORT INTERROGATION]' : '[>> START INTERROGATION]'}
                    </button>
                  )
                )}

                {isOpen && (
                  <div className="space-y-3 border-t border-[#EAE6DF]/30 pt-3">
                    {node.questions.map((q, qIdx) => (
                      <div key={qIdx} className="space-y-1.5">
                        <div className="text-xs font-bold text-[#33FF00]">
                          Q{qIdx + 1}. {q.question}
                        </div>
                        {q.options.map((opt, optIdx) => (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [qIdx]: optIdx }))
                            }
                            className={`block w-full border p-2 text-left text-xs ${
                              answers[qIdx] === optIdx
                                ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D] font-bold'
                                : 'border-[#EAE6DF]/40 bg-black text-[#EAE6DF]'
                            }`}
                          >
                            [{String.fromCharCode(65 + optIdx)}] {opt}
                          </button>
                        ))}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleSubmitQuiz(node)}
                      className="w-full border-2 border-[#EAE6DF] bg-[#33FF00] p-2 text-xs font-bold uppercase text-[#0D0D0D]"
                    >
                      SUBMIT ANSWERS &amp; CLAIM CLEARANCE
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SUBTAB 2: REAL-WORLD ROADIE & VOLUNTEER SHIFTS */}
      {subTab === 'ROADIE' && (
        <div className="space-y-3">
          <div className="border border-[#33FF00]/60 bg-[#141414] p-2.5 text-[11px]">
            EARN REAL CLEARANCE BY HELPING TIMIȘOARA BANDS &amp; VENUES ON THE GROUND. COMPLETE 3
            SHIFTS TO UNLOCK <span className="text-[#33FF00] font-bold">[SUBSOL89]</span> SECRET
            GIGS.
          </div>

          {dutyFeedback && (
            <div className="border-2 border-[#33FF00] bg-[#141414] p-2.5 text-xs font-bold text-[#33FF00]">
              {dutyFeedback}
            </div>
          )}

          {allDuties.map((duty) => {
            const timesLogged = completedDutyIds.filter((id) => id === duty.id).length;
            const done = timesLogged > 0 && !duty.repeatable;
            return (
              <div
                key={duty.id}
                className={`border-2 p-3 space-y-2 ${
                  timesLogged > 0 ? 'border-[#33FF00] bg-[#101A10]' : 'border-[#EAE6DF] bg-[#141414]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-[#D9381E] px-1.5 py-0.5 text-[10px] font-bold uppercase">
                      {duty.dutyType}
                    </span>
                    {duty.repeatable && (
                      <span className="border border-[#33FF00] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#33FF00]">
                        ALWAYS OPEN {timesLogged > 0 ? `(${timesLogged}x)` : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-[#33FF00]">
                    {done ? '✓ SHIFT VERIFIED' : `+${duty.points} PTS`}
                  </span>
                </div>
                <div className="text-sm font-bold uppercase">{duty.title}</div>
                <div className="text-[11px] text-[#33FF00]">{duty.bandOrVenue}</div>
                <div className="border border-[#33FF00]/50 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase text-[#33FF00]">
                  ON-SITE RETURN: {duty.instantReward || 'FREE MERCH / BAR TOKEN + SIGNAL PTS'}
                </div>
                <p className="text-xs text-[#EAE6DF]/80">{duty.description}</p>
                <div className="text-[10px] text-[#EAE6DF]/60">📍 {duty.locationHint}</div>

                {!done && (
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={dutyCodes[duty.id] || ''}
                      onChange={(e) =>
                        setDutyCodes((prev) => ({
                          ...prev,
                          [duty.id]: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder={`STAGE CODE (HINT: ${duty.verificationCode})`}
                      className="flex-1 border-2 border-[#EAE6DF] bg-black p-2 text-xs uppercase text-[#EAE6DF]"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerifyDuty(duty)}
                      className="border-2 border-[#EAE6DF] bg-[#33FF00] px-3 text-xs font-bold uppercase text-[#0D0D0D]"
                    >
                      LOG SHIFT
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SUBTAB 3: HISTORICAL DOSSIERS */}
      {subTab === 'DOSSIERS' && (
        <div className="space-y-3">
          {landmarks.map((lm) => {
            const unlocked = unlockedIds.includes(lm.id);
            return (
              <div
                key={lm.id}
                className={`border-2 p-3 space-y-1.5 ${
                  unlocked
                    ? 'border-[#33FF00] bg-[#141414]'
                    : 'border-[#EAE6DF]/35 bg-[#0F0F0F] opacity-70'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase">
                  <span className="text-[#33FF00] font-bold">
                    {lm.era} // {lm.band}
                  </span>
                  <span>{unlocked ? '✓ UNLOCKED' : '[ENCRYPTED — SCAN TARGET]'}</span>
                </div>
                <div className="text-sm font-bold uppercase">{lm.title}</div>
                <p className="text-xs text-[#EAE6DF]/85">
                  {unlocked ? lm.story : `CLUE: ${lm.riddle}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
