import { useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  Brain,
  RefreshCw,
  Plus,
  Lightbulb,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
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

const VALID_DISCIPLINES = [
  "Rotating",
  "Static",
  "Piping",
  "Electrical",
  "Instrumentation",
  "Civil",
  "Operations",
  "Laboratory",
];

const MAPPABLE_LEVELS = new Set([
  "equipment_unit",
  "equipment",
  "subunit",
  "maintainable_item",
]);

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

export function AINewEquipmentTypeSuggestions({
  isOpen,
  onClose,
  nodes = [],
  equipmentTypes = [],
  onCreated,
}) {
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  // Each row: { selected: bool, name: string, id: string, discipline: string }
  const [drafts, setDrafts] = useState({});
  const [creating, setCreating] = useState(false);

  const mappableNodes = useMemo(
    () => nodes.filter((n) => MAPPABLE_LEVELS.has(n.level)),
    [nodes],
  );

  const fetchSuggestions = async () => {
    if (mappableNodes.length === 0) {
      toast.info("No equipment nodes available in the hierarchy to analyze");
      return;
    }

    setLoading(true);
    setSuggestions([]);
    setDrafts({});
    setLoadingStatus(`Scanning ${Math.min(mappableNodes.length, 200)} equipment nodes...`);

    const progressInterval = setInterval(() => {
      const messages = [
        `Grouping equipment by kind...`,
        `Comparing against ${equipmentTypes.length} existing types...`,
        `Filtering out covered equipment...`,
        `Drafting names and disciplines...`,
        `Finalizing recommendations...`,
      ];
      setLoadingStatus(messages[Math.floor(Math.random() * messages.length)]);
    }, 3000);

    try {
      const payload = {
        nodes: mappableNodes.slice(0, 200).map((n) => ({
          id: n.id,
          name: n.name,
          level: n.level,
          tag: n.tag || "",
        })),
        existing_equipment_types: equipmentTypes.slice(0, 400).map((t) => ({
          id: t.id,
          name: t.name,
          discipline: t.discipline || "",
        })),
      };

      const response = await api.post(
        "/ai-suggestions/new-equipment-types",
        payload,
        { timeout: 120000 },
      );

      const ss = response.data.suggestions || [];
      setSuggestions(ss);

      const initialDrafts = {};
      for (const s of ss) {
        initialDrafts[s.suggested_id] = {
          selected: true,
          name: s.suggested_name,
          id: s.suggested_id,
          discipline: s.discipline,
        };
      }
      setDrafts(initialDrafts);

      if (ss.length === 0) {
        toast.info(
          "No new equipment types suggested — your catalog already covers the hierarchy.",
        );
      } else {
        toast.success(`Found ${ss.length} new equipment type suggestion${ss.length === 1 ? "" : "s"}`);
      }
    } catch (error) {
      console.error("Error fetching new equipment type suggestions:", error);
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

  const toggleSelected = (key) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], selected: !prev[key].selected },
    }));
  };

  const setDraftField = (key, field, value) => {
    setDrafts((prev) => {
      const next = { ...prev, [key]: { ...prev[key], [field]: value } };
      // Auto-update id when name changes (only if id wasn't manually edited away from the slug of the old name)
      if (field === "name") {
        const oldSlug = slugify(prev[key].name);
        if (prev[key].id === oldSlug) {
          next[key].id = slugify(value);
        }
      }
      return next;
    });
  };

  const handleCreate = async () => {
    const selected = Object.values(drafts).filter((d) => d.selected);
    if (selected.length === 0) {
      toast.warning("No suggestions selected");
      return;
    }

    // Validate
    const existingIds = new Set(equipmentTypes.map((t) => t.id.toLowerCase()));
    const existingNames = new Set(equipmentTypes.map((t) => t.name.toLowerCase()));
    for (const d of selected) {
      if (!d.name.trim() || !d.id.trim()) {
        toast.error("Each selected type must have a name and id");
        return;
      }
      if (existingIds.has(d.id.toLowerCase())) {
        toast.error(`ID "${d.id}" already exists — please change it`);
        return;
      }
      if (existingNames.has(d.name.toLowerCase())) {
        toast.error(`Name "${d.name}" already exists — please change it`);
        return;
      }
    }

    setCreating(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const d of selected) {
        try {
          await api.post("/equipment-hierarchy/types", {
            id: d.id,
            name: d.name,
            discipline: d.discipline,
            icon: "cog",
            applicable_levels: ["equipment_unit"],
          });
          ok += 1;
        } catch (e) {
          console.error(`Failed to create type ${d.id}`, e);
          failed += 1;
        }
      }
      if (ok > 0)
        toast.success(`Created ${ok} new equipment type${ok === 1 ? "" : "s"}`);
      if (failed > 0)
        toast.error(`${failed} type${failed === 1 ? "" : "s"} failed to create`);
      onCreated?.();
      if (failed === 0) onClose();
    } finally {
      setCreating(false);
    }
  };

  const totalSelected = Object.values(drafts).filter((d) => d.selected).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        data-testid="ai-new-type-suggestions-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-purple-600" />
            Suggest New Equipment Types
          </DialogTitle>
          <DialogDescription>
            AI scans your plant hierarchy for recurring equipment that is not yet in
            the catalog and proposes new types to add.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg mb-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {mappableNodes.length}
                </p>
                <p className="text-xs text-slate-500">Equipment nodes scanned</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">
                  {suggestions.length}
                </p>
                <p className="text-xs text-slate-500">New types suggested</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{totalSelected}</p>
                <p className="text-xs text-slate-500">Will be created</p>
              </div>
            </div>

            <Button
              onClick={fetchSuggestions}
              disabled={loading || mappableNodes.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="ai-new-types-run-btn"
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
                {loadingStatus || "Discovering new equipment kinds..."}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Analyzing {Math.min(mappableNodes.length, 200)} nodes
              </p>
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                Ready to Discover
              </h3>
              <p className="text-sm text-slate-500 max-w-md">
                {mappableNodes.length > 0
                  ? `Click "Get AI Suggestions" to scan ${mappableNodes.length} equipment nodes and propose new types missing from your catalog.`
                  : "Add equipment to your hierarchy first, then come back here to discover missing types."}
              </p>
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <div className="flex-1 overflow-auto min-h-0" data-testid="ai-new-types-results">
              <div className="space-y-3 pr-2 pb-4">
                {suggestions.map((s) => {
                  const draft = drafts[s.suggested_id] || {
                    selected: true,
                    name: s.suggested_name,
                    id: s.suggested_id,
                    discipline: s.discipline,
                  };
                  return (
                    <div
                      key={s.suggested_id}
                      className={`border rounded-xl bg-white overflow-hidden transition-colors ${
                        draft.selected
                          ? "border-green-300 bg-green-50/30"
                          : "border-slate-200"
                      }`}
                      data-testid={`ai-new-type-suggestion-${s.suggested_id}`}
                    >
                      <div className="flex items-start gap-3 p-4">
                        <button
                          type="button"
                          onClick={() => toggleSelected(s.suggested_id)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-1 transition-colors ${
                            draft.selected
                              ? "bg-green-500"
                              : "bg-slate-100 border border-slate-300 hover:bg-slate-200"
                          }`}
                          data-testid={`ai-new-type-toggle-${s.suggested_id}`}
                          aria-label={draft.selected ? "Deselect" : "Select"}
                        >
                          {draft.selected && <CheckCircle className="w-4 h-4 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                            <div className="md:col-span-5">
                              <label className="text-xs font-medium text-slate-500">Name</label>
                              <Input
                                value={draft.name}
                                onChange={(e) =>
                                  setDraftField(s.suggested_id, "name", e.target.value)
                                }
                                className="h-9 text-sm"
                                disabled={!draft.selected}
                                data-testid={`ai-new-type-name-${s.suggested_id}`}
                              />
                            </div>
                            <div className="md:col-span-4">
                              <label className="text-xs font-medium text-slate-500">ID</label>
                              <Input
                                value={draft.id}
                                onChange={(e) =>
                                  setDraftField(s.suggested_id, "id", slugify(e.target.value))
                                }
                                className="h-9 text-sm font-mono"
                                disabled={!draft.selected}
                                data-testid={`ai-new-type-id-${s.suggested_id}`}
                              />
                            </div>
                            <div className="md:col-span-3">
                              <label className="text-xs font-medium text-slate-500">Discipline</label>
                              <Select
                                value={draft.discipline}
                                onValueChange={(v) =>
                                  setDraftField(s.suggested_id, "discipline", v)
                                }
                                disabled={!draft.selected}
                              >
                                <SelectTrigger
                                  className="h-9 text-sm"
                                  data-testid={`ai-new-type-discipline-${s.suggested_id}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {VALID_DISCIPLINES.map((d) => (
                                    <SelectItem key={d} value={d}>
                                      {d}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <p className="text-sm text-slate-600">
                            <span className="font-medium text-slate-700">Why: </span>
                            {s.rationale}
                          </p>

                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="text-xs bg-purple-100 text-purple-700">
                              {s.node_count} node{s.node_count === 1 ? "" : "s"} in hierarchy
                            </Badge>
                            {s.example_node_names.slice(0, 4).map((nm, i) => (
                              <Badge
                                key={`${s.suggested_id}-ex-${i}`}
                                variant="outline"
                                className="text-xs"
                              >
                                {nm}
                              </Badge>
                            ))}
                            {s.example_node_names.length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{s.example_node_names.length - 4} more
                              </Badge>
                            )}
                          </div>
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
              {totalSelected > 0 && (
                <>
                  <span className="font-medium text-green-600">{totalSelected}</span>{" "}
                  new equipment type{totalSelected === 1 ? "" : "s"} will be added to
                  your catalog
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
                data-testid="ai-new-types-create-btn"
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

export default AINewEquipmentTypeSuggestions;
