import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Search,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  TrendingDown,
  User,
  Calendar,
  Flag,
  Plus,
  Pencil,
  Microscope,
  Activity,
  FileSearch,
  Thermometer,
  History,
  ChevronRight,
  Check,
} from "lucide-react";
import TypewriterText from "./TypewriterText";
import CounterAnimation from "./CounterAnimation";

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

const SuccessBanner = ({ label }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
  >
    <CheckCircle2 className="w-4 h-4 shrink-0" />
    {label}
  </motion.div>
);

const FlowRow = ({ steps, delayBase = 0.1 }) => (
  <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
    {steps.map((step, i) => (
      <React.Fragment key={step}>
        <motion.span
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delayBase + i * 0.12 }}
          className="text-[10px] sm:text-xs text-slate-200 px-2 py-1 rounded-lg bg-white/5 border border-white/10"
        >
          {step}
        </motion.span>
        {i < steps.length - 1 && (
          <ArrowRight className="w-3 h-3 text-white/30 hidden sm:block" />
        )}
      </React.Fragment>
    ))}
  </div>
);

function MockProgressOpened({ typedText }) {
  const [fmLoading, setFmLoading] = useState(true);
  useEffect(() => {
    setFmLoading(true);
    const t = setTimeout(() => setFmLoading(false), 1400);
    return () => clearTimeout(t);
  }, [typedText]);

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-opened">
      <FakeWindowChrome title="Observation Detail — Pump P-101" />
      <div className="p-4 sm:p-5 space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400 mb-2">Description</div>
          <div className="rounded-xl border border-blue-400/40 bg-blue-500/10 p-3 text-slate-100 text-[15px] leading-relaxed min-h-[52px] ring-2 ring-blue-400/30">
            <TypewriterText text={typedText || "High vibration detected on Pump P-101 during operation."} />
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400 mb-2">Failure Mode</div>
          <AnimatePresence mode="wait">
            {fmLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-sm text-blue-200"
              >
                <Brain className="w-4 h-4 animate-pulse" />
                Analysing observation context…
              </motion.div>
            ) : (
              <motion.div
                key="ready"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
              >
                Suggested failure mode ready for review
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </PanelShell>
  );
}

function MockProgressSuggestedFm() {
  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-suggested-fm">
      <FakeWindowChrome title="Failure Mode — Suggested" />
      <div className="p-4 sm:p-5 grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400 mb-2">Description</div>
          <p className="text-sm text-slate-200 leading-relaxed">
            High vibration detected on Pump P-101 during operation.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-purple-400/40 bg-purple-500/10 p-3 ring-2 ring-purple-400/25"
        >
          <div className="text-[11px] uppercase tracking-[0.22em] text-purple-200/80 mb-2">Suggested</div>
          <div className="text-white font-medium">Bearing Degradation</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "82%" }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="h-full bg-purple-400 rounded-full"
              />
            </div>
            <span className="text-xs text-purple-200 font-medium">82%</span>
          </div>
        </motion.div>
      </div>
    </PanelShell>
  );
}

