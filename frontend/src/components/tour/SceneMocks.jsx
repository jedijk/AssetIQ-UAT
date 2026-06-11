import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  Plus,
  Activity,
  Eye,
  Wrench,
  Sparkles,
  Brain,
  Search,
  Target,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Send,
  ShieldAlert,
  ListChecks,
  TrendingDown,
  ChevronRight,
  ChevronDown,
  Factory,
  Cpu,
  Gauge,
  HardDriveDownload,
} from "lucide-react";
import TypewriterText from "./TypewriterText";
import CounterAnimation from "./CounterAnimation";

/* ============================================================================
 * Shared building blocks
 * ========================================================================== */

const PanelShell = ({ children, className = "", ...rest }) => (
  <motion.div
    initial={{ opacity: 0, y: 16, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -8, scale: 0.98 }}
    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-2xl ${className}`}
    {...rest}
  >
    {children}
  </motion.div>
);

const FakeWindowChrome = ({ title }) => (
  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-black/20">
    <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
    <span className="ml-3 text-[11px] uppercase tracking-[0.22em] text-slate-300/80">{title}</span>
  </div>
);

/* ============================================================================
 * Scene 1 — Workspace overview
 * ========================================================================== */

function MockWorkspace() {
  return (
    <PanelShell className="w-full max-w-3xl" data-testid="tour-mock-workspace">
      <FakeWindowChrome title="AssetIQ Workspace" />
      <div className="grid grid-cols-12 gap-3 p-4">
        {/* Hierarchy column */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="col-span-4 rounded-xl border border-white/10 bg-white/5 p-3"
        >
          <div className="flex items-center gap-2 mb-3 text-blue-300 text-xs uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5" />
            Asset Hierarchy
          </div>
          <ul className="space-y-1.5 text-sm text-slate-200">
            <li className="flex items-center gap-1.5">
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <Factory className="w-3.5 h-3.5 text-blue-300" />
              Plant Alpha
            </li>
            <li className="pl-5 flex items-center gap-1.5">
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <Cpu className="w-3.5 h-3.5 text-blue-300" />
              Production Line 1
            </li>
            <li className="pl-10 flex items-center gap-1.5 text-blue-200 font-medium">
              <Gauge className="w-3.5 h-3.5" />
              Pump P-101
            </li>
            <li className="pl-10 flex items-center gap-1.5 text-slate-300/80">
              <Gauge className="w-3.5 h-3.5" />
              Pump P-102
            </li>
            <li className="pl-10 flex items-center gap-1.5 text-slate-300/80">
              <Cpu className="w-3.5 h-3.5" />
              Motor M-201
            </li>
          </ul>
        </motion.div>

        {/* Main canvas — stat cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="col-span-8 grid grid-cols-3 gap-3"
        >
          {[
            { label: "Observations", value: 42, Icon: Eye, color: "text-blue-300" },
            { label: "Threats", value: 7, Icon: ShieldAlert, color: "text-amber-300" },
            { label: "Actions", value: 12, Icon: Wrench, color: "text-emerald-300" },
          ].map((card, idx) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + idx * 0.08 }}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <div className={`flex items-center gap-1.5 text-xs ${card.color}`}>
                <card.Icon className="w-3.5 h-3.5" />
                {card.label}
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                <CounterAnimation from={0} to={card.value} durationMs={900} delayMs={500 + idx * 80} />
              </div>
            </motion.div>
          ))}
          <div className="col-span-3 rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-3">
            <div className="flex items-center gap-2 text-blue-200 text-xs uppercase tracking-wider mb-2">
              <Activity className="w-3.5 h-3.5" />
              Reliability Snapshot
            </div>
            <div className="flex items-end gap-1 h-12">
              {[24, 38, 30, 52, 44, 70, 62, 86, 78, 92].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ delay: 0.7 + i * 0.04, duration: 0.4 }}
                  className="flex-1 rounded-sm bg-gradient-to-t from-blue-500/70 to-blue-300/80"
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
 * Scene 2 — Hierarchy zoom + hover effect on equipment
 * ========================================================================== */

function MockHierarchyZoom() {
  return (
    <PanelShell className="w-full max-w-md" data-testid="tour-mock-hierarchy-zoom">
      <FakeWindowChrome title="Asset hierarchy — zoomed" />
      <div className="p-4">
        <ul className="space-y-1.5 text-sm text-slate-200">
          <li className="flex items-center gap-1.5">
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            <Factory className="w-3.5 h-3.5 text-blue-300" />
            Plant Alpha
          </li>
          <li className="pl-5 flex items-center gap-1.5">
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            <Cpu className="w-3.5 h-3.5 text-blue-300" />
            Production Line 1
          </li>
          <motion.li
            initial={{ backgroundColor: "rgba(255,255,255,0)" }}
            animate={{
              backgroundColor: [
                "rgba(255,255,255,0)",
                "rgba(59,130,246,0.18)",
                "rgba(59,130,246,0.22)",
              ],
            }}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: "reverse" }}
            className="pl-10 flex items-center gap-1.5 text-blue-100 font-medium rounded-lg px-2 py-1.5 border border-blue-400/40"
          >
            <Gauge className="w-3.5 h-3.5" />
            Pump P-101
            <span className="ml-auto text-[10px] uppercase tracking-wider text-blue-300/80">
              Hovered
            </span>
          </motion.li>
          <li className="pl-10 flex items-center gap-1.5 text-slate-300/80">
            <Gauge className="w-3.5 h-3.5" />
            Pump P-102
          </li>
          <li className="pl-10 flex items-center gap-1.5 text-slate-300/80">
            <Cpu className="w-3.5 h-3.5" />
            Motor M-201
          </li>
        </ul>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
 * Scene 3 — Context menu opens, "Add Observation" highlighted
 * ========================================================================== */

function MockContextMenu() {
  return (
    <div className="relative w-full max-w-lg" data-testid="tour-mock-context-menu">
      <PanelShell>
        <FakeWindowChrome title="Right-click equipment" />
        <div className="p-4">
          <div className="relative">
            <ul className="space-y-1.5 text-sm text-slate-200">
              <li className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-300" />
                Production Line 1
              </li>
              <li className="pl-5 flex items-center gap-1.5 text-blue-100 font-medium">
                <Gauge className="w-3.5 h-3.5" />
                Pump P-101
              </li>
            </ul>

            {/* Context menu */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.35 }}
              className="absolute top-9 left-32 w-60 rounded-xl border border-white/15 bg-slate-800/95 backdrop-blur-xl shadow-2xl overflow-hidden"
            >
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-slate-400 border-b border-white/10">
                Pump P-101
              </div>
              <motion.button
                type="button"
                initial={{ backgroundColor: "rgba(59,130,246,0)" }}
                animate={{
                  backgroundColor: [
                    "rgba(59,130,246,0)",
                    "rgba(59,130,246,0.22)",
                    "rgba(59,130,246,0)",
                  ],
                }}
                transition={{ duration: 1.6, repeat: Infinity, delay: 1.1 }}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-blue-200 hover:bg-blue-500/20 text-left"
              >
                <Plus className="w-4 h-4" />
                Add Observation
              </motion.button>
              <button
                type="button"
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-200 hover:bg-white/10 text-left"
              >
                <Activity className="w-4 h-4" />
                View Timeline
              </button>
              <button
                type="button"
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-slate-200 hover:bg-white/10 text-left"
              >
                <Wrench className="w-4 h-4" />
                Linked Actions
              </button>
            </motion.div>

            {/* Faux cursor */}
            <motion.div
              initial={{ x: 60, y: 8, opacity: 0 }}
              animate={{ x: 156, y: 56, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8, ease: "easeInOut" }}
              className="absolute top-0 left-0 pointer-events-none"
            >
              <div className="w-3 h-3 rotate-[-12deg]">
                <svg viewBox="0 0 16 16" className="w-full h-full drop-shadow-lg">
                  <path
                    d="M1 1 L11 6 L6 7 L4 12 Z"
                    fill="white"
                    stroke="black"
                    strokeWidth="0.8"
                  />
                </svg>
              </div>
            </motion.div>
          </div>
        </div>
      </PanelShell>

      {/* Success slide-in: Observation form */}
      <motion.div
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 2.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-3"
      >
        <PanelShell className="py-3 px-4">
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            New Observation form opened for <span className="font-medium text-white">Pump P-101</span>
          </div>
        </PanelShell>
      </motion.div>
    </div>
  );
}

/* ============================================================================
 * Scene 4 — Quick Add: the floating + button (real DOM is also spotlighted)
 * ========================================================================== */

function MockQuickAdd() {
  return (
    <PanelShell className="w-full max-w-md" data-testid="tour-mock-quick-add">
      <div className="p-5 flex flex-col items-center text-center">
        <div className="relative">
          <motion.div
            animate={{
              boxShadow: [
                "0 0 0 0 rgba(59,130,246,0.55)",
                "0 0 0 24px rgba(59,130,246,0)",
              ],
            }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            className="absolute inset-0 rounded-full"
          />
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="relative w-16 h-16 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-[0_18px_40px_-12px_rgba(59,130,246,0.7)]"
          >
            <Plus className="w-7 h-7" />
          </motion.div>
        </div>
        <div className="mt-4 text-sm text-slate-300">
          Tap the floating <span className="text-blue-300 font-medium">+</span> button to open a fresh observation from anywhere in AssetIQ.
        </div>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
 * Scene 5 — AI Equipment detection (auto-match succeeds)
 * ========================================================================== */

function MockAIDetection({ typedText }) {
  const [typingDone, setTypingDone] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    setTypingDone(false);
    setAnalyzing(false);
    setMatched(false);
  }, [typedText]);

  useEffect(() => {
    if (!typingDone) return undefined;
    setAnalyzing(true);
    const t = setTimeout(() => {
      setAnalyzing(false);
      setMatched(true);
    }, 1100);
    return () => clearTimeout(t);
  }, [typingDone]);

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="tour-mock-ai-detection">
      <FakeWindowChrome title="New observation" />
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-[0.22em] text-slate-400 mb-2">
            Describe the issue
          </label>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-slate-100 text-[15px] leading-relaxed min-h-[52px]">
            <TypewriterText
              text={typedText}
              onComplete={() => setTypingDone(true)}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {analyzing && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 text-sm text-blue-200"
            >
              <Brain className="w-4 h-4 animate-pulse" />
              Analyzing your description
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-blue-300 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 bg-blue-300 rounded-full animate-bounce [animation-delay:120ms]" />
                <span className="w-1 h-1 bg-blue-300 rounded-full animate-bounce [animation-delay:240ms]" />
              </span>
            </motion.div>
          )}

          {matched && (
            <motion.div
              key="matched"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-500/25 flex items-center justify-center">
                <Target className="w-4.5 h-4.5 text-emerald-200" />
              </div>
              <div className="flex-1">
                <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-200/80">
                  Equipment identified
                </div>
                <div className="text-white font-medium">Pump P-101 — Production Line 1</div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-100 text-xs font-medium px-2.5 py-1">
                <CheckCircle2 className="w-3 h-3" />
                Match 96%
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
 * Scene 6 — Equipment clarification dialog
 * ========================================================================== */

function MockClarification({ typedText }) {
  const [typingDone, setTypingDone] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setTypingDone(false);
    setShowDialog(false);
    setSelected(null);
  }, [typedText]);

  useEffect(() => {
    if (!typingDone) return undefined;
    const t1 = setTimeout(() => setShowDialog(true), 700);
    const t2 = setTimeout(() => setSelected("P-101"), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [typingDone]);

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="tour-mock-clarification">
      <FakeWindowChrome title="New observation" />
      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-slate-100 text-[15px] leading-relaxed min-h-[52px]">
          <TypewriterText text={typedText} onComplete={() => setTypingDone(true)} />
        </div>

        {typingDone && !showDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-sm text-amber-200"
          >
            <AlertTriangle className="w-4 h-4" />
            AI confidence is low. Please help locate the equipment.
          </motion.div>
        )}

        <AnimatePresence>
          {showDialog && (
            <motion.div
              key="dialog"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-white/15 bg-slate-800/80 p-4"
            >
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-300/80 mb-2">
                <Search className="w-3.5 h-3.5" />
                Equipment search
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                <Search className="w-4 h-4 text-slate-400" />
                <TypewriterText text="pump production area" speedMs={42} startDelayMs={400} cursor={false} />
              </div>

              <div className="mt-3 space-y-1.5">
                {[
                  { id: "P-101", name: "Pump P-101", path: "Plant Alpha › Line 1" },
                  { id: "P-102", name: "Pump P-102", path: "Plant Alpha › Line 1" },
                  { id: "P-203", name: "Pump P-203", path: "Plant Alpha › Line 2" },
                ].map((eq, i) => (
                  <motion.div
                    key={eq.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.5 + i * 0.1 }}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-colors ${
                      selected === eq.id
                        ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <Gauge className="w-4 h-4 text-blue-300" />
                    <span className="font-medium">{eq.name}</span>
                    <span className="text-xs text-slate-400 ml-1">{eq.path}</span>
                    {selected === eq.id ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-300 ml-auto" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 ml-auto" />
                    )}
                  </motion.div>
                ))}
              </div>

              <AnimatePresence>
                {selected && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 flex items-center gap-2 text-sm text-emerald-200"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Linked <span className="font-medium text-white">Pump P-101</span> to this observation
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
 * Scene 7 — Describe the problem (AI extracts symptoms / failure modes)
 * ========================================================================== */

function MockDescribe({ typedText }) {
  const [typingDone, setTypingDone] = useState(false);

  useEffect(() => {
    setTypingDone(false);
  }, [typedText]);

  const tags = [
    { label: "Vibration", icon: Activity },
    { label: "Abnormal noise", icon: Activity },
    { label: "Bearing wear", icon: AlertTriangle },
    { label: "Misalignment", icon: AlertTriangle },
  ];

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="tour-mock-describe">
      <FakeWindowChrome title="Describe the observation" />
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-[0.22em] text-slate-400 mb-2">
            Description
          </label>
          <div className="rounded-xl border border-blue-400/40 bg-blue-500/5 p-3 text-slate-100 text-[15px] leading-relaxed min-h-[64px]">
            <TypewriterText text={typedText} onComplete={() => setTypingDone(true)} speedMs={22} />
          </div>
        </div>

        <AnimatePresence>
          {typingDone && (
            <motion.div
              key="extracted"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-white/15 bg-white/5 p-3"
            >
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-blue-200 mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                AI extracted
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((t, i) => (
                  <motion.span
                    key={t.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 + i * 0.08 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-400/40 text-blue-100 text-xs font-medium px-2.5 py-1"
                  >
                    <t.icon className="w-3 h-3" />
                    {t.label}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
 * Scene 8 — Submit observation (success)
 * ========================================================================== */

function MockSubmit() {
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    setSubmitted(false);
    const t = setTimeout(() => setSubmitted(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <PanelShell className="w-full max-w-xl" data-testid="tour-mock-submit">
      <FakeWindowChrome title="Ready to submit" />
      <div className="p-5">
        <div className="rounded-xl border border-white/15 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300/80 mb-1">
            Observation
          </div>
          <div className="text-white font-medium leading-snug">
            High vibration detected on Pump P-101. Abnormal noise present during operation.
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-300/90">
            <Target className="w-3.5 h-3.5 text-blue-300" /> Pump P-101
            <span className="text-slate-500">·</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300" /> Bearing wear suspected
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-3 py-2 text-sm text-slate-300 rounded-lg hover:bg-white/5"
          >
            Cancel
          </motion.button>
          <motion.div
            animate={{
              boxShadow: submitted
                ? "0 0 0 0 rgba(34,197,94,0.0)"
                : [
                    "0 0 0 0 rgba(59,130,246,0.5)",
                    "0 0 0 14px rgba(59,130,246,0)",
                  ],
            }}
            transition={{ duration: 1.4, repeat: submitted ? 0 : Infinity, ease: "easeOut" }}
            className="rounded-lg"
          >
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                submitted
                  ? "bg-emerald-500 text-white"
                  : "bg-blue-500 text-white hover:bg-blue-400"
              }`}
            >
              {submitted ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Created
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit
                </>
              )}
            </button>
          </motion.div>
        </div>

        <AnimatePresence>
          {submitted && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45 }}
              className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-emerald-500/25 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-200" />
              </div>
              <div>
                <div className="text-white font-medium">Observation created</div>
                <div className="text-emerald-100/80 text-xs">
                  AssetIQ is now starting threat assessment…
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
 * Scene 9 — What happens next: KPI flow + counters
 * ========================================================================== */

