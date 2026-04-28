import React, { useMemo, useState } from "react";
import { Sparkles, BarChart3, Hash, Calendar, Users } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { api } from "../../lib/apiClient";

function normalize(s) {
  return (s || "").toLowerCase();
}

function isOverdue(action) {
  const due = action?.due_date || action?.dueDate || action?.deadline;
  if (!due) return false;
  const d = new Date(due);
  if (isNaN(d)) return false;
  const status = normalize(action?.status);
  const closed = status === "closed" || status === "completed" || status === "done";
  return !closed && d.getTime() < Date.now();
}

function getOwnerKey(action) {
  return (
    action?.assignee ||
    action?.owner_id ||
    action?.owner ||
    action?.assigned_to ||
    action?.assignedTo ||
    "Unassigned"
  );
}

function countBy(items, keyFn) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

function mapUserLabel(usersById, key) {
  const u = usersById.get(key);
  return u?.name || u?.email || String(key);
}

export function AIDashboardBuilderPanel({
  actions = [],
  observations = [],
  investigations = [],
  users = [],
}) {
  const [prompt, setPrompt] = useState("");
  const [intent, setIntent] = useState(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState(null);

  const usersById = useMemo(() => {
    const m = new Map();
    (users || []).forEach((u) => {
      if (u?.id != null) m.set(u.id, u);
      if (u?.email) m.set(u.email, u);
    });
    return m;
  }, [users]);

  const suggestions = useMemo(
    () => [
      "Show overdue actions by owner",
      "Open actions by site",
      "Top recurring failure modes",
      "Monthly observation trend",
      "Critical issues requiring attention",
    ],
    []
  );

  const buildLocalHeuristic = () => {
    const p = normalize(prompt);
    if (!p) return;

    // MVP heuristic intent engine (no LLM yet). Produces a single widget.
    if (p.includes("overdue") && p.includes("action")) {
      setIntent({
        title: "Overdue actions by owner",
        why: "Counts actions with due date before today and not closed, grouped by owner.",
        type: "bar",
        chips: ["Actions", "Overdue", "Group: owner"],
        compute: () => {
          const overdue = (actions || []).filter(isOverdue);
          const byOwner = countBy(overdue, getOwnerKey);
          const rows = Array.from(byOwner.entries()).map(([ownerKey, value]) => ({
            label: mapUserLabel(usersById, ownerKey),
            value,
          }));
          rows.sort((a, b) => b.value - a.value);
          return rows.slice(0, 10);
        },
      });
      return;
    }

    if (p.includes("open") && p.includes("action")) {
      setIntent({
        title: "Open actions",
        why: "Counts actions that are not closed/completed.",
        type: "kpi",
        chips: ["Actions", "Open"],
        compute: () => {
          const open = (actions || []).filter((a) => {
            const status = normalize(a?.status);
            return status && status !== "closed" && status !== "completed" && status !== "done";
          });
          return open.length;
        },
      });
      return;
    }

    if (p.includes("open") && (p.includes("investigation") || p.includes("case"))) {
      setIntent({
        title: "Open investigations",
        why: "Counts investigations that are not completed/closed.",
        type: "kpi",
        chips: ["Investigations", "Open"],
        compute: () => {
          const open = (investigations || []).filter((i) => {
            const status = normalize(i?.status);
            return status && status !== "completed" && status !== "closed";
          });
          return open.length;
        },
      });
      return;
    }

    if (p.includes("observation") && (p.includes("critical") || p.includes("high"))) {
      setIntent({
        title: "Critical observations",
        why: "Counts observations with risk level Critical/High (where available).",
        type: "kpi",
        chips: ["Observations", "Critical/High"],
        compute: () => {
          const crit = (observations || []).filter((o) => {
            const rl = normalize(o?.risk_level || o?.riskLevel);
            return rl === "critical" || rl === "high";
          });
          return crit.length;
        },
      });
      return;
    }

    // Fallback: ask 1 smart question (kept simple in MVP)
    setIntent({
      title: "I can build that—quick question",
      why: "Your request can map to multiple sources/metrics.",
      type: "question",
      chips: ["Clarify"],
      question: "Do you want Actions, Observations, or Investigations (or all of them)?",
    });
  };

  const build = async () => {
    const p = normalize(prompt);
    if (!p) return;
    setIsBuilding(true);
    setBuildError(null);

    try {
      const res = await api.post("/ai/dashboard-intent", { prompt });
      const aiIntent = res?.data?.intent;
      const templateId = aiIntent?.template_id;

      if (!templateId) {
        throw new Error("AI did not return an intent");
      }

      // Convert template intent → local renderable intent.
      if (templateId === "overdue_actions_by_owner") {
        setIntent({
          title: aiIntent.title || "Overdue actions by owner",
          why: aiIntent.why || "Counts overdue actions grouped by owner.",
          type: "bar",
          chips: ["Actions", "Overdue", "Group: owner"],
          compute: () => {
            const overdue = (actions || []).filter(isOverdue);
            const byOwner = countBy(overdue, getOwnerKey);
            const rows = Array.from(byOwner.entries()).map(([ownerKey, value]) => ({
              label: mapUserLabel(usersById, ownerKey),
              value,
            }));
            rows.sort((a, b) => b.value - a.value);
            return rows.slice(0, 10);
          },
        });
        return;
      }

      if (templateId === "open_actions_kpi") {
        setIntent({
          title: aiIntent.title || "Open actions",
          why: aiIntent.why || "Counts actions that are not closed/completed.",
          type: "kpi",
          chips: ["Actions", "Open"],
          compute: () => {
            const open = (actions || []).filter((a) => {
              const status = normalize(a?.status);
              return status && status !== "closed" && status !== "completed" && status !== "done";
            });
            return open.length;
          },
        });
        return;
      }

      if (templateId === "open_investigations_kpi") {
        setIntent({
          title: aiIntent.title || "Open investigations",
          why: aiIntent.why || "Counts investigations that are not completed/closed.",
          type: "kpi",
          chips: ["Investigations", "Open"],
          compute: () => {
            const open = (investigations || []).filter((i) => {
              const status = normalize(i?.status);
              return status && status !== "completed" && status !== "closed";
            });
            return open.length;
          },
        });
        return;
      }

      if (templateId === "critical_observations_kpi") {
        setIntent({
          title: aiIntent.title || "Critical observations",
          why: aiIntent.why || "Counts observations with risk level Critical/High (where available).",
          type: "kpi",
          chips: ["Observations", "Critical/High"],
          compute: () => {
            const crit = (observations || []).filter((o) => {
              const rl = normalize(o?.risk_level || o?.riskLevel);
              return rl === "critical" || rl === "high";
            });
            return crit.length;
          },
        });
        return;
      }

      // Clarify (or unknown) → question
      setIntent({
        title: aiIntent.title || "Quick question",
        why: aiIntent.why || "I need one detail to build the right widget.",
        type: "question",
        chips: ["Clarify"],
        question:
          aiIntent?.params?.question ||
          "Do you want Actions, Observations, or Investigations (or all of them)?",
      });
    } catch (e) {
      setBuildError(e?.response?.data?.detail || e?.message || "AI build failed");
      // Fall back to heuristic (so the feature remains usable even if AI misconfigured)
      buildLocalHeuristic();
    } finally {
      setIsBuilding(false);
    }
  };

  const data = useMemo(() => (intent?.type === "bar" ? intent.compute() : null), [intent]);
  const kpi = useMemo(() => (intent?.type === "kpi" ? intent.compute() : null), [intent]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4" data-testid="ai-dashboard-builder">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Ask AI to build a dashboard</h2>
              <p className="text-xs text-slate-500 truncate">
                Type what you want to see. We’ll generate a widget instantly, with a “Why” explanation.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Calendar className="w-3.5 h-3.5" /> <span>Default: last 30 days</span>
        </div>
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Show overdue actions by owner"
          className="h-10"
          data-testid="ai-dashboard-prompt"
        />
        <Button onClick={build} className="h-10 gap-2" data-testid="ai-dashboard-build" disabled={isBuilding}>
          <Sparkles className="w-4 h-4" />
          {isBuilding ? "Building…" : "Build"}
        </Button>
      </div>

      {buildError && (
        <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {buildError}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setPrompt(s);
              setIntent(null);
            }}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            data-testid="ai-suggestion"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        {!intent && (
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
            <p className="text-sm font-medium text-slate-700">Build your first widget in under 60 seconds</p>
            <p className="text-xs text-slate-500 mt-1">
              Pick a suggestion or type a request. You can refine afterwards (KPI vs chart, time window, sorting).
            </p>
          </div>
        )}

        {intent && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{intent.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{intent.why}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(intent.chips || []).map((c) => (
                  <Badge key={c} variant="secondary" className="bg-white">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="p-4">
              {intent.type === "question" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <p className="text-sm font-medium text-amber-900">{intent.question}</p>
                  <p className="text-xs text-amber-700 mt-1">
                    (MVP) Reply with “actions”, “observations”, or “investigations”.
                  </p>
                </div>
              )}

              {intent.type === "kpi" && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Hash className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-slate-900 tabular-nums" data-testid="ai-kpi">
                      {kpi ?? 0}
                    </div>
                    <div className="text-xs text-slate-500">Auto-generated KPI</div>
                  </div>
                </div>
              )}

              {intent.type === "bar" && (
                <div className="h-[260px]" data-testid="ai-bar">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Users className="w-3.5 h-3.5" /> Grouped by owner (top 10)
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data || []} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="label" width={120} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 4, 4]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {(intent.type === "kpi" || intent.type === "bar") && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      if (intent.type === "bar") {
                        const total = (data || []).reduce((a, b) => a + (b.value || 0), 0);
                        setIntent({
                          title: intent.title.replace(" by owner", ""),
                          why: intent.why,
                          type: "kpi",
                          chips: [...(intent.chips || []).filter((c) => !c.startsWith("Group:")), "KPI"],
                          compute: () => total,
                        });
                      }
                    }}
                    data-testid="ai-refine-kpi"
                  >
                    <Hash className="w-3.5 h-3.5" /> Make KPI
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setPrompt("")}
                    data-testid="ai-clear"
                  >
                    Clear
                  </Button>
                  <div className="text-[11px] text-slate-400 ml-auto flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" />
                    MVP heuristic builder (LLM integration next)
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

