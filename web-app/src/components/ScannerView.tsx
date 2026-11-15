import { useEffect, useMemo, useRef, useState } from "react";
import type { Landmark } from "../types";
import {
  compressImageFile,
  hammingDistance,
  hashImageUrl,
  hashVideoFrameCandidates,
} from "../utils/geoAndHash";

interface ScannerViewProps {
  landmarks: Landmark[];
  unlockedIds: string[];
  onUnlockSpot: (landmarkId: string) => void;
}

type CameraStatus = "starting" | "live" | "denied";

const BAND_NODES_STORAGE_KEY = "frecventa77_band_scan_nodes";
const MATCH_THRESHOLD = 42;

function FallbackFacade({ reason }: { reason: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#141414]">
      <svg
        viewBox="0 0 200 140"
        className="h-3/4 w-3/4 text-[#EAE6DF]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="30" y="20" width="140" height="110" />
        <rect x="20" y="12" width="160" height="8" />
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <rect key={`${row}-${col}`} x={42 + col * 32} y={32 + row * 28} width="18" height="18" />
          ))
        )}
        <rect x="88" y="104" width="24" height="26" />
        <line x1="10" y1="130" x2="190" y2="130" />
      </svg>
      <p className="mt-2 px-4 text-center font-mono text-xs uppercase text-[#D9381E]">{reason}</p>
    </div>
  );
}

