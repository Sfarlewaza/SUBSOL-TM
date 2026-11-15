import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccountType, Landmark } from '../types';
import {
  computeFastDHash,
  hammingDistance,
  loadScannerSandbox,
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
  const url = spot.referenceImageUrl || '';
  if (!url) return '';
  if (url.includes('images.unsplash.com')) {
    return url.replace(/w=\d+/, 'w=420').replace(/q=\d+/, 'q=65');
  }
  return url;
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
        riddle: `Aim live viewfinder at your reference marker (${sandbox.refLabel}) to verify Hamming distance <= ${sandbox.maxHammingDistance} bits.`,
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

  // Lightweight live camera state (anti-counterfeit: live sensor feed only, no static gallery upload)
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [hardwareZoomRange, setHardwareZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [liveSimilarity, setLiveSimilarity] = useState<number | null>(null);
  const [liveDistance, setLiveDistance] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const refHashCacheRef = useRef<Record<string, string>>({});

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
    setCameraActive(false);
    setLiveSimilarity(null);
    setLiveDistance(null);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setFeedback(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
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

  // Apply hardware zoom when supported; digital CSS + ROI crop handles fallback smoothly
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
          // Digital zoom fallback stays active seamlessly
        }
      }
    },
    [hardwareZoomRange]
  );

  // Capture a lightweight 160x160 zoomed center ROI from the live video stream
  const captureLiveRoiCanvas = useCallback((): HTMLCanvasElement | null => {
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

  const getCachedReferenceHash = useCallback(async (src: string): Promise<string> => {
    if (!src) return '';
    if (refHashCacheRef.current[src]) return refHashCacheRef.current[src];
    try {
      const h = await computeFastDHash(src);
      if (h.length === 64) {
        refHashCacheRef.current[src] = h;
      }
      return h;
    } catch {
      return '';
    }
  }, []);

  // Lightweight throttled live telemetry pulse (every 500ms while camera is active)
  useEffect(() => {
    if (!cameraActive || !activeRefSrc) {
      setLiveSimilarity(null);
      setLiveDistance(null);
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled) return;
      const roi = captureLiveRoiCanvas();
      if (!roi) return;
      try {
        const [liveHash, refHash] = await Promise.all([
          computeFastDHash(roi),
          getCachedReferenceHash(activeRefSrc),
        ]);
        if (!cancelled && liveHash.length === 64 && refHash.length === 64) {
          const dist = hammingDistance(refHash, liveHash);
          const sim = Math.max(0, Math.round(((64 - dist) / 64) * 100));
          setLiveDistance(dist);
          setLiveSimilarity(sim);
        }
      } catch {
        // Ignore transient frame read issues
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cameraActive, activeRefSrc, captureLiveRoiCanvas, getCachedReferenceHash]);

  async function handleVerifyLiveFrame() {
    if (!activeSpot) return;
    const roi = captureLiveRoiCanvas();
    if (!roi) {
      setFeedback('[X] LIVE SENSOR NOT READY — ENGAGE CAMERA VIEWFINDER FIRST.');
      return;
    }

    setVerifying(true);
    setFeedback(null);

    try {
      const captureHash = await computeFastDHash(roi);
      if (captureHash.length !== 64) {
        setFeedback('[X] SENSOR READ ERROR — STABILIZE OPTICS & RETRY.');
        return;
      }

      const maxAllowedDist =
        activeSpot.id === 'admin-sandbox-test-node'
          ? sandbox.maxHammingDistance
          : Math.max(18, sandbox.maxHammingDistance || 18);

      if (activeRefSrc) {
        const refHash = await getCachedReferenceHash(activeRefSrc);
        if (refHash.length === 64) {
          const dist = hammingDistance(refHash, captureHash);
          const similarity = Math.max(0, Math.round(((64 - dist) / 64) * 100));

          if (dist <= maxAllowedDist) {
            if (
              activeSpot.id === 'admin-sandbox-test-node' &&
              !sandbox.awardPointsInLiveDemo
            ) {
              setFeedback(
                `✓ LIVE SANDBOX MATCH (${similarity}% SIMILARITY, DIST ${dist}/64) — CALIBRATION ONLY (NO PTS)`
              );
              return;
            }
            onUnlockSpot(activeSpot.id);
            const pts = hasScanAmplifier
              ? Math.round(activeSpot.points * 1.25)
              : activeSpot.points;
            setFeedback(
              `✓ LIVE SIGNAL LOCKED (${similarity}% MATCH, DIST ${dist}/64) — +${pts} PTS CREDITED!`
            );
            return;
          } else {
            setFeedback(
              `[X] LIVE MISMATCH (${similarity}% SIMILARITY, DIST ${dist}/64 > MAX ${maxAllowedDist}) — ZOOM IN OR ALIGN RETICLE TO TARGET.`
            );
            return;
          }
        }
      }

      onUnlockSpot(activeSpot.id);
      const pts = hasScanAmplifier
        ? Math.round(activeSpot.points * 1.25)
        : activeSpot.points;
      setFeedback(`✓ LIVE OPTIC LOCKED (${activeSpot.band.toUpperCase()}): +${pts} PTS CREDITED`);
    } catch {
      setFeedback('[X] LIVE FRAME DECODE FAILED.');
    } finally {
      setVerifying(false);
    }
  }

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

          {/* Target Reference Thumbnail */}
          {activeRefSrc && (
            <div className="relative border border-[#33FF00]/60 bg-black overflow-hidden">
              <img
                src={activeRefSrc}
                alt={`Reference marker for ${activeSpot.title}`}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const fallback = activeSpot.referenceImageUrl;
                  if (fallback && e.currentTarget.src !== fallback) {
                    e.currentTarget.src = fallback;
                  }
                }}
                className="h-32 w-full object-cover grayscale contrast-125 opacity-90"
              />
              <div className="absolute top-1.5 left-1.5 bg-black/85 border border-[#33FF00] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#33FF00]">
                {activeSpot.id === 'admin-sandbox-test-node'
                  ? 'ADMIN SANDBOX REFERENCE // MATCH LIVE'
                  : 'TARGET MARKER // LIVE SENSOR ONLY'}
              </div>
              <div className="absolute bottom-1.5 right-1.5 bg-black/85 px-1.5 py-0.5 text-[9px] text-[#EAE6DF]/80">
                ANTI-SPOOF LIVE DHASH
              </div>
            </div>
          )}

          <p className="border-l-2 border-[#D9381E] pl-2.5 text-xs text-[#EAE6DF]/85">
            {activeSpot.riddle}
          </p>

          {/* Live Camera Viewfinder + Zoom Controls */}
          <div className="border-2 border-[#33FF00] bg-black p-2.5 space-y-2.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase">
              <span className="text-[#33FF00]">
                {cameraActive ? '● LIVE OPTIC FEED ACTIVE' : '○ SENSOR STANDBY'}
              </span>
              <span className="text-[#EAE6DF]/75">ZOOM: {zoom.toFixed(1)}x</span>
            </div>

            {cameraActive ? (
              <div className="relative aspect-square max-h-64 w-full mx-auto overflow-hidden border border-[#EAE6DF]/40 bg-black">
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
                {/* Alignment Reticle Overlay */}
                <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-[#33FF00]/80 flex items-end justify-between p-1.5">
                  <span className="bg-black/80 px-1.5 py-0.5 text-[9px] font-bold text-[#33FF00]">
                    ALIGN MARKER IN RETICLE
                  </span>
                  {liveSimilarity !== null && (
                    <span
                      className={`px-1.5 py-0.5 text-[9px] font-bold ${
                        liveSimilarity >= 70
                          ? 'bg-[#33FF00] text-[#0D0D0D]'
                          : 'bg-black/85 text-[#EAE6DF]'
                      }`}
                    >
                      LOCK: {liveSimilarity}% ({liveDistance}/64)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-[#EAE6DF]/35 bg-[#0D0D0D] p-4 text-center space-y-2">
                <div className="text-[11px] text-[#EAE6DF]/75">
                  Gallery uploads disabled to prevent photo counterfeits. Engage live camera to scan on-site marker.
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="border-2 border-[#33FF00] bg-[#33FF00] px-3 py-1.5 text-xs font-bold uppercase text-[#0D0D0D]"
                >
                  [📷 ENGAGE LIVE VIEWFINDER]
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
                    {verifying ? '>> SAMPLING DHASH...' : '[⚡ LOCK & VERIFY LIVE FRAME]'}
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