const FLOW_STEPS = [
  { id: "observation", label: "Observation", Icon: Eye, color: "text-blue-300" },
  { id: "threat", label: "Threat detected", Icon: ShieldAlert, color: "text-amber-300" },
  { id: "ai", label: "AI risk analysis", Icon: Brain, color: "text-purple-300" },
  { id: "actions", label: "Recommended actions", Icon: ListChecks, color: "text-emerald-300" },
  { id: "execute", label: "Work execution", Icon: Wrench, color: "text-sky-300" },
  { id: "exposure", label: "Exposure reduced", Icon: TrendingDown, color: "text-rose-300" },
];

function MockNextSteps() {
  return (
    <PanelShell className="w-full max-w-3xl" data-testid="tour-mock-next-steps">
      <FakeWindowChrome title="AssetIQ intelligence workflow" />
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
          {FLOW_STEPS.map((step, i) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.18, duration: 0.45 }}
              className="relative rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col items-center text-center"
            >
              <step.Icon className={`w-5 h-5 ${step.color}`} />
              <div className="mt-2 text-[12px] text-slate-200 leading-tight">
                {step.label}
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <motion.div
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.18 }}
                  className="hidden sm:block absolute -right-1.5 top-1/2 -translate-y-1/2 text-white/50"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>

        {/* KPI counters */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "Threats opened", to: 3, suffix: "", color: "text-amber-200" },
            { label: "Actions generated", to: 7, suffix: "", color: "text-emerald-200" },
            { label: "Exposure reduced", to: 48, suffix: "%", color: "text-rose-200" },
          ].map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + i * 0.15 }}
              className="rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-3"
            >
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                {k.label}
              </div>
              <div className={`mt-1 text-2xl font-semibold ${k.color}`}>
                <CounterAnimation
                  from={0}
                  to={k.to}
                  durationMs={1300}
                  delayMs={1200 + i * 150}
                  suffix={k.suffix}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.4 }}
          className="mt-4 flex items-center justify-center gap-2 text-xs text-blue-200"
        >
          <HardDriveDownload className="w-3.5 h-3.5" />
          Your observation is now powering AssetIQ’s reliability intelligence loop
        </motion.div>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
 * Dispatcher
 * ========================================================================== */

export default function SceneMocks({ mockKey, typedText }) {
  switch (mockKey) {
    case "workspace":
      return <MockWorkspace />;
    case "hierarchyZoom":
      return <MockHierarchyZoom />;
    case "contextMenu":
      return <MockContextMenu />;
    case "quickAdd":
      return <MockQuickAdd />;
    case "aiDetection":
      return <MockAIDetection typedText={typedText} />;
    case "clarification":
      return <MockClarification typedText={typedText} />;
    case "describe":
      return <MockDescribe typedText={typedText} />;
    case "submit":
      return <MockSubmit />;
    case "nextSteps":
      return <MockNextSteps />;
    default:
      return null;
  }
}
