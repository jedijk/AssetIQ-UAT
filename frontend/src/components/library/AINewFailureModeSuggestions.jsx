import { useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  Brain,
  RefreshCw,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Input } from "../ui/input";
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

const getRpnColor = (rpn) => {
  if (rpn >= 200) return "bg-red-100 text-red-700 border-red-200";
  if (rpn >= 125) return "bg-orange-100 text-orange-700 border-orange-200";
  if (rpn >= 80) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
};

export function AINewFailureModeSuggestions({
  isOpen,
  onClose,
  equipmentTypes = [],
  failureModes = [],
  onCreated,
  t,
}) {
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  // Each row keyed by index: { selected, failureMode, category, severity, occurrence, detectability }
  const [drafts, setDrafts] = useState({});
  const [creating, setCreating] = useState(false);

  const fetchSuggestions = async () => {
    if (equipmentTypes.length === 0) {
      toast.info("Add equipment types first, then come back here to discover missing failure modes");
      return;
    }

    setLoading(true);
    setSuggestions([]);
    setDrafts({});
    setLoadingStatus("Reviewing your catalog as a reliability engineer...");

    const progressInterval = setInterval(() => {
      const messages = [
        `Analyzing ${equipmentTypes.length} equipment types...`,
        `Cross-checking against ${failureModes.length} existing failure modes...`,
        `Identifying ISO 14224 gaps...`,
        `Estimating Severity / Occurrence / Detectability...`,
        `Drafting recommendations...`,
      ];
      setLoadingStatus(messages[Math.floor(Math.random() * messages.length)]);
    }, 3000);

    try {
      const payload = {
        equipment_types: equipmentTypes.slice(0, 120).map((et) => ({
          id: et.id,
          name: et.name,
          discipline: et.discipline || "",
        })),
        existing_failure_modes: failureModes.slice(0, 500).map((fm) => ({
          failure_mode: fm.failure_mode,
          category: fm.category || "",
          equipment_type_ids: fm.equipment_type_ids || [],
        })),
      };

      const response = await api.post(
        "/ai-suggestions/new-failure-modes",
        payload,
        { timeout: 120000 },
      );

      const ss = response.data.suggestions || [];
      setSuggestions(ss);

      const initialDrafts = {};
      ss.forEach((s, idx) => {
        initialDrafts[idx] = {
          selected: true,
          failureMode: s.failure_mode,
          category: s.category,
          severity: s.severity,
          occurrence: s.occurrence,
          detectability: s.detectability,
        };
      });
      setDrafts(initialDrafts);

      if (ss.length === 0) {
        toast.info(
          "No new failure modes suggested — your library already covers the catalog well.",
        );
      } else {
        toast.success(`Found ${ss.length} new failure mode suggestion${ss.length === 1 ? "" : "s"}`);
      }
    } catch (error) {
      console.error("Error fetching new failure mode suggestions:", error);
      toast.error(
        error.response?.data?.detail ||
          "Failed to get AI suggestions. Please try again.",
      );
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
      setLoadingStatus("");
    }
  };

  const toggleSelected = (idx) => {
    setDrafts((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], selected: !prev[idx].selected },
    }));
  };

  const setDraftField = (idx, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], [field]: value },
    }));
  };

  const clampScore = (v) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return 1;
    return Math.max(1, Math.min(10, n));
  };

  const handleCreate = async () => {
    const toCreate = [];
    Object.entries(drafts).forEach(([k, d]) => {
      if (!d.selected) return;
      const idx = parseInt(k, 10);
      const original = suggestions[idx];
      if (!original) return;
      toCreate.push({ original, draft: d });
    });

    if (toCreate.length === 0) {
      toast.warning("No suggestions selected");
      return;
    }

    const existingNames = new Set(
      failureModes.map((fm) => (fm.failure_mode || "").toLowerCase()),
    );

    setCreating(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const { original, draft } of toCreate) {
        if (existingNames.has((draft.failureMode || "").toLowerCase())) {
          toast.warning(`Skipped duplicate: "${draft.failureMode}"`);
          failed += 1;
          continue;
        }
        try {
          const payload = {
            failure_mode: draft.failureMode.trim(),
            category: draft.category || "General",
            equipment: original.equipment_type_names?.[0] || draft.category || "General",
            keywords: original.keywords || [],
            severity: clampScore(draft.severity),
            occurrence: clampScore(draft.occurrence),
            detectability: clampScore(draft.detectability),
            recommended_actions: (original.recommended_actions || []).map((a) => ({
              action: a,
              action_type: "PM",
              discipline: "Mechanical",
            })),
            equipment_type_ids: original.equipment_type_ids || [],
            potential_effects: original.potential_effects || [],
            potential_causes: original.potential_causes || [],
            iso14224_mechanism: original.mechanism || "",
            failure_mode_type: "generic",
            source: "ai_reliability_engineer",
          };
          await api.post("/failure-modes", payload);
          ok += 1;
        } catch (e) {
          console.error(`Failed to create FM "${draft.failureMode}"`, e);
          failed += 1;
        }
      }
      if (ok > 0)
        toast.success(`Created ${ok} new failure mode${ok === 1 ? "" : "s"}`);
      if (failed > 0)
        toast.error(`${failed} suggestion${failed === 1 ? "" : "s"} failed`);
      onCreated?.();
      if (failed === 0) onClose();
    } finally {
      setCreating(false);
    }
  };

  const totalSelected = useMemo(
    () => Object.values(drafts).filter((d) => d.selected).length,
    [drafts],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
        data-testid="ai-new-fm-suggestions-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-purple-600" />
            Suggest New Failure Modes
          </DialogTitle>
          <DialogDescription>
            AI acts as a reliability engineer and reviews your equipment-type catalog
            against the existing failure-mode library to propose meaningful gaps to fill
            (ISO 14224-aligned).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg mb-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {equipmentTypes.length}
                </p>
                <p className="text-xs text-slate-500">Equipment types reviewed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {failureModes.length}
                </p>
                <p className="text-xs text-slate-500">Existing failure modes</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">
                  {suggestions.length}
                </p>
                <p className="text-xs text-slate-500">New FMs suggested</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{totalSelected}</p>
                <p className="text-xs text-slate-500">Will be created</p>
              </div>
            </div>

            <Button
              onClick={fetchSuggestions}
              disabled={loading || equipmentTypes.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="ai-new-fm-run-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : suggestions.length > 0 ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Re-analyze
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Get AI Suggestions
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
                {loadingStatus || "Reviewing your catalog as a reliability engineer..."}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                ISO 14224 gap analysis in progress
              </p>
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                Ready for Reliability Review
              </h3>
              <p className="text-sm text-slate-500 max-w-md">
                {equipmentTypes.length > 0
                  ? `Click "Get AI Suggestions" to have an AI reliability engineer review your ${equipmentTypes.length} equipment types and propose missing failure modes.`
                  : "Add equipment types to your catalog first, then come back to discover missing failure modes."}
              </p>
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-3 pr-2 pb-4" data-testid="ai-new-fm-results">
                {suggestions.map((s, idx) => {
                  const draft = drafts[idx] || {};
                  const rpnLive =
                    clampScore(draft.severity) *
                    clampScore(draft.occurrence) *
                    clampScore(draft.detectability);
                  return (
                    <div
                      key={`${s.failure_mode}-${idx}`}
                      className={`border rounded-xl bg-white overflow-hidden transition-colors ${
                        draft.selected
                          ? "border-green-300 bg-green-50/30"
                          : "border-slate-200"
                      }`}
                      data-testid={`ai-new-fm-suggestion-${idx}`}
                    >
                      <div className="flex items-start gap-3 p-4">
                        <button
                          type="button"
                          onClick={() => toggleSelected(idx)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-1 transition-colors ${
                            draft.selected
                              ? "bg-green-500"
                              : "bg-slate-100 border border-slate-300 hover:bg-slate-200"
                          }`}
                          aria-label={draft.selected ? "Deselect" : "Select"}
                        >
                          {draft.selected && <CheckCircle className="w-4 h-4 text-white" />}
                        </button>

                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                            <div className="md:col-span-6">
                              <label className="text-xs font-medium text-slate-500">
                                Failure mode
                              </label>
                              <Input
                                value={draft.failureMode || ""}
                                onChange={(e) =>
                                  setDraftField(idx, "failureMode", e.target.value)
                                }
                                className="h-9 text-sm"
                                disabled={!draft.selected}
                                data-testid={`ai-new-fm-name-${idx}`}
                              />
                            </div>
                            <div className="md:col-span-3">
                              <label className="text-xs font-medium text-slate-500">
                                Category
                              </label>
                              <Input
                                value={draft.category || ""}
                                onChange={(e) =>
                                  setDraftField(idx, "category", e.target.value)
                                }
                                className="h-9 text-sm"
                                disabled={!draft.selected}
                              />
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-xs font-medium text-slate-500">S</label>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                value={draft.severity ?? 5}
                                onChange={(e) =>
                                  setDraftField(idx, "severity", clampScore(e.target.value))
                                }
                                className="h-9 text-sm"
                                disabled={!draft.selected}
                              />
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-xs font-medium text-slate-500">O</label>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                value={draft.occurrence ?? 5}
                                onChange={(e) =>
                                  setDraftField(idx, "occurrence", clampScore(e.target.value))
                                }
                                className="h-9 text-sm"
                                disabled={!draft.selected}
                              />
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-xs font-medium text-slate-500">D</label>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                value={draft.detectability ?? 5}
                                onChange={(e) =>
                                  setDraftField(idx, "detectability", clampScore(e.target.value))
                                }
                                className="h-9 text-sm"
                                disabled={!draft.selected}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`text-xs ${getRpnColor(rpnLive)}`}>
                              RPN {rpnLive}
                            </Badge>
                            {s.mechanism && (
                              <Badge variant="outline" className="text-xs">
                                {s.mechanism}
                              </Badge>
                            )}
                            {s.equipment_type_names.slice(0, 4).map((nm, i) => (
                              <Badge
                                key={`${idx}-et-${i}`}
                                className="text-xs bg-blue-100 text-blue-700"
                              >
                                {nm}
                              </Badge>
                            ))}
                            {s.equipment_type_names.length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{s.equipment_type_names.length - 4}
                              </Badge>
                            )}
                          </div>

                          {s.rationale && (
                            <p className="text-sm text-slate-600">
                              <span className="font-medium text-slate-700">Why: </span>
                              {s.rationale}
                            </p>
                          )}

                          {(s.potential_effects?.length > 0 ||
                            s.potential_causes?.length > 0 ||
                            s.recommended_actions?.length > 0) && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              {s.potential_effects?.length > 0 && (
                                <div>
                                  <p className="font-semibold text-slate-700 mb-1">
                                    Effects
                                  </p>
                                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                    {s.potential_effects.slice(0, 4).map((e, i) => (
                                      <li key={`eff-${idx}-${i}`}>{e}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {s.potential_causes?.length > 0 && (
                                <div>
                                  <p className="font-semibold text-slate-700 mb-1">
                                    Causes
                                  </p>
                                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                    {s.potential_causes.slice(0, 4).map((c, i) => (
                                      <li key={`cau-${idx}-${i}`}>{c}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {s.recommended_actions?.length > 0 && (
                                <div>
                                  <p className="font-semibold text-slate-700 mb-1">
                                    Recommended actions
                                  </p>
                                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                    {s.recommended_actions.slice(0, 4).map((a, i) => (
                                      <li key={`act-${idx}-${i}`}>{a}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="border-t pt-4 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-slate-500">
              {totalSelected > 0 && (
                <>
                  <span className="font-medium text-green-600">{totalSelected}</span>{" "}
                  new failure mode{totalSelected === 1 ? "" : "s"} will be added to the
                  library
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={totalSelected === 0 || creating}
                className="bg-green-600 hover:bg-green-700"
                data-testid="ai-new-fm-create-btn"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create ({totalSelected})
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AINewFailureModeSuggestions;
