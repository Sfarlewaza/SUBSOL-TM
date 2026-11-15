import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccountType, Landmark } from '../types';
import {
  computeDetailedDHash,
  computeReferenceHashBank,
  getScaledMaxDistance,
  loadScannerSandbox,
  minBankHammingDistance,
} from '../utils/scannerHash';

interface ScannerViewProps {
  landmarks: Landmark[];
  unlockedIds: string[];
  accountType: AccountType;
  hasScanAmplifier: boolean;
  onUnlockSpot: (landmarkId: string) => void;
}

const LOCAL_TEST_REFS: Record<string, string> = {
  'sfintii-62': './refs/LandmarkTest1.jpg',
  'progresiv-73': './refs/LandmarkTest2.jpg',
};

function getLightweightRefUrl(spot: Landmark, usePublicRefs: boolean): string {
  if (usePublicRefs && LOCAL_TEST_REFS[spot.id]) {
    return LOCAL_TEST_REFS[spot.id];
  }
  if (
    LOCAL_TEST_REFS[spot.id] &&
    (!spot.referenceImageUrl || spot.referenceImageUrl.includes('unsplash.com'))
  ) {
    return LOCAL_TEST_REFS[spot.id];
  }
  return spot.referenceImageUrl || '';
}

export default function ScannerView({
  landmarks,
  unlockedIds,
  accountType,
  hasScanAmplifier,
  onUnlockSpot,
}: ScannerViewProps) {
  const sandbox = loadScannerSandbox();
  const showAdminTestToken = accountType === 'ADMIN' && sandbox.enabled;

  const adminTestLandmark: Landmark | null = showAdminTestToken
    ? {
        id: 'admin-sandbox-test-node',
        title: `TEST TOKEN // ${sandbox.refLabel || 'CUSTOM CALIBRATION TAG'}`,
        band: 'ROOT CALIBRATION',
        era: '2026 // SANDBOX',
        locationName: 'Admin Field Test / Live Pitch Table',
        riddle: `Fit the entire square reference marker (${sandbox.refLabel}) inside the 1:1 square viewfinder.`,
        story: 'Admin perceptual dHash calibration node.',
        points: 150,
        referenceImageUrl: sandbox.refImageDataUrl,
        createdByType: 'ADMIN',
      }
    : null;

  const allLandmarks = adminTestLandmark
    ? [adminTestLandmark, ...landmarks]
    : landmarks;

  const [scanCreatorFilter, setScanCreatorFilter] = useState<'ALL' | 'ADMIN' | 'BAND'>('ALL');
  const [selectedId, setSelectedId] = useState<string>(
    adminTestLandmark ? adminTestLandmark.id : landmarks[0]?.id || 'sfintii-62'
  );

  // True 1:1 square live camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [hardwareZoomRange, setHardwareZoomRange] = useState<{
    min: number;
    max: number;
    step: number;
  } | null>(null);
  const [liveSimilarity, setLiveSimilarity] = useState<number | null>(null);
  const [stableStreak, setStableStreak] = useState<number>(0);
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const refBankCacheRef = useRef<Record<string, string[]>>({});
  const streakRef = useRef<number>(0);

  const visibleLandmarks = allLandmarks.filter((s) =>
    scanCreatorFilter === 'ALL' ? true : (s.createdByType || 'ADMIN') === scanCreatorFilter
  );

  const activeSpot =
    visibleLandmarks.find((l) => l.id === selectedId) || visibleLandmarks[0] || allLandmarks[0];

  const activeRefSrc =
    activeSpot?.id === 'admin-sandbox-test-node'
      ? sandbox.refImageDataUrl
      : activeSpot
      ? getLightweightRefUrl(activeSpot, sandbox.usePublicRefs)
      : '';

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    streakRef.current = 0;
    setStableStreak(0);
    setCameraActive(false);
    setLiveSimilarity(null);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setFeedback(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          aspectRatio: { ideal: 1 },
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as MediaTrackCapabilities & {
          zoom?: { min: number; max: number; step: number };
        };
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          setHardwareZoomRange({
            min: caps.zoom.min,
            max: Math.min(4, caps.zoom.max),
            step: caps.zoom.step || 0.1,
          });
        } else {
          setHardwareZoomRange(null);
        }
      }

      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        'LIVE CAMERA SENSOR UNAVAILABLE — GRANT CAMERA PERMISSION TO VERIFY PHYSICAL LANDMARKS.'
      );
      setCameraActive(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleZoomChange = useCallback(
    async (nextZoom: number) => {
      const clamped = Math.max(1, Math.min(4, Number(nextZoom.toFixed(1))));
      setZoom(clamped);
      const track = streamRef.current?.getVideoTracks()?.[0];
      if (track && hardwareZoomRange && typeof track.applyConstraints === 'function') {
        try {
          const hwVal = Math.max(
            hardwareZoomRange.min,
            Math.min(hardwareZoomRange.max, clamped)
          );
          await track.applyConstraints({
            advanced: [{ zoom: hwVal } as MediaTrackConstraintSet],
          });
        } catch {
          // Digital zoom fallback stays active
        }
      }
    },
    [hardwareZoomRange]
  );

  // Extracts the exact 1:1 square matching the square viewfinder box
  const captureLiveSquareCanvas = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return null;
    }
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 160;
      canvasRef.current.height = 160;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const baseSide = Math.min(vw, vh);
    const effectiveDigitalZoom = hardwareZoomRange ? 1 : zoom;
    const cropSide = Math.max(32, baseSide / effectiveDigitalZoom);
    const sx = (vw - cropSide) / 2;
    const sy = (vh - cropSide) / 2;

    ctx.drawImage(video, sx, sy, cropSide, cropSide, 0, 0, 160, 160);
    return canvas;
  }, [hardwareZoomRange, zoom]);

  const getCachedReferenceBank = useCallback(async (src: string): Promise<string[]> => {
    if (!src) return [];
    if (refBankCacheRef.current[src]) return refBankCacheRef.current[src];
    try {
      const bank = await computeReferenceHashBank(src);
      if (bank.length > 0) {
        refBankCacheRef.current[src] = bank;
      }
      return bank;
    } catch {
      return [];
    }
  }, []);

  // 450ms live match telemetry
  useEffect(() => {
    streakRef.current = 0;
    setStableStreak(0);
    if (!cameraActive || !activeRefSrc) {
      setLiveSimilarity(null);
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled) return;
      const sqCanvas = captureLiveSquareCanvas();
      if (!sqCanvas) return;
      try {
        const [liveRes, refBank] = await Promise.all([
          computeDetailedDHash(sqCanvas),
          getCachedReferenceBank(activeRefSrc),
        ]);
        if (cancelled) return;
        if (liveRes.contrastStdDev < 12 || liveRes.bits.length !== 256 || refBank.length === 0) {
          streakRef.current = 0;
          setStableStreak(0);
          setLiveSimilarity(0);
          return;
        }
        const dist = minBankHammingDistance(refBank, liveRes.bits);
        const maxDist = getScaledMaxDistance(sandbox.maxHammingDistance, 256);
        const sim = Math.max(0, Math.round(((256 - dist) / 256) * 100));
        setLiveSimilarity(sim);
        if (dist <= maxDist) {
          streakRef.current = Math.min(5, streakRef.current + 1);
        } else {
          streakRef.current = 0;
        }
        setStableStreak(streakRef.current);
      } catch {
        streakRef.current = 0;
        setStableStreak(0);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cameraActive, activeRefSrc, sandbox.maxHammingDistance, captureLiveSquareCanvas, getCachedReferenceBank]);

  async function handleVerifyLiveFrame() {
    if (!activeSpot) return;
    const sqCanvas = captureLiveSquareCanvas();
    if (!sqCanvas) {
      setFeedback('[X] LIVE SENSOR NOT READY — ENGAGE CAMERA VIEWFINDER FIRST.');
      return;
    }

    setVerifying(true);
    setFeedback(null);

    try {
      const liveRes = await computeDetailedDHash(sqCanvas);
      if (liveRes.bits.length !== 256) {
        setFeedback('[X] SENSOR READ ERROR — STABILIZE OPTICS & RETRY.');
        return;
      }

      if (liveRes.contrastStdDev < 12) {
        streakRef.current = 0;
        setStableStreak(0);
        setFeedback(
          '[X] LOW SCENE CONTRAST — AIM AT A DISTINCT ARCHITECTURAL OR ZINE MARKER.'
        );
        return;
      }

      if (!activeRefSrc) {
        setFeedback('[X] NO REFERENCE SIGNATURE CONFIGURED FOR THIS NODE.');
        return;
      }

      const refBank = await getCachedReferenceBank(activeRefSrc);
      if (refBank.length === 0) {
        setFeedback(
          '[X] REFERENCE SIGNATURE UNREADABLE (CORS/NETWORK) — USE LOCAL /REFS OR SANDBOX TARGET.'
        );
        return;
      }

      const dist = minBankHammingDistance(refBank, liveRes.bits);
      const maxAllowedDist = getScaledMaxDistance(sandbox.maxHammingDistance, 256);
      const similarity = Math.max(0, Math.round(((256 - dist) / 256) * 100));
      const minRequiredSim = Math.round(((256 - maxAllowedDist) / 256) * 100);

      if (dist > maxAllowedDist) {
        streakRef.current = 0;
        setStableStreak(0);
        setFeedback(
          `[X] MISMATCH (${similarity}% < ${minRequiredSim}% REQUIRED) — MATCH SQUARE FRAME TO REFERENCE.`
        );
        return;
      }

      if (streakRef.current < 1) {
        streakRef.current = 1;
        setStableStreak(1);
        setFeedback(
          `[~] PARTIAL LOCK (${similarity}%) — HOLD STEADY & TAP VERIFY AGAIN TO CONFIRM.`
        );
        return;
      }

      if (
        activeSpot.id === 'admin-sandbox-test-node' &&
        !sandbox.awardPointsInLiveDemo
      ) {
        setFeedback(
          `✓ VERIFIED 1:1 SQUARE MATCH (${similarity}% SIMILARITY) — CALIBRATION ONLY (NO PTS)`
        );
        return;
      }

      onUnlockSpot(activeSpot.id);
      const pts = hasScanAmplifier
        ? Math.round(activeSpot.points * 1.25)
        : activeSpot.points;
      setFeedback(
        `✓ VERIFIED 1:1 SIGNAL LOCK (${similarity}% MATCH) — +${pts} PTS CREDITED!`
      );
    } catch {
      setFeedback('[X] LIVE FRAME DECODE FAILED.');
    } finally {
      setVerifying(false);
    }
  }

  const minRequiredSimilarity = Math.round(
    ((256 - getScaledMaxDistance(sandbox.maxHammingDistance, 256)) / 256) * 100
  );

  return (
    <div className="space-y-4 font-mono text-[#EAE6DF]">
      <div className="flex items-center justify-between border-b-2 border-[#EAE6DF] pb-2">
        <h2 className="text-base sm:text-lg font-bold uppercase tracking-wider">
          // LIVE OPTICAL RECON SCANNER
        </h2>
        <span className="text-xs font-bold text-[#33FF00]">
          {unlockedIds.length}/{allLandmarks.length} UNLOCKED
        </span>
      </div>

      {/* Origin Filter */}
      <div className="flex flex-wrap items-center gap-1 border border-[#EAE6DF]/40 bg-[#141414] p-2">
        <span className="text-[9px] uppercase text-[#EAE6DF]/60 mr-1">ORIGIN:</span>
        {(
          [
            ['ALL', 'ALL NODES'],
            ['ADMIN', 'ADMIN ARCHIVE'],
            ['BAND', 'BAND DROPS'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setScanCreatorFilter(val)}
            className={`px-2 py-0.5 text-[9px] font-bold uppercase border ${
              scanCreatorFilter === val
                ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                : 'border-[#EAE6DF]/30 bg-black text-[#EAE6DF]/75'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeSpot && (
        <div className="border-2 border-[#EAE6DF] bg-[#141414] p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="bg-[#D9381E] px-1.5 py-0.5 text-[10px] font-bold uppercase">
              TARGET // {activeSpot.era}
            </span>
            <span className="text-xs font-bold text-[#33FF00]">
              +{hasScanAmplifier ? Math.round(activeSpot.points * 1.25) : activeSpot.points} PTS
            </span>
          </div>

          <div>
            <div className="text-sm font-bold uppercase text-[#EAE6DF]">{activeSpot.title}</div>
            <div className="text-[11px] text-[#33FF00]">📍 {activeSpot.locationName}</div>
          </div>

          {/* Side-by-Side / Centered 1:1 Square Reference (Zero Cropping) */}
          {activeRefSrc && (
            <div className="border border-[#33FF00]/60 bg-black p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[9px] font-bold uppercase">
                <span className="text-[#33FF00]">1:1 SQUARE TARGET REFERENCE</span>
                <span className="text-[#EAE6DF]/80">LOCK &gt;={minRequiredSimilarity}%</span>
              </div>
              <div className="relative mx-auto aspect-square w-44 sm:w-48 border-2 border-[#33FF00]/70 bg-[#0D0D0D] overflow-hidden">
                <img
                  src={activeRefSrc}
                  alt={`Square reference for ${activeSpot.title}`}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="text-center text-[9px] text-[#EAE6DF]/65">
                Match this exact 1:1 square crop inside the live viewfinder below
              </div>
            </div>
          )}

          <p className="border-l-2 border-[#D9381E] pl-2.5 text-xs text-[#EAE6DF]/85">
            {activeSpot.riddle}
          </p>

          {/* True 1:1 Square Live Camera Viewfinder */}
          <div className="border-2 border-[#33FF00] bg-black p-2.5 space-y-2.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase">
              <span className="text-[#33FF00]">
                {cameraActive ? '● 1:1 LIVE OPTIC ACTIVE' : '○ SENSOR STANDBY'}
              </span>
              <span className="text-[#EAE6DF]/75">ZOOM: {zoom.toFixed(1)}x</span>
            </div>

            {cameraActive ? (
              <div className="relative aspect-square w-60 sm:w-64 mx-auto overflow-hidden border-2 border-[#33FF00] bg-black">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={
                    hardwareZoomRange
                      ? undefined
                      : { transform: `scale(${zoom})`, transformOrigin: 'center center' }
                  }
                  className="h-full w-full object-cover transition-transform duration-150"
                />
                {/* Edge-to-edge 1:1 Reticle matching exact capture crop */}
                <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-[#33FF00]/70 flex items-end justify-between p-1.5">
                  <span className="bg-black/80 px-1.5 py-0.5 text-[9px] font-bold text-[#33FF00]">
                    {stableStreak >= 2 ? '✓ SIGNAL LOCKED' : '1:1 FRAME'}
                  </span>
                  {liveSimilarity !== null && (
                    <span
                      className={`px-1.5 py-0.5 text-[9px] font-bold ${
                        liveSimilarity >= minRequiredSimilarity
                          ? 'bg-[#33FF00] text-[#0D0D0D]'
                          : 'bg-black/85 text-[#EAE6DF]'
                      }`}
                    >
                      {liveSimilarity}% / {minRequiredSimilarity}%
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-[#EAE6DF]/35 bg-[#0D0D0D] p-4 text-center space-y-2">
                <div className="text-[11px] text-[#EAE6DF]/75">
                  Gallery uploads disabled to prevent photo counterfeits. Engage 1:1 square live viewfinder to scan marker.
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="border-2 border-[#33FF00] bg-[#33FF00] px-3 py-1.5 text-xs font-bold uppercase text-[#0D0D0D]"
                >
                  [📷 ENGAGE 1:1 VIEWFINDER]
                </button>
              </div>
            )}

            {/* Optical / Digital Zoom Bar */}
            {cameraActive && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[#EAE6DF]/70">ZOOM</span>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                    className="flex-1 accent-[#33FF00]"
                  />
                  <div className="flex gap-1">
                    {[1, 2, 3].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleZoomChange(preset)}
                        className={`px-1.5 py-0.5 text-[9px] font-bold border ${
                          Math.abs(zoom - preset) < 0.15
                            ? 'border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]'
                            : 'border-[#EAE6DF]/40 text-[#EAE6DF]'
                        }`}
                      >
                        {preset}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={verifying}
                    onClick={handleVerifyLiveFrame}
                    className="col-span-2 border-2 border-[#EAE6DF] bg-[#33FF00] p-2 text-xs font-bold uppercase text-[#0D0D0D] active:translate-y-px"
                  >
                    {verifying ? '>> SAMPLING 256-BIT DHASH...' : '[⚡ LOCK & VERIFY 1:1 FRAME]'}
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="border border-[#D9381E] bg-black p-2 text-[10px] font-bold uppercase text-[#D9381E]"
                  >
                    [OFF]
                  </button>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="border border-[#D9381E] bg-[#141414] p-2 text-[11px] font-bold text-[#D9381E]">
                {cameraError}
              </div>
            )}
          </div>

          {feedback && (
            <div
              className={`border p-2 text-xs font-bold ${
                feedback.startsWith('✓')
                  ? 'border-[#33FF00] bg-black text-[#33FF00]'
                  : feedback.startsWith('[~]')
                  ? 'border-amber-400 bg-black text-amber-300'
                  : 'border-[#D9381E] bg-black text-[#D9381E]'
              }`}
            >
              {feedback}
            </div>
          )}
        </div>
      )}

      {/* Target Node Selector */}
      <div className="space-y-2">
        <div className="text-[10px] font-bold uppercase text-[#EAE6DF]/60">
          SELECT TARGET NODE ({visibleLandmarks.length})
        </div>
        {visibleLandmarks.map((spot) => {
          const isUnlocked = unlockedIds.includes(spot.id);
          const isSelected = activeSpot?.id === spot.id;
          return (
            <button
              key={spot.id}
              type="button"
              onClick={() => {
                setSelectedId(spot.id);
                setFeedback(null);
              }}
              className={`w-full text-left border-2 p-2.5 ${
                isSelected
                  ? 'border-[#33FF00] bg-[#141414]'
                  : 'border-[#EAE6DF]/35 bg-[#0D0D0D]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase text-[#EAE6DF]">{spot.title}</span>
                <span
                  className={`text-[10px] font-bold uppercase ${
                    isUnlocked ? 'text-[#33FF00]' : 'text-[#D9381E]'
                  }`}
                >
                  {isUnlocked ? '✓ UNLOCKED' : `+${spot.points} PTS`}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[10px] text-[#EAE6DF]/65">
                <span>
                  {spot.band} • {spot.locationName}
                </span>
                <span>
                  {spot.id === 'admin-sandbox-test-node'
                    ? 'SANDBOX'
                    : spot.createdByType === 'BAND'
                    ? 'BAND'
                    : 'ARCHIVE'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
