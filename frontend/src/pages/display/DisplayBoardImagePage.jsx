import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  displayDeviceAPI,
  DISPLAY_DEVICE_ID_KEY,
  DISPLAY_DEVICE_TOKEN_KEY,
  getDisplayDbEnv,
  getStoredDeviceId,
  getStoredDeviceToken,
} from "../../lib/apis/displayDeviceAPI";
import { getWebSocketBaseUrl } from "../../lib/apiConfig";

const REFRESH_MS = 30_000;
const SNAPSHOT_RETRY_ATTEMPTS = 8;
const SNAPSHOT_RETRY_DELAY_MS = 4_000;

function clearDisplayStorage() {
  try {
    localStorage.removeItem(DISPLAY_DEVICE_TOKEN_KEY);
    localStorage.removeItem(DISPLAY_DEVICE_ID_KEY);
  } catch (_e) {}
}

/**
 * Kiosk TV view — single full-screen image, refreshed every 30s. No widgets or React canvas.
 */
const DisplayBoardImagePage = ({ onFallbackToCanvas }) => {
  const navigate = useNavigate();
  const deviceToken = getStoredDeviceToken();
  const deviceId = getStoredDeviceId();
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const urlRef = useRef("");
  const fallbackTriggered = useRef(false);
  const retryAttempt = useRef(0);

  const triggerCanvasFallback = useCallback(() => {
    if (fallbackTriggered.current) return;
    fallbackTriggered.current = true;
    onFallbackToCanvas?.();
  }, [onFallbackToCanvas]);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!deviceToken || fallbackTriggered.current) return;
    try {
      const { blob } = await displayDeviceAPI.fetchBoardSnapshot(deviceToken, {
        cacheBust: Date.now(),
      });
      if (!blob || blob.size === 0) {
        throw new Error("Empty snapshot");
      }
      retryAttempt.current = 0;
      revokeUrl();
      const nextUrl = URL.createObjectURL(blob);
      urlRef.current = nextUrl;
      setImageUrl(nextUrl);
      setError("");
      setLoading(false);
    } catch (err) {
      const status = err?.status;
      if (status === 401) {
        clearDisplayStorage();
        navigate("/tv", { replace: true });
        return;
      }
      if (!urlRef.current) {
        if (retryAttempt.current < SNAPSHOT_RETRY_ATTEMPTS) {
          retryAttempt.current += 1;
          window.setTimeout(() => {
            if (!fallbackTriggered.current) loadSnapshot();
          }, SNAPSHOT_RETRY_DELAY_MS);
          return;
        }
        triggerCanvasFallback();
        return;
      }
      setError(err.message || "Could not load board image");
      setLoading(false);
    }
  }, [deviceToken, navigate, revokeUrl, triggerCanvasFallback]);

  useEffect(() => {
    if (!deviceToken) {
      navigate("/tv", { replace: true });
    }
  }, [deviceToken, navigate]);

  useEffect(() => {
    if (!deviceToken) return undefined;
    loadSnapshot();
    const id = setInterval(loadSnapshot, REFRESH_MS);
    return () => {
      clearInterval(id);
      revokeUrl();
    };
  }, [deviceToken, loadSnapshot, revokeUrl]);

  useEffect(() => {
    if (!deviceToken) return undefined;

    let cancelled = false;
    displayDeviceAPI.connect(deviceToken).catch(() => {});

    const dbEnv = getDisplayDbEnv();
    const dbQuery = dbEnv && dbEnv !== "production" ? `&db_env=${encodeURIComponent(dbEnv)}` : "";
    const wsUrl = `${getWebSocketBaseUrl()}/ws/display?token=${encodeURIComponent(deviceToken)}${dbQuery}`;
    let ws;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (
            msg.event === "board_updated" ||
            msg.event === "board_reassigned" ||
            msg.event === "data_refreshed"
          ) {
            if (!cancelled) loadSnapshot();
          }
          if (msg.event === "token_rotated") {
            displayDeviceAPI
              .acceptTokenRotation(deviceToken)
              .then((result) => {
                if (result?.device_token) {
                  localStorage.setItem(DISPLAY_DEVICE_TOKEN_KEY, result.device_token);
                  window.location.reload();
                }
              })
              .catch(() => {
                clearDisplayStorage();
                navigate("/tv", { replace: true });
              });
          }
          if (msg.event === "board_unpublished" || msg.event === "device_disabled") {
            clearDisplayStorage();
            navigate("/tv", { replace: true });
          }
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* polling handles refresh */
    }

    return () => {
      cancelled = true;
      if (ws) ws.close();
    };
  }, [deviceToken, loadSnapshot, navigate]);

  useEffect(() => {
    if (!deviceToken || !deviceId) return undefined;
    const heartbeat = () => {
      displayDeviceAPI.sendHeartbeat(deviceId, deviceToken).catch(() => {});
    };
    heartbeat();
    const id = setInterval(heartbeat, 60_000);
    return () => clearInterval(id);
  }, [deviceToken, deviceId]);

  useEffect(() => {
    if (!deviceToken || imageUrl || loading || error || fallbackTriggered.current) return;
    triggerCanvasFallback();
  }, [deviceToken, imageUrl, loading, error, triggerCanvasFallback]);

  if (!deviceToken) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-slate-500 mb-4" />
        <p className="text-slate-400">Opening pairing screen…</p>
      </div>
    );
  }

  if (loading && !imageUrl) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-12 h-12 animate-spin text-slate-500" />
        <p className="text-sm text-slate-500">Loading board image…</p>
      </div>
    );
  }

  if (error && !imageUrl) {
    return (
      <div className="fixed inset-0 bg-black text-slate-300 flex flex-col items-center justify-center p-8 text-center gap-4">
        <p className="max-w-md text-sm leading-relaxed">{error}</p>
        <p className="text-xs text-slate-500">
          Publish the board from the designer to generate the TV image.
        </p>
        <button
          type="button"
          className="text-sm text-slate-400 underline"
          onClick={() => {
            clearDisplayStorage();
            navigate("/tv", { replace: true });
          }}
        >
          Re-pair this display
        </button>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-12 h-12 animate-spin text-slate-500" />
        <p className="text-sm text-slate-500">Switching to live board…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <img
        key={imageUrl}
        src={imageUrl}
        alt="Visual management board"
        className="w-full h-full object-contain bg-black select-none"
        draggable={false}
        onError={() => {
          revokeUrl();
          setImageUrl("");
          triggerCanvasFallback();
        }}
      />
    </div>
  );
};

export default DisplayBoardImagePage;
