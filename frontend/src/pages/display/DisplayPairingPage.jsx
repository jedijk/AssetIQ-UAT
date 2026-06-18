import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Monitor, RefreshCw } from "lucide-react";
import {
  displayDeviceAPI,
  DISPLAY_DEVICE_ID_KEY,
  DISPLAY_DEVICE_TOKEN_KEY,
  getDisplayDbEnv,
  getOrCreateDeviceFingerprint,
  setDisplayDbEnv,
} from "../../lib/apis/displayDeviceAPI";
import { Button } from "../../components/ui/button";
import { DisplayPairingInstructions } from "../../components/visual-boards/DisplayPairingInstructions";

function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const DisplayPairingPage = () => {
  const navigate = useNavigate();
  const fingerprintRef = useRef(getOrCreateDeviceFingerprint());
  const [pairCode, setPairCode] = useState("");
  const [expiresIn, setExpiresIn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paired, setPaired] = useState(() => {
    try {
      return !!(localStorage.getItem(DISPLAY_DEVICE_TOKEN_KEY) && localStorage.getItem(DISPLAY_DEVICE_ID_KEY));
    } catch {
      return false;
    }
  });
  const [pairedInfo, setPairedInfo] = useState(null);

  const requestCode = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await displayDeviceAPI.requestPairing({
        device_fingerprint: fingerprintRef.current,
        user_agent: navigator.userAgent,
        screen_width: window.screen?.width,
        screen_height: window.screen?.height,
        device_label: navigator.platform || "Display",
      });
      setPairCode(data.pair_code);
      setExpiresIn(data.expires_in ?? 600);
    } catch (err) {
      setError(err.message || "Could not start pairing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const existingToken = localStorage.getItem(DISPLAY_DEVICE_TOKEN_KEY);
      if (existingToken) {
        navigate("/tv/board?fullscreen=true", { replace: true });
      }
    } catch (_e) {}
  }, [navigate]);

  useEffect(() => {
    if (!paired) {
      requestCode();
    }
  }, [paired, requestCode]);

  useEffect(() => {
    if (paired || !pairCode || expiresIn <= 0) return undefined;
    const timer = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [paired, pairCode, expiresIn]);

  useEffect(() => {
    if (paired || !pairCode || expiresIn > 0) return;
    requestCode();
  }, [paired, pairCode, expiresIn, requestCode]);

  useEffect(() => {
    if (paired || !pairCode) return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const status = await displayDeviceAPI.pollPairingStatus(pairCode, fingerprintRef.current);
        if (cancelled) return;

        if (status.status === "pending" && typeof status.expires_in === "number") {
          setExpiresIn(status.expires_in);
        }

        if (status.status === "paired" && status.device_token) {
          setDisplayDbEnv(getDisplayDbEnv());
          localStorage.setItem(DISPLAY_DEVICE_TOKEN_KEY, status.device_token);
          localStorage.setItem(DISPLAY_DEVICE_ID_KEY, status.device_id || "");
          setPairedInfo(status);
          setPaired(true);
          navigate("/tv/board?fullscreen=true", { replace: true });
        }

        if (status.status === "expired") {
          requestCode();
        }
      } catch {
        /* ignore transient poll errors */
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [paired, pairCode, requestCode, navigate]);

  if (paired) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-center">
        <Monitor className="w-16 h-16 text-green-400 mb-6" />
        <h1 className="text-3xl font-bold mb-2">Device Paired</h1>
        <p className="text-slate-400 max-w-md mb-2">
          {pairedInfo?.screen_name ? `"${pairedInfo.screen_name}" is ready.` : "Loading your board…"}
        </p>
        <Loader2 className="w-8 h-8 animate-spin text-slate-500 mt-4" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-6">
        <div className="text-center">
          <p className="text-blue-400 text-sm font-semibold tracking-wide uppercase mb-2">AssetIQ Display</p>
          <h1 className="text-3xl font-bold">Pair this device</h1>
        </div>

        <DisplayPairingInstructions variant="display" />

        <div className="text-center space-y-6">
        {loading && !pairCode ? (
          <Loader2 className="w-10 h-10 animate-spin text-slate-500 mx-auto" />
        ) : (
          <>
            <div className="bg-slate-900 border border-slate-700 rounded-2xl py-10 px-6">
              <p className="text-slate-400 text-sm mb-3">Code</p>
              <p className="text-5xl sm:text-6xl font-mono font-bold tracking-[0.35em] text-white" data-testid="display-pair-code">
                {pairCode || "------"}
              </p>
              <p className="text-slate-500 text-sm mt-6">
                Expires in{" "}
                <span className="text-slate-300 font-mono tabular-nums">{formatCountdown(expiresIn)}</span>
              </p>
            </div>

            <div className="flex justify-center gap-3">
              <Button variant="outline" className="border-slate-600 text-slate-200" onClick={requestCode}>
                <RefreshCw className="w-4 h-4 mr-2" />
                New code
              </Button>
            </div>
          </>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <p className="text-xs text-slate-600 text-center">
          {window.screen?.width}×{window.screen?.height} · {navigator.userAgent?.split(" ").slice(-2).join(" ")}
        </p>
        </div>
      </div>
    </div>
  );
};

export default DisplayPairingPage;
