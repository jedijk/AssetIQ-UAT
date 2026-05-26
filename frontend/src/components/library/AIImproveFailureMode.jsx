import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  Brain,
  CheckCircle,
  ArrowRight,
  Wand2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { toast } from "sonner";
import api from "../../lib/api";

const FIELDS = [
  { key: "failure_mode", label: "Name" },
  { key: "category", label: "Category" },
  { key: "mechanism", label: "ISO Mechanism" },
  { key: "severity", label: "Severity (S)" },
  { key: "occurrence", label: "Occurrence (O)" },
  { key: "detectability", label: "Detectability (D)" },
  { key: "keywords", label: "Keywords", isList: true },
  { key: "potential_effects", label: "Potential Effects", isList: true },
  { key: "potential_causes", label: "Potential Causes", isList: true },
  { key: "recommended_actions", label: "Recommended Actions", isList: true },
  { key: "equipment_type_ids", label: "Equipment Types", isList: true, displayKey: "equipment_type_names" },
];

const actionsToStrings = (acts) =>
  (acts || [])
    .map((a) => (typeof a === "string" ? a : a?.action || a?.description || ""))
    .filter(Boolean);

const arrEqual = (a, b) => {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  if (A.length !== B.length) return false;
  const sa = [...A].map(String).sort();
  const sb = [...B].map(String).sort();
  return sa.every((v, i) => v === sb[i]);
};

const valEqual = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) return arrEqual(a, b);
  return String(a ?? "") === String(b ?? "");
};

const getRpnColor = (rpn) => {
  if (rpn >= 200) return "bg-red-100 text-red-700 border-red-200";
  if (rpn >= 125) return "bg-orange-100 text-orange-700 border-orange-200";
  if (rpn >= 80) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
};