function MockProgressConfirmFm() {
  const [phase, setPhase] = useState("review");
  useEffect(() => {
    setPhase("review");
    const t1 = setTimeout(() => setPhase("change"), 3200);
    const t2 = setTimeout(() => setPhase("success"), 6200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-confirm-fm">
      <FakeWindowChrome title="Failure Mode Validation" />
      <div className="p-4 sm:p-5 space-y-3">
        <AnimatePresence mode="wait">
          {phase === "review" && (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="text-sm text-slate-200">Bearing Degradation suggested</div>
              <div className="flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 px-3 py-2 text-xs text-emerald-100">
                  <Check className="w-3.5 h-3.5" /> Confirm Failure Mode
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-xs text-slate-300">
                  Change Failure Mode
                </span>
              </div>
            </motion.div>
          )}
          {phase === "change" && (
            <motion.div key="change" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <Search className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">Search failure modes…</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {["Bearing Degradation", "Misalignment", "Cavitation", "Seal Failure"].map((fm) => (
                  <div
                    key={fm}
                    className={`rounded-lg px-2 py-1.5 border ${
                      fm === "Misalignment"
                        ? "border-blue-400/50 bg-blue-500/15 text-blue-100"
                        : "border-white/10 bg-white/5 text-slate-300"
                    }`}
                  >
                    {fm}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {phase === "success" && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <SuccessBanner label="Failure Mode Updated — Misalignment" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PanelShell>
  );
}

function MockProgressInvestigationDecision() {
  return (
    <PanelShell className="w-full max-w-xl" data-testid="progress-mock-investigation-decision">
      <FakeWindowChrome title="Cause Understanding" />
      <div className="p-4 sm:p-5 space-y-4">
        <p className="text-sm text-slate-200 text-center">Is the cause sufficiently understood?</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center"
          >
            <CheckCircle2 className="w-6 h-6 text-emerald-300 mx-auto mb-2" />
            <div className="text-sm font-medium text-white">Yes</div>
            <div className="text-xs text-emerald-100/80 mt-1">Continue to recommended actions</div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-center ring-2 ring-amber-400/30"
          >
            <Microscope className="w-6 h-6 text-amber-300 mx-auto mb-2" />
            <div className="text-sm font-medium text-white">No</div>
            <div className="text-xs text-amber-100/80 mt-1">Start investigation</div>
          </motion.div>
        </div>
      </div>
    </PanelShell>
  );
}

function MockProgressAiAnalysis() {
  const [step, setStep] = useState(0);
  const pipeline = ["Observation", "Equipment Context", "Failure Modes", "Historical Events", "Reliability Knowledge", "AI Analysis"];
  useEffect(() => {
    setStep(0);
    const id = setInterval(() => {
      setStep((s) => {
        if (s >= pipeline.length - 1) {
          clearInterval(id);
          return s;
        }
        return s + 1;
      });
    }, 700);
    return () => clearInterval(id);
  }, [pipeline.length]);

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-ai-analysis">
      <FakeWindowChrome title="Start AI Analysis" />
      <div className="p-4 sm:p-5 space-y-4">
        <FlowRow steps={pipeline.slice(0, Math.min(step + 1, pipeline.length))} />
        {step >= pipeline.length - 1 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Potential causes</div>
            {[
              { name: "Misalignment", pct: 78 },
              { name: "Bearing Wear", pct: 65 },
              { name: "Lubrication Issues", pct: 52 },
            ].map((c, i) => (
              <div key={c.name} className="flex items-center gap-2 text-sm">
                <span className="text-slate-200 w-32">{c.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${c.pct}%` }}
                    transition={{ delay: 0.2 + i * 0.15, duration: 0.6 }}
                    className="h-full bg-blue-400 rounded-full"
                  />
                </div>
                <span className="text-xs text-blue-200 w-8">{c.pct}%</span>
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </PanelShell>
  );
}

function MockProgressCreateInvestigation() {
  const [created, setCreated] = useState(false);
  useEffect(() => {
    setCreated(false);
    const t = setTimeout(() => setCreated(true), 2800);
    return () => clearTimeout(t);
  }, []);

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-create-investigation">
      <FakeWindowChrome title="Create Investigation" />
      <div className="p-4 sm:p-5 space-y-3">
        {!created ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 text-sm">
            {[
              ["Title", "Pump P-101 vibration — root cause"],
              ["Problem", "High vibration during operation"],
              ["Potential causes", "Misalignment, bearing wear, lubrication"],
              ["Objectives", "Confirm root cause before action planning"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
                <div className="text-slate-200 mt-0.5">{v}</div>
              </div>
            ))}
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium px-3 py-2">
                Create Investigation
              </span>
            </div>
          </motion.div>
        ) : (
          <SuccessBanner label="Investigation Created" />
        )}
      </div>
    </PanelShell>
  );
}

function MockProgressInvestigationPlan() {
  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-investigation-plan">
      <FakeWindowChrome title="Investigation Plan" />
      <div className="p-4 sm:p-5 grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400 mb-2">Recommended evidence</div>
          <ul className="space-y-1.5 text-sm text-slate-200">
            {[
              { Icon: Activity, label: "Vibration Data" },
              { Icon: Thermometer, label: "Thermography" },
              { Icon: FileSearch, label: "Lubrication Analysis" },
              { Icon: History, label: "Maintenance History" },
            ].map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                <Icon className="w-3.5 h-3.5 text-blue-300" />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400 mb-2">Suggested activities</div>
          <ul className="space-y-1.5 text-sm text-slate-200">
            {["Inspect Coupling Alignment", "Review Vibration Trends", "Inspect Bearings"].map((a) => (
              <li key={a} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                <ChevronRight className="w-3.5 h-3.5 text-emerald-300" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PanelShell>
  );
}

function MockProgressInvestigationResults() {
  return (
    <PanelShell className="w-full max-w-xl" data-testid="progress-mock-investigation-results">
      <FakeWindowChrome title="Investigation Results" />
      <div className="p-4 sm:p-5 space-y-4">
        <FlowRow steps={["Evidence Collected", "Root Cause Confirmed", "Failure Mode Validated"]} />
        <SuccessBanner label="Misalignment validated — continue to action planning" />
      </div>
    </PanelShell>
  );
}

function MockProgressRecommendedActions() {
  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-recommended-actions">
      <FakeWindowChrome title="Recommended Actions" />
      <div className="p-4 sm:p-5 space-y-2">
        {["Check Coupling Alignment", "Perform Vibration Analysis", "Inspect Mounting Bolts"].map((a, i) => (
          <motion.div
            key={a}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.12 }}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
          >
            <span className="text-sm text-slate-100">{a}</span>
            <span className="text-[10px] uppercase tracking-wide text-purple-300/90">Strategy linked</span>
          </motion.div>
        ))}
      </div>
    </PanelShell>
  );
}

function MockProgressAiRecommendations() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(false);
    const t = setTimeout(() => setDone(true), 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-ai-recommendations">
      <FakeWindowChrome title="Generate AI Recommendations" />
      <div className="p-4 sm:p-5 space-y-3">
        {!done ? (
          <div className="flex items-center gap-2 text-sm text-blue-200">
            <Sparkles className="w-4 h-4 animate-pulse" />
            Generating additional recommendations…
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            {["Verify Shaft Runout", "Review Maintenance History", "Inspect Soft Foot Conditions"].map((a) => (
              <div key={a} className="flex items-center justify-between rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">
                {a}
                <span className="text-[10px] uppercase text-blue-200/80">AI generated</span>
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </PanelShell>
  );
}

function MockProgressActionPlan() {
  const [progress, setProgress] = useState(35);
  useEffect(() => {
    setProgress(35);
    const t = setTimeout(() => setProgress(68), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-action-plan">
      <FakeWindowChrome title="Action Plan Builder" />
      <div className="p-4 sm:p-5 space-y-3">
        {[
          { title: "Check Coupling Alignment", owner: "Mechanical", priority: "High", due: "Apr 12" },
          { title: "Perform Vibration Analysis", owner: "Reliability", priority: "Medium", due: "Apr 18" },
        ].map((a, i) => (
          <motion.div
            key={a.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.15 }}
            className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
          >
            <div className="text-white font-medium">{a.title}</div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1"><User className="w-3 h-3" />{a.owner}</span>
              <span className="flex items-center gap-1"><Flag className="w-3 h-3" />{a.priority}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{a.due}</span>
            </div>
          </motion.div>
        ))}
        <div className="pt-1">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Plan completeness</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <motion.div
              animate={{ width: `${progress}%` }}
              className="h-full bg-emerald-400 rounded-full"
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

function MockProgressAddToPlan() {
  const [count, setCount] = useState(2);
  const [exposure, setExposure] = useState(12);
  useEffect(() => {
    setCount(2);
    setExposure(12);
    const t1 = setTimeout(() => { setCount(4); setExposure(24); }, 2000);
    const t2 = setTimeout(() => { setCount(5); setExposure(31); }, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <PanelShell className="w-full max-w-xl" data-testid="progress-mock-add-to-plan">
      <FakeWindowChrome title="Add To Plan" />
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Actions in plan</span>
          <motion.span key={count} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="text-2xl font-semibold text-white">
            <CounterAnimation from={count - 1} to={count} durationMs={400} />
          </motion.span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Est. exposure reduction</span>
          <span className="text-lg font-semibold text-emerald-300">
            <CounterAnimation from={exposure - 8} to={exposure} durationMs={600} suffix="%" />
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/20 border border-blue-400/40 px-3 py-2 text-xs text-blue-100">
          <Plus className="w-3.5 h-3.5" /> Add To Plan
        </span>
      </div>
    </PanelShell>
  );
}

function MockProgressEditActions() {
  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-edit-actions">
      <FakeWindowChrome title="Action Editor" />
      <div className="p-4 sm:p-5 space-y-2 text-sm">
        {[
          ["Description", "Laser alignment during planned shutdown"],
          ["Owner", "Maintenance Team A"],
          ["Priority", "High"],
          ["Due Date", "May 15, 2026"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <Pencil className="w-3.5 h-3.5 text-blue-300 shrink-0" />
            <span className="text-slate-400 w-24">{k}</span>
            <span className="text-slate-100">{v}</span>
          </div>
        ))}
        <SuccessBanner label="Changes saved" />
      </div>
    </PanelShell>
  );
}

function MockProgressManualAction() {
  return (
    <PanelShell className="w-full max-w-xl" data-testid="progress-mock-manual-action">
      <FakeWindowChrome title="Add Action" />
      <div className="p-4 sm:p-5 space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200 italic">
          “Perform laser alignment during next planned shutdown.”
        </div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <SuccessBanner label="Manual action added to plan" />
        </motion.div>
      </div>
    </PanelShell>
  );
}

function MockProgressReviewPlan() {
  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-review-plan">
      <FakeWindowChrome title="Action Plan Review" />
      <div className="p-4 sm:p-5 space-y-3">
        {[
          { group: "Recommended", count: 3, color: "text-purple-200" },
          { group: "AI Recommendations", count: 2, color: "text-blue-200" },
          { group: "Manual Actions", count: 1, color: "text-amber-200" },
        ].map((g) => (
          <div key={g.group} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className={`text-sm ${g.color}`}>{g.group}</span>
            <span className="text-white font-medium">{g.count}</span>
          </div>
        ))}
        <div className="pt-2">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Plan completeness</span>
            <span>92%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div className="h-full w-[92%] bg-emerald-400 rounded-full" />
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

function MockProgressFinalize() {
  const steps = ["Observation", "Failure Mode", "Investigation", "Recommended Actions", "AI Recommendations", "Action Plan", "Execution"];
  return (
    <PanelShell className="w-full max-w-2xl" data-testid="progress-mock-finalize">
      <FakeWindowChrome title="Finalize Response" />
      <div className="p-4 sm:p-5 space-y-4">
        <FlowRow steps={steps} delayBase={0.05} />
        <SuccessBanner label="Observation Progressed" />
      </div>
    </PanelShell>
  );
}

function MockProgressBusinessImpact() {
  const flow = [
    "Observation Created",
    "Threat Identified",
    "Failure Mode Validated",
    "Investigation Performed",
    "Action Plan Created",
    "Work Executed",
    "Exposure Reduced",
  ];
  return (
    <PanelShell className="w-full max-w-3xl" data-testid="progress-mock-business-impact">
      <FakeWindowChrome title="Executive Dashboard" />
      <div className="p-3 sm:p-5 space-y-4">
        <FlowRow steps={flow} delayBase={0.04} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Active Threat Exposure", to: 18, suffix: "K", prefix: "€", down: true },
            { label: "PM Compliance", to: 94, suffix: "%", down: false },
            { label: "Actions Executed", to: 12, suffix: "", down: false },
            { label: "Exposure Reduction", to: 31, suffix: "%", down: false },
          ].map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 + i * 0.12 }}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 leading-tight">{k.label}</div>
              <div className={`mt-1 text-lg sm:text-xl font-semibold ${k.down ? "text-emerald-300" : "text-blue-200"}`}>
                {k.down && <TrendingDown className="w-3.5 h-3.5 inline mr-0.5" />}
                <CounterAnimation from={0} to={k.to} durationMs={1200} delayMs={900 + i * 100} prefix={k.prefix || ""} suffix={k.suffix} />
              </div>
            </motion.div>
          ))}
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
          className="text-center text-sm text-slate-300 italic px-2"
        >
          “Every observation is an opportunity to reduce risk and improve reliability.”
        </motion.p>
      </div>
    </PanelShell>
  );
}

const MOCK_MAP = {
  progressOpened: MockProgressOpened,
  progressSuggestedFm: MockProgressSuggestedFm,
  progressConfirmFm: MockProgressConfirmFm,
  progressInvestigationDecision: MockProgressInvestigationDecision,
  progressAiAnalysis: MockProgressAiAnalysis,
  progressCreateInvestigation: MockProgressCreateInvestigation,
  progressInvestigationPlan: MockProgressInvestigationPlan,
  progressInvestigationResults: MockProgressInvestigationResults,
  progressRecommendedActions: MockProgressRecommendedActions,
  progressAiRecommendations: MockProgressAiRecommendations,
  progressActionPlan: MockProgressActionPlan,
  progressAddToPlan: MockProgressAddToPlan,
  progressEditActions: MockProgressEditActions,
  progressManualAction: MockProgressManualAction,
  progressReviewPlan: MockProgressReviewPlan,
  progressFinalize: MockProgressFinalize,
  progressBusinessImpact: MockProgressBusinessImpact,
};

export default function ProgressSceneMocks({ mockKey, typedText }) {
  const Component = MOCK_MAP[mockKey];
  if (!Component) return null;
  return <Component typedText={typedText} />;
}

export { ProgressSceneMocks };