export default function ScannerView({
  landmarks,
  unlockedIds,
  onUnlockSpot,
}: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const refHashesRef = useRef<Record<string, string>>({});

  const [camera, setCamera] = useState<CameraStatus>("starting");
  const [zoom, setZoom] = useState<number>(1);
  const [genreFilter, setGenreFilter] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string>(landmarks[0]?.id ?? "");
  const [liveSimilarity, setLiveSimilarity] = useState<number>(0);
  const [matchStreak, setMatchStreak] = useState<number>(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showRefPreview, setShowRefPreview] = useState<boolean>(false);

  const [customNodes, setCustomNodes] = useState<Landmark[]>(() => {
    try {
      const saved = localStorage.getItem(BAND_NODES_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Landmark[]) : [];
    } catch {
      return [];
    }
  });

  const [showBandForm, setShowBandForm] = useState(false);
  const [bandName, setBandName] = useState("");
  const [bandGenre, setBandGenre] = useState("Post-Punk / Noise");
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeRiddle, setNodeRiddle] = useState("");
  const [nodeBio, setNodeBio] = useState("");
  const [nodeTrackUrl, setNodeTrackUrl] = useState("https://bandcamp.com");
  const [nodePhotoData, setNodePhotoData] = useState<string>("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [portalNotice, setPortalNotice] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(BAND_NODES_STORAGE_KEY, JSON.stringify(customNodes));
  }, [customNodes]);

  const allNodes = useMemo(() => [...customNodes, ...landmarks], [customNodes, landmarks]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    allNodes.forEach((n) => {
      if (n.genre) set.add(n.genre);
    });
    return ["ALL", ...Array.from(set)];
  }, [allNodes]);

  const filteredNodes = useMemo(() => {
    if (genreFilter === "ALL") return allNodes;
    return allNodes.filter((n) => n.genre === genreFilter);
  }, [allNodes, genreFilter]);

  const selected = allNodes.find((l) => l.id === selectedId) ?? filteredNodes[0];
  const opened = allNodes.find((l) => l.id === openId);

  useEffect(() => {
    let cancelled = false;
    async function computeAllHashes() {
      for (const item of allNodes) {
        if (!item.referenceImageUrl || refHashesRef.current[item.id]) continue;
        try {
          const h = await hashImageUrl(item.referenceImageUrl);
          if (!cancelled) {
            refHashesRef.current[item.id] = h;
          }
        } catch (err) {
          console.warn(`Failed to hash reference image for ${item.id}:`, err);
        }
      }
    }
    void computeAllHashes();
    return () => {
      cancelled = true;
    };
  }, [allNodes]);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("denied");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCamera("live");
      } catch {
        if (!cancelled) setCamera("denied");
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (camera === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [camera]);

  // Multi-scale live dHash matcher (checks current zoom + a 1.3x tighter inner crop)
  useEffect(() => {
    if (camera !== "live" || !selected || openId) return;
    if (selected.isCommunityBand && selected.approved === false) return;

    const timer = window.setInterval(() => {
      if (!videoRef.current) return;
      const targetHash = refHashesRef.current[selected.id];
      if (!targetHash) return;

      const candidates = [
        ...hashVideoFrameCandidates(videoRef.current, zoom),
        ...hashVideoFrameCandidates(videoRef.current, Math.min(3.5, zoom * 1.25)),
      ];
      if (candidates.length === 0) return;

      let bestDist = 128;
      for (const cand of candidates) {
        const d = hammingDistance(cand, targetHash);
        if (d < bestDist) bestDist = d;
      }

      const similarityPct = Math.max(0, Math.min(100, Math.round(((128 - bestDist) / 128) * 100)));
      setLiveSimilarity(similarityPct);

      if (bestDist <= MATCH_THRESHOLD) {
        setMatchStreak((prev) => {
          const next = prev + 1;
          if (next >= 2) {
            onUnlockSpot(selected.id);
            setOpenId(selected.id);
            return 0;
          }
          return next;
        });
      } else {
        setMatchStreak(0);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [camera, selected, openId, zoom, onUnlockSpot]);

  function triggerInstantUnlock() {
    if (!selected) return;
    if (selected.isCommunityBand && selected.approved === false) {
      setPortalNotice("[X] NODE PENDING CURATOR APPROVAL");
      return;
    }
    onUnlockSpot(selected.id);
    setOpenId(selected.id);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setNodePhotoData(compressed);
    } catch (err) {
      console.error(err);
      setPortalNotice("[X] COULD NOT PROCESS REFERENCE PHOTO");
    }
  }

  function handleBandApplicationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bandName.trim() || !nodeTitle.trim()) return;

    const newNode: Landmark = {
      id: `band-node-${Date.now()}`,
      band: bandName.trim(),
      genre: bandGenre.trim() || "Indie / Underground",
      title: nodeTitle.trim(),
      riddle:
        nodeRiddle.trim() ||
        `Caută posterul sau stickerul trupei ${bandName.trim()} în zona underground din Timișoara.`,
      historyText:
        nodeBio.trim() ||
        `${bandName.trim()} este o trupă independentă din scena locală timișoreană. Scanează afișele lor din oraș pentru a le descoperi muzica și concertele.`,
      audioUrl: "./audio/sample.mp3",
      localCoverUrl: nodeTrackUrl.trim() || "https://bandcamp.com",
      referenceImageUrl: nodePhotoData || "./refs/LandmarkTest1.jpg",
      points: 150,
      isCommunityBand: true,
      approved: autoApprove,
    };

    setCustomNodes((prev) => [newNode, ...prev]);
    setSelectedId(newNode.id);
    setBandName("");
    setNodeTitle("");
    setNodeRiddle("");
    setNodeBio("");
    setNodePhotoData("");
    setShowBandForm(false);
    setPortalNotice(
      autoApprove
        ? `>> BAND SCAN NODE LIVE: ${newNode.band.toUpperCase()}`
        : `>> APPLICATION SUBMITTED: AWAITING CURATOR APPROVAL`
    );
  }

  function toggleApproveNode(id: string) {
    setCustomNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, approved: !n.approved } : n))
    );
  }

  const lockProgress = Math.min(100, Math.round((matchStreak / 2) * 100));

  return (
    <div className="space-y-4 font-mono text-[#EAE6DF]">
      <div className="flex items-center justify-between border-b-2 border-[#EAE6DF] pb-2">
        <h2 className="text-lg font-bold uppercase tracking-widest">// Visual Scanner</h2>
        <span className="text-[11px] font-bold uppercase text-[#33FF00]">
          dHASH {camera === "live" ? `${zoom.toFixed(1)}x` : "SIM"}
        </span>
      </div>

      {/* Genre / Taste Filter Pills */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase text-[#EAE6DF]/70">
          FILTER BY SCENE / GENRE PREFERENCE:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableGenres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setGenreFilter(g);
                const nextList = g === "ALL" ? allNodes : allNodes.filter((n) => n.genre === g);
                if (nextList[0]) setSelectedId(nextList[0].id);
              }}
              className={`border px-2 py-0.5 text-[10px] font-bold uppercase ${
                genreFilter === g
                  ? "border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]"
                  : "border-[#EAE6DF]/40 bg-[#141414] text-[#EAE6DF]/80"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Target Node Selector */}
      <div className="space-y-2 border-2 border-[#EAE6DF] bg-[#141414] p-3">
        <label className="block text-xs font-bold uppercase">
          ACTIVE TARGET SIGNAL ({filteredNodes.length}):
          <select
            value={selected?.id ?? ""}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setMatchStreak(0);
            }}
            className="mt-1 w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs uppercase text-[#EAE6DF]"
          >
            {filteredNodes.map((l) => (
              <option key={l.id} value={l.id}>
                {unlockedIds.includes(l.id) ? "[UNLOCKED] " : "[TARGET] "}
                {l.band} — {l.title}
                {l.isCommunityBand && l.approved === false ? " (PENDING)" : ""}
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <div className="space-y-1.5 pt-1 text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#33FF00] font-bold uppercase">
                GENRE: {selected.genre || "UNDERGROUND ROCK"}
              </span>
              {selected.referenceImageUrl && (
                <button
                  type="button"
                  onClick={() => setShowRefPreview((p) => !p)}
                  className="underline text-[#EAE6DF]/80 uppercase text-[10px]"
                >
                  {showRefPreview ? "[HIDE HINT PHOTO]" : "[PEEK TARGET PHOTO]"}
                </button>
              )}
            </div>
            <p className="text-[#EAE6DF]/85 leading-relaxed">{selected.riddle}</p>

            {selected.isCommunityBand && selected.approved === false && (
              <button
                type="button"
                onClick={() => toggleApproveNode(selected.id)}
                className="border border-[#33FF00] px-2 py-1 text-[10px] font-bold uppercase text-[#33FF00]"
              >
                [CURATOR: APPROVE BAND NODE]
              </button>
            )}

            {showRefPreview && selected.referenceImageUrl && (
              <img
                src={selected.referenceImageUrl}
                alt={selected.title}
                className="mt-2 h-40 w-full object-cover border border-[#EAE6DF]/50"
              />
            )}
          </div>
        )}
      </div>

      {/* Viewfinder */}
      <div className="relative aspect-[3/4] w-full overflow-hidden border-2 border-[#EAE6DF] bg-black">
        {camera === "live" && (
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ transform: `scale(${zoom})` }}
            className="absolute inset-0 h-full w-full object-cover origin-center transition-transform duration-100"
          />
        )}
        {camera === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs uppercase text-[#33FF00]">
            &gt;&gt; REQUESTING CAMERA...
          </div>
        )}
        {camera === "denied" && (
          <FallbackFacade reason="[X] CAMERA OFFLINE // USE GLARE OVERRIDE BELOW" />
        )}

        {/* Reticle */}
        <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-[#D9381E]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-[#D9381E]" />
          <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-[#D9381E]" />
        </div>

        <p className="pointer-events-none absolute left-0 right-0 top-2 bg-black/70 py-0.5 text-center text-[11px] font-bold uppercase text-[#D9381E]">
          ALIGN WALL DETAIL / BAND POSTER IN FRAME
        </p>

        {/* Live dHash Signal Meter */}
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 bg-black/85 border border-[#EAE6DF]/40 p-2 text-[11px]">
          <div className="flex justify-between uppercase">
            <span className="text-[#33FF00]">VISUAL CORRELATION: {liveSimilarity}%</span>
            <span className="text-[#EAE6DF]">
              {lockProgress > 0 ? `LOCKING ${lockProgress}%` : "SCANNING..."}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full bg-[#141414]">
            <div
              className="h-full bg-[#33FF00] transition-all duration-150"
              style={{ width: `${Math.max(liveSimilarity, lockProgress)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Optical / Digital Zoom Control Bar */}
      {camera === "live" && (
        <div className="border-2 border-[#EAE6DF] bg-[#141414] p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase">
            <span>OPTICAL / DIGITAL ZOOM: {zoom.toFixed(1)}x</span>
            <div className="flex gap-1.5">
              {[1, 1.5, 2, 2.5].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setZoom(preset)}
                  className={`border px-2 py-0.5 text-[10px] font-bold ${
                    Math.abs(zoom - preset) < 0.05
                      ? "border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]"
                      : "border-[#EAE6DF]/50 bg-black text-[#EAE6DF]"
                  }`}
                >
                  {preset}x
                </button>
              ))}
            </div>
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-[#33FF00]"
          />
        </div>
      )}

      {/* Manual / Table-Side Demo Trigger */}
      <button
        type="button"
        onClick={triggerInstantUnlock}
        className="w-full rounded-none border-2 border-[#EAE6DF] bg-[#D9381E] p-3 text-xs sm:text-sm font-bold uppercase tracking-widest text-[#EAE6DF]"
      >
        [GLARE OVERRIDE // MANUAL VERIFY]
      </button>

      {/* Band / Artist Scan Node Application Portal */}
      <div className="border-2 border-[#EAE6DF] bg-[#141414] p-3">
        <button
          type="button"
          onClick={() => setShowBandForm((prev) => !prev)}
          className="flex w-full items-center justify-between text-left text-xs font-bold uppercase tracking-wider text-[#33FF00]"
        >
          <span>[+ BAND NODE PORTAL] APPLY TO ADD SCAN POSTER / SPOT</span>
          <span>{showBandForm ? "[-]" : "[+]"}</span>
        </button>

        {showBandForm && (
          <form
            onSubmit={handleBandApplicationSubmit}
            className="mt-3 space-y-2.5 border-t border-[#EAE6DF]/30 pt-3"
          >
            <p className="text-[11px] text-[#EAE6DF]/80 leading-relaxed">
              Are you an underground Timișoara band? Upload a photo of your street poster,
              sticker, or rehearsal door so fans of your genre can hunt it down and discover your
              music live.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                  BAND NAME *
                </label>
                <input
                  type="text"
                  required
                  value={bandName}
                  onChange={(e) => setBandName(e.target.value)}
                  placeholder="EX: HĂLĂCIUGĂ"
                  className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                  SUBGENRE / SOUND *
                </label>
                <input
                  type="text"
                  required
                  value={bandGenre}
                  onChange={(e) => setBandGenre(e.target.value)}
                  placeholder="EX: Post-Punk / Sludge"
                  className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                SPOT / POSTER TITLE *
              </label>
              <input
                type="text"
                required
                value={nodeTitle}
                onChange={(e) => setNodeTitle(e.target.value)}
                placeholder="EX: Afiș Lansare EP — Zona Unirii"
                className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                LOCATION RIDDLE / CLUE
              </label>
              <input
                type="text"
                value={nodeRiddle}
                onChange={(e) => setNodeRiddle(e.target.value)}
                placeholder="Lângă gangul spre subsolul de repetiții..."
                className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                BAND BIO &amp; UPCOMING GIG INFO
              </label>
              <textarea
                rows={2}
                value={nodeBio}
                onChange={(e) => setNodeBio(e.target.value)}
                placeholder="Cine sunteți, ce cântați și unde aveți următorul concert..."
                className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                  BANDCAMP / TRACK LINK
                </label>
                <input
                  type="url"
                  value={nodeTrackUrl}
                  onChange={(e) => setNodeTrackUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-[#EAE6DF]/70 mb-1">
                  POSTER / WALL REFERENCE PHOTO
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="w-full border-2 border-[#EAE6DF] bg-black p-1.5 text-[10px] text-[#EAE6DF]"
                />
              </div>
            </div>

            <label className="flex items-center justify-between border border-dashed border-[#EAE6DF]/40 bg-black p-2 text-[11px] cursor-pointer">
              <span className="uppercase text-[#EAE6DF]/80">
                [CURATOR MODE] Auto-Approve Scan Node
              </span>
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="h-4 w-4 accent-[#33FF00]"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-none border-2 border-[#EAE6DF] bg-[#33FF00] p-2 text-xs font-bold uppercase tracking-wider text-[#0D0D0D]"
            >
              SUBMIT &amp; REGISTER SCAN NODE
            </button>
          </form>
        )}
      </div>

      {portalNotice && (
        <div className="border border-[#33FF00] bg-[#141414] p-2 text-xs uppercase text-[#33FF00]">
          {portalNotice}
        </div>
      )}

      {/* Result modal */}
      {opened && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="max-h-full w-full max-w-md overflow-y-auto border-2 border-[#0D0D0D] bg-[#EAE6DF] p-4 text-[#0D0D0D]">
            <p className="inline-block -rotate-2 border-2 border-[#D9381E] px-2 py-0.5 text-xs font-bold uppercase text-[#D9381E]">
              SIGNAL LOCKED // +{opened.points} PTS
            </p>
            <h3 className="mt-3 text-xl font-bold uppercase">{opened.title}</h3>
            <p className="text-xs font-bold uppercase">
              {opened.band} {opened.genre ? `// ${opened.genre}` : ""}
            </p>
            <p className="mt-3 text-sm leading-relaxed">{opened.historyText}</p>

            <audio controls src={opened.audioUrl} className="mt-3 w-full">
              Your browser does not support audio.
            </audio>

            <a
              href={opened.localCoverUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-none border-2 border-[#0D0D0D] bg-[#D9381E] p-2 text-center text-sm font-bold uppercase text-[#EAE6DF]"
            >
              &gt;&gt; LISTEN / FOLLOW BAND ONLINE
            </a>

            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="mt-3 w-full rounded-none border-2 border-[#0D0D0D] bg-[#0D0D0D] p-2 text-sm font-bold uppercase text-[#EAE6DF]"
            >
              [X] Close file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
