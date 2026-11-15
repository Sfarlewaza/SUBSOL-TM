import React, { useState } from "react";
import {
  loginOperative,
  registerOperative,
  type ProfileRecord,
} from "../utils/supabaseClient";

interface GatekeeperProps {
  onAuthenticated: (profile: ProfileRecord) => void;
}

// Timișoara Genesis Coordinates (Casa de Cultură a Studenților / Central Zone)
const TIMISOARA_LAT = 45.7489;
const TIMISOARA_LON = 21.2087;
const MAX_DISTANCE_KM = 15;

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const Gatekeeper: React.FC<GatekeeperProps> = ({ onAuthenticated }) => {
  const [authMode, setAuthMode] = useState<"LOGIN" | "REGISTER">("LOGIN");
  const [handleInput, setHandleInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"error" | "info" | "success">("info");
  const [isBusy, setIsBusy] = useState(false);

  const validateCredentials = (): { handle: string; password: string } | null => {
    const cleanHandle = handleInput.trim().replace(/^@+/, "");
    if (cleanHandle.length < 3) {
      setStatusType("error");
      setStatusMessage("OPERATIVE HANDLE REQUIRED (MIN 3 CHARS)");
      return null;
    }
    if (passwordInput.length < 6) {
      setStatusType("error");
      setStatusMessage("PASSWORD REQUIRED (MIN 6 CHARS)");
      return null;
    }
    return { handle: cleanHandle, password: passwordInput };
  };

  const completeAccountCreation = async (sourceLabel: string) => {
    const creds = validateCredentials();
    if (!creds) return;

    setIsBusy(true);
    setStatusType("info");
    setStatusMessage(`MINTING OPERATIVE CREDENTIALS (${sourceLabel})...`);

    try {
      const profile = await registerOperative(creds.handle, creds.password);
      setStatusType("success");
      setStatusMessage(`ACCOUNT CREATED // WELCOME @${profile.handle.toUpperCase()}`);
      setTimeout(() => onAuthenticated(profile), 450);
    } catch (err) {
      setStatusType("error");
      setStatusMessage(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message).toUpperCase() : "REGISTRATION FAILED");
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const creds = validateCredentials();
    if (!creds) return;

    setIsBusy(true);
    setStatusType("info");
    setStatusMessage("AUTHENTICATING FREQUENCY CREDENTIALS...");

    try {
      const profile = await loginOperative(creds.handle, creds.password);
      setStatusType("success");
      setStatusMessage(`SIGNAL LOCKED // WELCOME BACK @${profile.handle.toUpperCase()}`);
      setTimeout(() => onAuthenticated(profile), 400);
    } catch (err) {
      setStatusType("error");
      setStatusMessage(err instanceof Error ? err.message.toUpperCase() : "SIGN IN FAILED");
    } finally {
      setIsBusy(false);
    }
  };

  const handleRegisterPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.trim().toUpperCase() !== "MARSHALL77") {
      setStatusType("error");
      setStatusMessage("ACCESS DENIED // INVALID SCENE KEY (TRY MARSHALL77 OR GPS)");
      return;
    }
    await completeAccountCreation("KEY: MARSHALL77");
  };

  const handleGpsVerification = () => {
    const creds = validateCredentials();
    if (!creds) return;

    if (!("geolocation" in navigator)) {
      setStatusType("error");
      setStatusMessage("HARDWARE FAULT // GEOLOCATION UNAVAILABLE ON TERMINAL");
      return;
    }

    setIsBusy(true);
    setStatusType("info");
    setStatusMessage("TRIANGULATING SECTOR 45.7489° N, 21.2087° E...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const dist = calculateDistanceKm(latitude, longitude, TIMISOARA_LAT, TIMISOARA_LON);

        if (dist <= MAX_DISTANCE_KM) {
          void completeAccountCreation(`GPS: ${dist.toFixed(1)}KM`);
        } else {
          setIsBusy(false);
          setStatusType("error");
          setStatusMessage(
            `ACCESS DENIED // OUT OF RANGE (${dist.toFixed(1)}KM FROM TIMIȘOARA GENESIS NODE)`
          );
        }
      },
      (err) => {
        setIsBusy(false);
        setStatusType("error");
        setStatusMessage(
          `GPS BLOCKED (${err.message.toUpperCase()}) // USE SIMULATE GPS OR SCENE KEY`
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  return (
    <div className="min-h-screen samizdat-bg text-[#EAE6DF] font-mono flex flex-col justify-center p-4">
      <div className="max-w-lg w-full mx-auto border-2 border-[#EAE6DF] bg-[#141414] p-5 sm:p-6 space-y-5 rounded-none">
        {/* Banner */}
        <div className="border-b-2 border-[#D9381E] pb-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="bg-[#D9381E] text-[#EAE6DF] text-[11px] font-bold px-2 py-0.5 uppercase tracking-wider">
              [!] PIRATE CARRIER DETECTED
            </span>
            <span className="text-[11px] text-[#EAE6DF]/60 uppercase">CH-77 // TM</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight uppercase text-[#EAE6DF] leading-snug">
            FRECVENȚA 77 // OPERATIVE ACCESS
          </h1>
          <p className="text-xs text-[#EAE6DF]/75 uppercase">
            SIGN IN WITH YOUR REGISTERED HANDLE OR CREATE A NEW SCENE ACCOUNT.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 border-2 border-[#EAE6DF]">
          <button
            type="button"
            onClick={() => {
              setAuthMode("LOGIN");
              setStatusMessage(null);
            }}
            className={`py-2.5 text-xs font-bold uppercase transition-colors ${
              authMode === "LOGIN"
                ? "bg-[#33FF00] text-[#0D0D0D]"
                : "bg-[#0D0D0D] text-[#EAE6DF] hover:bg-[#EAE6DF]/10"
            }`}
          >
            [SIGN IN]
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("REGISTER");
              setStatusMessage(null);
            }}
            className={`border-l-2 border-[#EAE6DF] py-2.5 text-xs font-bold uppercase transition-colors ${
              authMode === "REGISTER"
                ? "bg-[#D9381E] text-[#EAE6DF]"
                : "bg-[#0D0D0D] text-[#EAE6DF] hover:bg-[#EAE6DF]/10"
            }`}
          >
            [CREATE ACCOUNT]
          </button>
        </div>

        {/* Status Console */}
        {statusMessage && (
          <div
            role="status"
            className={`border-2 p-3 text-xs font-bold uppercase tracking-wide rounded-none ${
              statusType === "error"
                ? "border-[#D9381E] bg-[#D9381E]/15 text-[#D9381E]"
                : statusType === "success"
                ? "border-[#33FF00] bg-[#33FF00]/15 text-[#33FF00] phosphor-glow"
                : "border-[#EAE6DF] bg-[#0D0D0D] text-[#EAE6DF]"
            }`}
          >
            &gt;&gt; {statusMessage}
          </div>
        )}

        {/* Shared Credentials Inputs */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="operative-handle" className="block text-xs font-bold uppercase">
              01 // OPERATIVE HANDLE:
            </label>
            <input
              id="operative-handle"
              type="text"
              value={handleInput}
              onChange={(e) => {
                setHandleInput(e.target.value);
                if (statusType === "error") setStatusMessage(null);
              }}
              placeholder="andrei77"
              autoComplete="username"
              className="w-full bg-[#0D0D0D] border-2 border-[#EAE6DF] px-3 py-2.5 text-sm text-[#33FF00] placeholder-[#EAE6DF]/35 focus:outline-none focus:border-[#33FF00] rounded-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="operative-password" className="block text-xs font-bold uppercase">
              02 // PASSWORD (MIN 6 CHARS):
            </label>
            <input
              id="operative-password"
              type="password"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                if (statusType === "error") setStatusMessage(null);
              }}
              placeholder="••••••••"
              autoComplete={authMode === "LOGIN" ? "current-password" : "new-password"}
              className="w-full bg-[#0D0D0D] border-2 border-[#EAE6DF] px-3 py-2.5 text-sm text-[#EAE6DF] placeholder-[#EAE6DF]/35 focus:outline-none focus:border-[#33FF00] rounded-none"
            />
          </div>
        </div>

        {/* LOGIN VIEW */}
        {authMode === "LOGIN" ? (
          <form onSubmit={handleLoginSubmit} className="pt-2">
            <button
              type="submit"
              disabled={isBusy}
              className="w-full bg-[#EAE6DF] text-[#0D0D0D] border-2 border-[#EAE6DF] py-3 text-xs sm:text-sm font-bold uppercase hover:bg-[#33FF00] hover:border-[#33FF00] disabled:opacity-50 transition-colors rounded-none"
            >
              {isBusy ? "[TUNING...]" : "[ENTER FREQUENCY]"}
            </button>
          </form>
        ) : (
          /* REGISTER VIEW (Requires Genesis Location or Scene Passphrase) */
          <div className="space-y-4 border-t-2 border-[#EAE6DF]/20 pt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase">
                <span>03A // GENESIS LOCATION CHECK</span>
                <span className="text-[11px] text-[#EAE6DF]/60">TIMIȘOARA</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleGpsVerification}
                  className="flex-1 bg-[#0D0D0D] text-[#33FF00] border-2 border-[#33FF00] px-3 py-2.5 text-xs font-bold uppercase hover:bg-[#33FF00] hover:text-[#0D0D0D] disabled:opacity-50 transition-colors rounded-none"
                >
                  [VERIFY GPS &amp; REGISTER]
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void completeAccountCreation("SIMULATED VENUE GPS")}
                  className="bg-[#0D0D0D] text-[#EAE6DF]/80 border-2 border-[#EAE6DF]/60 px-2.5 py-2.5 text-[11px] font-bold uppercase hover:border-[#EAE6DF] hover:text-[#EAE6DF] disabled:opacity-50 transition-colors rounded-none whitespace-nowrap"
                >
                  [SIMULATE VENUE GPS]
                </button>
              </div>
            </div>

            <form
              onSubmit={handleRegisterPassphrase}
              className="border-t-2 border-[#EAE6DF]/20 pt-4 space-y-3"
            >
              <div className="space-y-1">
                <label htmlFor="scene-passphrase" className="block text-xs font-bold uppercase">
                  03B // OR REGISTER WITH SCENE KEY:
                </label>
                <input
                  id="scene-passphrase"
                  type="text"
                  value={passphrase}
                  onChange={(e) => {
                    setPassphrase(e.target.value);
                    if (statusType === "error") setStatusMessage(null);
                  }}
                  placeholder="MARSHALL77"
                  autoComplete="off"
                  className="w-full bg-[#0D0D0D] border-2 border-[#EAE6DF] px-3 py-2.5 text-sm text-[#EAE6DF] uppercase placeholder-[#EAE6DF]/35 focus:outline-none focus:border-[#D9381E] rounded-none"
                />
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full bg-[#D9381E] text-[#EAE6DF] border-2 border-[#EAE6DF] py-2.5 text-xs sm:text-sm font-bold uppercase hover:bg-[#EAE6DF] hover:text-[#0D0D0D] disabled:opacity-50 transition-colors rounded-none"
              >
                {isBusy ? "[REGISTERING...]" : "[CREATE ACCOUNT & ENTER]"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Gatekeeper;
