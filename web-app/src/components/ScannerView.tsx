import { useEffect, useRef, useState } from "react";
import type { Landmark } from "../types";

interface ScannerViewProps {
  landmarks: Landmark[];
  unlockedIds: string[];
  onUnlockSpot: (landmarkId: string) => void;
}

type CameraStatus = "starting" | "live" | "denied";

const SCAN_TICK_MS = 100;
const SCAN_STEP = 5; // 20 ticks x 100ms = 2 seconds

function FallbackFacade({ reason }: { reason: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#141414]">
      <svg viewBox="0 0 200 140" className="h-3/4 w-3/4 text-[#EAE6DF]" fill="none" stroke="currentColor" strokeWidth="1.5">
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

export default function ScannerView({ landmarks, unlockedIds, onUnlockSpot }: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const [camera, setCamera] = useState<CameraStatus>("starting");
  const [selectedId, setSelectedId] = useState<string>(landmarks[0]?.id ?? "");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = landmarks.find((l) => l.id === selectedId);
  const opened = landmarks.find((l) => l.id === openId);

  // Open rear camera, clean up on unmount.
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("denied");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
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

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (scanTimerRef.current !== null) window.clearInterval(scanTimerRef.current);
    };
  }, []);

  // Attach the stream once the <video> element exists.
  useEffect(() => {
    if (camera === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [camera]);

  function startScan() {
    if (!selected || scanning) return;
    setScanning(true);
    setProgress(0);
    let current = 0;
    const target = selected;
    scanTimerRef.current = window.setInterval(() => {
      current += SCAN_STEP;
      setProgress(current);
      if (current >= 100) {
        if (scanTimerRef.current !== null) window.clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
        setScanning(false);
        setProgress(0);
        onUnlockSpot(target.id);
        setOpenId(target.id);
      }
    }, SCAN_TICK_MS);
  }

  if (landmarks.length === 0) {
    return (
      <div className="border-2 border-[#EAE6DF] bg-[#141414] p-4 font-mono text-sm uppercase text-[#EAE6DF]">
        [X] NO MARKERS IN ARCHIVE
      </div>
    );
  }

  return (
    <div className="space-y-4 font-mono text-[#EAE6DF]">
      <h2 className="border-b-2 border-[#EAE6DF] pb-2 text-lg font-bold uppercase tracking-widest">
        // Visual Scanner
      </h2>

      {/* Viewfinder */}
      <div className="relative aspect-[3/4] w-full overflow-hidden border-2 border-[#EAE6DF] bg-black">
        {camera === "live" && (
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        )}
        {camera === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs uppercase text-[#33FF00]">
            &gt;&gt; REQUESTING CAMERA...
          </div>
        )}
        {camera === "denied" && <FallbackFacade reason="[X] CAMERA OFFLINE // SIMULATION MODE" />}

        {/* Reticle */}
        <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-[#D9381E]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-[#D9381E]" />
          <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-[#D9381E]" />
        </div>
        <p className="pointer-events-none absolute left-0 right-0 top-2 text-center text-xs font-bold uppercase text-[#D9381E]">
          ALIGN ARCHITECTURAL MARKER
        </p>

        {/* Scan line */}
        {scanning && (
          <div
            className="pointer-events-none absolute left-0 right-0 h-1 bg-[#33FF00]"
            style={{ top: `${progress}%` }}
          />
        )}
        {scanning && (
          <p className="absolute bottom-2 left-2 bg-black px-2 text-xs uppercase text-[#33FF00]">
            &gt;&gt; MATCHING {progress}%
          </p>
        )}
      </div>

      {/* Demo selector */}
      <label className="block text-xs uppercase">
        Simulate marker:
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={scanning}
          className="mt-1 w-full rounded-none border-2 border-[#EAE6DF] bg-[#141414] p-2 text-sm uppercase text-[#EAE6DF]"
        >
          {landmarks.map((l) => (
            <option key={l.id} value={l.id}>
              {unlockedIds.includes(l.id) ? "[X] " : "[ ] "}
              {l.title}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={startScan}
        disabled={scanning}
        className="w-full rounded-none border-2 border-[#EAE6DF] bg-[#D9381E] p-3 text-sm font-bold uppercase tracking-widest text-[#EAE6DF] disabled:opacity-50"
      >
        {scanning ? ">> SCANNING..." : "INITIATE VISUAL MATCH"}
      </button>

      {/* Result modal */}
      {opened && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="max-h-full w-full max-w-md overflow-y-auto border-2 border-[#0D0D0D] bg-[#EAE6DF] p-4 text-[#0D0D0D]">
            <p className="inline-block -rotate-2 border-2 border-[#D9381E] px-2 py-0.5 text-xs font-bold uppercase text-[#D9381E]">
              MATCH CONFIRMED // +{opened.points} PTS
            </p>
            <h3 className="mt-3 text-xl font-bold uppercase">{opened.title}</h3>
            <p className="text-xs uppercase">{opened.band}</p>
            <p className="mt-3 text-sm leading-relaxed">{opened.historyText}</p>

            <audio controls src={opened.audioUrl} className="mt-3 w-full">
              Your browser does not support audio.
            </audio>

            <a
              href={opened.localCoverUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-none border-2 border-[#0D0D0D] p-2 text-center text-sm font-bold uppercase"
            >
              &gt;&gt; Listen to the local cover
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