export function AIImproveFailureMode({
  isOpen,
  onClose,
  failureMode,
  equipmentTypes = [],
  onApply,
}) {
  const [loading, setLoading] = useState(false);
  const [improved, setImproved] = useState(null);
  const [selectedFields, setSelectedFields] = useState({});

  useEffect(() => {
    if (!isOpen) {
      setImproved(null);
      setSelectedFields({});
    }
  }, [isOpen]);

  // Normalize the current FM for diffing
  const current = useMemo(() => {
    if (!failureMode) return null;
    return {
      failure_mode: failureMode.failure_mode || "",
      category: failureMode.category || "",
      mechanism: failureMode.iso14224_mechanism || failureMode.mechanism || "",
      severity: failureMode.severity ?? null,
      occurrence: failureMode.occurrence ?? null,
      detectability: failureMode.detectability ?? null,
      keywords: failureMode.keywords || [],
      potential_effects: failureMode.potential_effects || [],
      potential_causes: failureMode.potential_causes || [],
      recommended_actions: actionsToStrings(failureMode.recommended_actions),
      recommended_actions_full: failureMode.recommended_actions || [],
      equipment_type_ids: failureMode.equipment_type_ids || [],
    };
  }, [failureMode]);

  const equipmentTypeNameById = useMemo(() => {
    const m = {};
    equipmentTypes.forEach((t) => {
      m[t.id] = t.name;
    });
    return m;
  }, [equipmentTypes]);

  const fetchImprovement = async () => {
    if (!current) return;
    setLoading(true);
    setImproved(null);
    setSelectedFields({});
    try {
      const payload = {
        failure_mode: {
          id: failureMode.id,
          failure_mode: current.failure_mode,
          category: current.category,
          mechanism: current.mechanism,
          severity: current.severity,
          occurrence: current.occurrence,
          detectability: current.detectability,
          keywords: current.keywords,
          potential_effects: current.potential_effects,
          potential_causes: current.potential_causes,
          recommended_actions: current.recommended_actions,
          equipment_type_ids: current.equipment_type_ids,
        },
        equipment_types: equipmentTypes.slice(0, 200).map((t) => ({
          id: t.id,
          name: t.name,
          discipline: t.discipline || "",
        })),
      };
      const response = await api.post(
        "/ai-suggestions/improve-failure-mode",
        payload,
        { timeout: 120000 },
      );
      const data = response.data;
      setImproved(data);

      // Pre-select only fields that actually changed
      const preselect = {};
      FIELDS.forEach((f) => {
        const cur = current[f.key];
        const imp = data[f.key];
        if (!valEqual(cur, imp)) preselect[f.key] = true;
      });
      setSelectedFields(preselect);

      const changedCount = Object.keys(preselect).length;
      if (changedCount === 0) {
        toast.success("Already in great shape — no changes needed");
      } else {
        toast.success(
          `AI suggests ${changedCount} improvement${changedCount === 1 ? "" : "s"}`,
        );
      }
    } catch (e) {
      console.error("Improve FM error:", e);
      toast.error(
        e.response?.data?.detail || "Failed to get AI improvements. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (key) => {
    setSelectedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApply = () => {
    if (!improved) return;
    const keys = Object.entries(selectedFields)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (keys.length === 0) {
      toast.warning("Select at least one improvement to apply");
      return;
    }
    const patch = {};
    for (const k of keys) {
      if (k === "recommended_actions") {
        // Preserve existing per-action metadata when the textual content is preserved;
        // otherwise emit fresh PM/Mechanical defaults so the field is at least usable.
        const existingByAction = {};
        for (const a of current.recommended_actions_full || []) {
          if (typeof a === "object") {
            const txt = (a.action || a.description || "").toString();
            if (txt) existingByAction[txt.toLowerCase()] = a;
          }
        }
        patch[k] = (improved.recommended_actions || []).map((txt) => {
          const existing = existingByAction[txt.toLowerCase()];
          if (existing) return existing;
          return {
            action: txt,
            action_type: "PM",
            discipline: "mechanical",
          };
        });
      } else if (k === "mechanism") {
        // FailureMode model stores this as iso14224_mechanism on the backend
        patch.iso14224_mechanism = improved.mechanism;
      } else {
        patch[k] = improved[k];
      }
    }
    onApply?.(patch, improved);
    toast.success(`Applied ${keys.length} improvement${keys.length === 1 ? "" : "s"}`);
    onClose();
  };

  const renderValue = (val, isList, key) => {
    if (isList) {
      const items = Array.isArray(val) ? val : [];
      if (items.length === 0) {
        return <span className="text-slate-400 italic text-xs">— empty —</span>;
      }
      // For equipment_type_ids show names
      const display = (
        key === "equipment_type_ids" && improved?.equipment_type_names?.length
          ? improved.equipment_type_names
          : items
      );
      return (
        <ul className="list-disc list-inside text-xs text-slate-700 space-y-0.5">
          {display.slice(0, 8).map((x, i) => (
            <li key={`${key}-${i}`}>{typeof x === "string" ? x : JSON.stringify(x)}</li>
          ))}
          {display.length > 8 && (
            <li className="text-slate-400">+{display.length - 8} more</li>
          )}
        </ul>
      );
    }
    if (val === null || val === undefined || val === "") {
      return <span className="text-slate-400 italic text-xs">— empty —</span>;
    }
    return <span className="text-sm text-slate-900">{String(val)}</span>;
  };

  const renderCurrentValue = (key, isList) => {
    if (!current) return null;
    if (isList && key === "equipment_type_ids") {
      const names = (current.equipment_type_ids || [])
        .map((id) => equipmentTypeNameById[id] || id);
      return renderValue(names, true, key);
    }
    return renderValue(current[key], isList, key);
  };

  const renderImprovedValue = (key, isList) => {
    if (!improved) return null;
    return renderValue(improved[key], isList, key);
  };

  const totalChanged = improved
    ? FIELDS.filter((f) => !valEqual(current?.[f.key], improved[f.key])).length
    : 0;
  const totalSelected = Object.values(selectedFields).filter(Boolean).length;

  const currentRpn =
    (current?.severity || 0) *
    (current?.occurrence || 0) *
    (current?.detectability || 0);
  const improvedRpn = improved?.rpn || 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
        data-testid="ai-improve-fm-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-600" />
            Improve with AI
          </DialogTitle>
          <DialogDescription>
            An AI reliability engineer reviews this failure mode and proposes
            field-by-field improvements. Pick which changes to apply.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg mb-4">
            <div className="flex items-center gap-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {current?.failure_mode}
                </p>
                <p className="text-xs text-slate-500">Current failure mode</p>
              </div>
              <div className="flex items-center gap-3">
                {currentRpn > 0 && (
                  <Badge className={`text-xs ${getRpnColor(currentRpn)}`}>
                    Current RPN {currentRpn}
                  </Badge>
                )}
                {improvedRpn > 0 && (
                  <>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <Badge className={`text-xs ${getRpnColor(improvedRpn)}`}>
                      Improved RPN {improvedRpn}
                    </Badge>
                  </>
                )}
              </div>
            </div>

            <Button
              onClick={fetchImprovement}
              disabled={loading || !current}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="ai-improve-fm-run-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Reviewing...
                </>
              ) : improved ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Re-analyze
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze & Improve
                </>
              )}
            </Button>
          </div>

          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-purple-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-purple-600 rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-purple-600" />
                </div>
              </div>
              <p className="text-slate-600 font-medium">
                Reviewing this failure mode as a reliability engineer...
              </p>
              <p className="text-sm text-slate-400 mt-1">
                ISO 14224 / SAE J1739 alignment
              </p>
            </div>
          )}

          {!loading && !improved && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-4">
                <Wand2 className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                Ready to Review
              </h3>
              <p className="text-sm text-slate-500 max-w-md">
                Click "Analyze &amp; Improve" to have an AI reliability engineer
                refine every field of this failure mode.
              </p>
            </div>
          )}

          {!loading && improved && (
            <div className="flex-1 overflow-auto min-h-0">
              {improved.improvements_summary?.length > 0 && (
                <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-xs font-semibold text-purple-900 mb-1">
                    Summary of changes
                  </p>
                  <ul className="list-disc list-inside text-xs text-purple-800 space-y-0.5">
                    {improved.improvements_summary.map((s, i) => (
                      <li key={`imp-${i}`}>{s}</li>
                    ))}
                  </ul>
                  {improved.rationale && (
                    <p className="text-xs text-purple-700 mt-2 italic">
                      {improved.rationale}
                    </p>
                  )}
                </div>
              )}

              {improved.improvements_summary?.length === 0 && (
                <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">
                      This failure mode is already in great shape
                    </p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      {improved.rationale ||
                        "The AI reliability engineer reviewed every field and saw no meaningful improvements."}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2 pr-2 pb-4" data-testid="ai-improve-fm-results">
                {FIELDS.map((f) => {
                  const changed = !valEqual(current?.[f.key], improved[f.key]);
                  const isSelected = !!selectedFields[f.key];
                  const explanation =
                    changed && improved.field_explanations?.[f.key]
                      ? improved.field_explanations[f.key]
                      : null;
                  return (
                    <div
                      key={f.key}
                      className={`border rounded-lg overflow-hidden ${
                        changed
                          ? isSelected
                            ? "border-green-300 bg-green-50/30"
                            : "border-amber-200 bg-amber-50/30"
                          : "border-slate-200 bg-white opacity-70"
                      }`}
                      data-testid={`ai-improve-fm-row-${f.key}`}
                    >
                      <div className="flex items-stretch">
                        <div className="flex items-center px-3 border-r border-slate-200 bg-white">
                          <button
                            type="button"
                            disabled={!changed}
                            onClick={() => toggleField(f.key)}
                            className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                              !changed
                                ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                                : isSelected
                                  ? "bg-green-500"
                                  : "bg-slate-100 border border-slate-300 hover:bg-slate-200"
                            }`}
                            aria-label={isSelected ? "Deselect" : "Select"}
                            data-testid={`ai-improve-fm-toggle-${f.key}`}
                          >
                            {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                            <div className="p-3">
                              <p className="text-xs font-medium text-slate-500 mb-1">
                                Current — {f.label}
                              </p>
                              {renderCurrentValue(f.key, f.isList)}
                            </div>
                            <div className="p-3 bg-white/50">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-medium text-purple-700">
                                  AI improved — {f.label}
                                </p>
                                {!changed && (
                                  <span className="text-[10px] text-emerald-600 font-medium">
                                    ✓ already good
                                  </span>
                                )}
                              </div>
                              {renderImprovedValue(f.key, f.isList)}
                            </div>
                          </div>
                          {explanation && (
                            <div className="px-3 pb-3 pt-1 border-t border-amber-100 bg-amber-50/40">
                              <p className="text-xs text-amber-900">
                                <span className="font-semibold">Why: </span>
                                {explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-slate-500">
              {improved && (
                <>
                  <span className="font-medium text-purple-700">{totalChanged}</span>{" "}
                  field{totalChanged === 1 ? "" : "s"} changed —{" "}
                  <span className="font-medium text-green-600">{totalSelected}</span>{" "}
                  selected to apply
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={!improved || totalSelected === 0}
                className="bg-green-600 hover:bg-green-700"
                data-testid="ai-improve-fm-apply-btn"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Apply ({totalSelected})
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AIImproveFailureMode;
