import React, { useState } from 'react';

interface GatekeeperProps {
  onUnlock: (handle: string) => void;
}

// Timișoara Genesis Coordinates (Casa de Cultură a Studenților / Central Zone)
const TIMISOARA_LAT = 45.7489;
const TIMISOARA_LON = 21.2087;
const MAX_DISTANCE_KM = 15; // Generous city-wide radius for live field testing

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const Gatekeeper: React.FC<GatekeeperProps> = ({ onUnlock }) => {
  const [handleInput, setHandleInput] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'error' | 'info' | 'success'>('info');
  const [isLocating, setIsLocating] = useState(false);

  const validateHandle = (): string | null => {
    const trimmed = handleInput.trim();
    if (!trimmed) {
      setStatusType('error');
      setStatusMessage('ACCESS DENIED // OPERATIVE HANDLE REQUIRED BEFORE TUNING');
      return null;
    }
    return trimmed;
  };

  const triggerUnlockSuccess = (validHandle: string, sourceLabel: string) => {
    setStatusType('success');
    setStatusMessage(`SIGNAL LOCKED (${sourceLabel}) // WELCOME TO THE UNDERGROUND`);
    setTimeout(() => {
      onUnlock(validHandle);
    }, 550);
  };

  const handlePassphraseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validHandle = validateHandle();
    if (!validHandle) return;

    if (passphrase.trim().toUpperCase() !== 'MARSHALL77') {
      setStatusType('error');
      setStatusMessage('ACCESS DENIED // INVALID FREQUENCY');
      return;
    }

    triggerUnlockSuccess(validHandle, 'KEY: MARSHALL77');
  };

  const handleGpsVerification = () => {
    const validHandle = validateHandle();
    if (!validHandle) return;

    if (!('geolocation' in navigator)) {
      setStatusType('error');
      setStatusMessage('HARDWARE FAULT // GEOLOCATION UNAVAILABLE ON TERMINAL');
      return;
    }

    setIsLocating(true);
    setStatusType('info');
    setStatusMessage('TRIANGULATING SECTOR 45.7489° N, 21.2087° E...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        const dist = calculateDistanceKm(latitude, longitude, TIMISOARA_LAT, TIMISOARA_LON);

        if (dist <= MAX_DISTANCE_KM) {
          triggerUnlockSuccess(validHandle, `GPS VERIFIED: ${dist.toFixed(1)}KM`);
        } else {
          setStatusType('error');
          setStatusMessage(
            `ACCESS DENIED // OUT OF RANGE (${dist.toFixed(1)}KM FROM TIMIȘOARA GENESIS NODE)`
          );
        }
      },
      (err) => {
        setIsLocating(false);
        setStatusType('error');
        setStatusMessage(
          `GPS SIGNAL BLOCKED (${err.message.toUpperCase()}) // USE SIMULATE BYPASS OR PASSPHRASE`
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleSimulateGps = () => {
    const validHandle = validateHandle();
    if (!validHandle) return;

    triggerUnlockSuccess(validHandle, 'SIMULATED VENUE GPS');
  };

  return (
    <div className="min-h-screen samizdat-bg text-[#EAE6DF] font-mono flex flex-col justify-center p-4">
      <div className="max-w-lg w-full mx-auto border-2 border-[#EAE6DF] bg-[#141414] p-5 sm:p-6 space-y-6 rounded-none">
        {/* Stark Terminal Banner */}
        <div className="border-b-2 border-[#D9381E] pb-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="bg-[#D9381E] text-[#EAE6DF] text-[11px] font-bold px-2 py-0.5 uppercase tracking-wider">
              [!] PIRATE CARRIER DETECTED
            </span>
            <span className="text-[11px] text-[#EAE6DF]/60 uppercase">CH-77 // TM</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight uppercase text-[#EAE6DF] leading-snug">
            SIGNAL OFFLINE // RESTRICTED FREQUENCY — TIMIȘOARA &apos;77
          </h1>
          <p className="text-xs text-[#EAE6DF]/75 uppercase">
            IDENTIFY OPERATIVE HANDLE AND AUTHENTICATE VIA GENESIS COORDINATES OR SCENE KEY.
          </p>
        </div>

        {/* Status / Error Console */}
        {statusMessage && (
          <div
            role="status"
            className={`border-2 p-3 text-xs font-bold uppercase tracking-wide rounded-none ${
              statusType === 'error'
                ? 'border-[#D9381E] bg-[#D9381E]/15 text-[#D9381E]'
                : statusType === 'success'
                ? 'border-[#33FF00] bg-[#33FF00]/15 text-[#33FF00] phosphor-glow'
                : 'border-[#EAE6DF] bg-[#0D0D0D] text-[#EAE6DF]'
            }`}
          >
            &gt;&gt; {statusMessage}
          </div>
        )}

        {/* Step 1: Operative Handle */}
        <div className="space-y-1.5">
          <label htmlFor="operative-handle" className="block text-xs font-bold uppercase">
            01 // OPERATIVE HANDLE (REQUIRED):
          </label>
          <input
            id="operative-handle"
            type="text"
            value={handleInput}
            onChange={(e) => {
              setHandleInput(e.target.value);
              if (statusType === 'error') setStatusMessage(null);
            }}
            placeholder="@andrei"
            autoComplete="off"
            className="w-full bg-[#0D0D0D] border-2 border-[#EAE6DF] px-3 py-2.5 text-sm text-[#33FF00] placeholder-[#EAE6DF]/35 focus:outline-none focus:border-[#33FF00] rounded-none"
          />
        </div>

        {/* Step 2A: Genesis Location Check + Demo Fallback */}
        <div className="border-t-2 border-[#EAE6DF]/20 pt-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase">
            <span>02A // GENESIS LOCATION CHECK</span>
            <span className="text-[11px] text-[#EAE6DF]/60">45.7489° N, 21.2087° E</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={isLocating}
              onClick={handleGpsVerification}
              className="flex-1 bg-[#0D0D0D] text-[#33FF00] border-2 border-[#33FF00] px-3 py-2.5 text-xs font-bold uppercase hover:bg-[#33FF00] hover:text-[#0D0D0D] disabled:opacity-50 transition-colors rounded-none"
            >
              {isLocating ? '[SCANNING SATELLITES...]' : '[VERIFY GENESIS LOCATION (GPS)]'}
            </button>
            <button
              type="button"
              onClick={handleSimulateGps}
              className="bg-[#0D0D0D] text-[#EAE6DF]/80 border-2 border-[#EAE6DF]/60 px-2.5 py-2.5 text-[11px] font-bold uppercase hover:border-[#EAE6DF] hover:text-[#EAE6DF] transition-colors rounded-none whitespace-nowrap"
              title="Demo fallback for indoor testing"
            >
              [SIMULATE VENUE GPS]
            </button>
          </div>
        </div>

        {/* Step 2B: Scene Passphrase */}
        <form
          onSubmit={handlePassphraseSubmit}
          className="border-t-2 border-[#EAE6DF]/20 pt-4 space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="scene-passphrase" className="block text-xs font-bold uppercase">
              02B // SCENE PASSPHRASE:
            </label>
            <input
              id="scene-passphrase"
              type="text"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                if (statusType === 'error') setStatusMessage(null);
              }}
              placeholder="ENTER FREQUENCY KEY..."
              autoComplete="off"
              className="w-full bg-[#0D0D0D] border-2 border-[#EAE6DF] px-3 py-2.5 text-sm text-[#EAE6DF] uppercase placeholder-[#EAE6DF]/35 focus:outline-none focus:border-[#D9381E] rounded-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[#EAE6DF] text-[#0D0D0D] border-2 border-[#EAE6DF] py-2.5 text-xs sm:text-sm font-bold uppercase hover:bg-[#D9381E] hover:text-[#EAE6DF] hover:border-[#D9381E] transition-colors rounded-none"
          >
            [ENTER FREQUENCY]
          </button>
        </form>
      </div>
    </div>
  );
};

export default Gatekeeper;
