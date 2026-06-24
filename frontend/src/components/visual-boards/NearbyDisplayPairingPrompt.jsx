import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { displayDeviceAPI } from "../../lib/apis/displayDeviceAPI";
import { getDatabaseEnvironment } from "../../lib/databaseEnv";
import { rememberDismissedPairing } from "../../lib/localNetwork";
import { useNearbyDisplayPairing } from "../../hooks/useNearbyDisplayPairing";
import { usePermissions } from "../../contexts/PermissionsContext";
import { useAuth } from "../../contexts/AuthContext";

const ENV_LABEL = { production: "Production", uat: "UAT" };

function formatExpires(seconds) {
  const m = Math.floor((seconds || 0) / 60);
  const s = (seconds || 0) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TvHero({ pairCode, resolution }) {
  return (
    <div className="relative mx-auto my-5 w-[148px] h-[92px]" aria-hidden>
      <div className="absolute inset-0 rounded-[14px] bg-gradient-to-b from-slate-700 to-slate-900 shadow-[0_18px_40px_-12px_rgba(15,23,42,0.55)] border border-slate-600/80" />
      <div className="absolute inset-x-[10px] top-[8px] bottom-[18px] rounded-[6px] bg-slate-950/90 border border-white/10 flex items-center justify-center">
        {pairCode ? (
          <span className="font-mono text-[15px] font-semibold tracking-[0.22em] text-white/95">
            {pairCode}
          </span>
        ) : (
          <div className="w-10 h-1 rounded-full bg-white/20" />
        )}
      </div>
      <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-slate-500/80" />
      {resolution ? (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap">
          {resolution}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Apple-style pairing card when a TV on the same network is waiting to pair.
 */
export default function NearbyDisplayPairingPrompt() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canPair = !!user && (hasPermission("visual_boards", "write") || hasPermission("visual_boards", "delete"));
  const { nearby, dismiss } = useNearbyDisplayPairing({ enabled: canPair });
  const queryClient = useQueryClient();
  const dbEnv = getDatabaseEnvironment();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("intro");
  const activePairingIdRef = useRef(null);
  const [pairForm, setPairForm] = useState({
    board_id: "",
    board_db_env: "",
    screen_name: "",
    location: "",
  });

  useEffect(() => {
    if (!nearby?.pairing_id) {
      setOpen(false);
      activePairingIdRef.current = null;
      return;
    }

    setOpen(true);
    const isNewPairing = activePairingIdRef.current !== nearby.pairing_id;
    if (isNewPairing) {
      activePairingIdRef.current = nearby.pairing_id;
      setStep("intro");
      setPairForm({
        board_id: "",
        board_db_env: "",
        screen_name: nearby.device_label || "Shop Floor TV",
        location: "",
      });
      return;
    }

    setPairForm((prev) => ({
      ...prev,
      screen_name: prev.screen_name || nearby.device_label || "Shop Floor TV",
    }));
  }, [nearby]);

  const { data: boardsData, isLoading: boardsLoading } = useQuery({
    queryKey: ["display-pairing-boards", dbEnv, nearby?.pairing_id],
    queryFn: () => displayDeviceAPI.listBoardsForPairing(),
    enabled: open && !!nearby && step === "configure",
  });

  const completeMutation = useMutation({
    mutationFn: () => {
      const payload = {
        pair_code: nearby.pair_code,
        board_id: pairForm.board_id,
        screen_name: pairForm.screen_name,
        location: pairForm.location || undefined,
      };
      if (pairForm.board_db_env) {
        payload.database_environment = pairForm.board_db_env;
      }
      return displayDeviceAPI.completePairing(payload);
    },
    onSuccess: (result) => {
      toast.success(`Paired "${result.screen_name}"`);
      if (nearby?.pairing_id) rememberDismissedPairing(nearby.pairing_id);
      dismiss(nearby?.pairing_id);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["display-devices"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || err.message || "Pairing failed");
    },
  });

  const handleDismiss = () => {
    if (nearby?.pairing_id) {
      rememberDismissedPairing(nearby.pairing_id);
      dismiss(nearby.pairing_id);
    }
    activePairingIdRef.current = null;
    setOpen(false);
    setStep("intro");
  };

  const handleConnect = () => {
    setStep("configure");
  };

  const handlePair = () => {
    if (!pairForm.board_id || !pairForm.screen_name) return;
    completeMutation.mutate();
  };

  if (!canPair) return null;

  const boards = boardsData?.items || [];
  const displayName = nearby?.device_label || "Display";
  const selectedBoard = boards.find((b) => b.id === pairForm.board_id);

  return (
    <AnimatePresence mode="wait">
      {open && nearby ? (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 pb-8 sm:pb-4 pointer-events-none">
          <motion.button
            type="button"
            aria-label="Dismiss pairing prompt"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismiss}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nearby-pairing-title"
            className="relative w-full max-w-[360px] pointer-events-auto"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            <div className="relative overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] px-6 pt-7 pb-6">
              {step === "configure" ? (
                <button
                  type="button"
                  onClick={() => setStep("intro")}
                  className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label="Back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleDismiss}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100/90 text-slate-500 hover:bg-slate-200/90 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              {step === "intro" ? (
                <>
                  <div className="text-center px-2 pt-1">
                    <h2
                      id="nearby-pairing-title"
                      className="text-[17px] font-semibold tracking-tight text-slate-900"
                    >
                      {displayName} nearby
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-snug text-slate-500 px-1">
                      A display on your Wi‑Fi is ready to pair with AssetIQ.
                    </p>
                    {nearby.expires_in ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Code expires in {formatExpires(nearby.expires_in)}
                      </p>
                    ) : null}
                  </div>

                  <TvHero pairCode={nearby.pair_code} resolution={nearby.resolution} />

                  <button
                    type="button"
                    onClick={handleConnect}
                    className="mt-2 w-full rounded-full bg-[#f2f2f7] py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-[#e8e8ed] active:bg-[#dedee3]"
                  >
                    Connect
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center px-2 pt-1">
                    <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                      Choose a board
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-snug text-slate-500">
                      Assign a visual board to this display.
                    </p>
                  </div>

                  <TvHero pairCode={nearby.pair_code} resolution={nearby.resolution} />

                  <div className="mt-1 space-y-2.5">
                    <div className="rounded-2xl bg-[#f2f2f7] px-3.5 py-2.5">
                      <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">
                        Board
                      </label>
                      <select
                        className="w-full bg-transparent text-[15px] font-medium text-slate-900 outline-none appearance-none"
                        value={pairForm.board_id}
                        onChange={(e) => {
                          const boardId = e.target.value;
                          const board = boards.find((b) => b.id === boardId);
                          setPairForm((f) => ({
                            ...f,
                            board_id: boardId,
                            board_db_env: board?.database_environment || "",
                          }));
                        }}
                        disabled={boardsLoading}
                      >
                        <option value="">Select board…</option>
                        {boards.map((b) => (
                          <option key={`${b.database_environment}:${b.id}`} value={b.id}>
                            {b.name}
                            {b.database_environment
                              ? ` (${ENV_LABEL[b.database_environment] || b.database_environment})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-2xl bg-[#f2f2f7] px-3.5 py-2.5">
                      <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">
                        Screen name
                      </label>
                      <input
                        className="w-full bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
                        value={pairForm.screen_name}
                        onChange={(e) => setPairForm((f) => ({ ...f, screen_name: e.target.value }))}
                        placeholder="Control Room TV"
                      />
                    </div>

                    {selectedBoard ? (
                      <p className="text-center text-[11px] text-slate-400 px-2">
                        Pairing code {nearby.pair_code}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handlePair}
                    disabled={!pairForm.board_id || !pairForm.screen_name || completeMutation.isPending}
                    className="mt-4 w-full rounded-full bg-[#f2f2f7] py-3.5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-[#e8e8ed] active:bg-[#dedee3] disabled:opacity-45 disabled:pointer-events-none flex items-center justify-center gap-2"
                  >
                    {completeMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Connecting…
                      </>
                    ) : (
                      "Connect"
                    )}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
