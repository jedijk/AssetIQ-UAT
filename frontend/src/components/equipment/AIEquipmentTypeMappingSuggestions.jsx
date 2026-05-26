import { useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  Brain,
  RefreshCw,
  Search,
  Cog,
  Layers,
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

const MAPPABLE_LEVELS = new Set([
  "equipment_unit",
  "equipment",
  "subunit",
  "maintainable_item",
]);

const getConfidenceColor = (confidence) => {
  if (confidence >= 0.9) return "bg-green-100 text-green-700 border-green-200";
  if (confidence >= 0.8) return "bg-blue-100 text-blue-700 border-blue-200";
  if (confidence >= 0.7) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

export function AIEquipmentTypeMappingSuggestions({
  isOpen,
  onClose,
  nodes = [],
  equipmentTypes = [],
  onMappingApplied,
}) {
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [chosenType, setChosenType] = useState({}); // {node_id: equipment_type_id}
  const [accepting, setAccepting] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState("without_type"); // without_type | all | selected
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Eligible nodes: equipment_unit / subunit / maintainable_item only
  const eligibleNodes = useMemo(
    () => nodes.filter((n) => MAPPABLE_LEVELS.has(n.level)),
    [nodes],
  );

  const nodesWithoutType = useMemo(
    () => eligibleNodes.filter((n) => !n.equipment_type_id),
    [eligibleNodes],
  );

  const nodeById = useMemo(() => {
    const m = {};
    nodes.forEach((n) => {
      m[n.id] = n;
    });
    return m;
  }, [nodes]);

  const getNodesToAnalyze = () => {
    switch (analyzeMode) {
      case "all":
        return eligibleNodes;
      case "selected":
        return eligibleNodes.filter((n) => selectedNodeIds.has(n.id));
      case "without_type":
      default:
        return nodesWithoutType;
    }
  };

  const filteredEligibleNodes = useMemo(() => {
    if (!searchQuery) return eligibleNodes;
    const q = searchQuery.toLowerCase();
    return eligibleNodes.filter(
      (n) =>
        n.name?.toLowerCase().includes(q) ||
        n.tag?.toLowerCase().includes(q) ||
        n.level?.toLowerCase().includes(q),
    );
  }, [eligibleNodes, searchQuery]);

  const toggleNodeSelect = (id) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchSuggestions = async () => {
    const toAnalyze = getNodesToAnalyze();
    if (toAnalyze.length === 0) {
      toast.info(
        analyzeMode === "selected"
          ? "Please select at least one equipment node"
          : "No equipment nodes to analyze",
      );
      return;
    }

    setLoading(true);
    setSuggestions([]);
    setChosenType({});

    const BATCH_SIZE = 25;
    const batches = [];
    for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
      batches.push(toAnalyze.slice(i, i + BATCH_SIZE));
    }

    const payloadTypes = equipmentTypes.slice(0, 300).map((et) => ({
      id: et.id,
      name: et.name,
      discipline: et.discipline || "",
    }));

    const accumulated = [];
    const chosen = {};

    try {
      for (let b = 0; b < batches.length; b += 1) {
        setLoadingStatus(
          `Batch ${b + 1} of ${batches.length} — analyzing ${batches[b].length} nodes...`,
        );

        const payloadNodes = batches[b].map((n) => ({
          id: n.id,
          name: n.name,
          level: n.level,
          tag: n.tag || "",
          description: (n.description || "").slice(0, 200),
          parent_name: n.parent_id ? nodeById[n.parent_id]?.name || "" : "",
        }));

        const response = await api.post(
          "/ai-suggestions/equipment-type-mappings",
          { nodes: payloadNodes, equipment_types: payloadTypes },
          { timeout: 90000 },
        );

        const batchSuggestions = response.data.suggestions || [];
        for (const s of batchSuggestions) {
          accumulated.push(s);
          if (s.best_match) chosen[s.node_id] = s.best_match.equipment_type_id;
        }
        // Stream results into the UI between batches
        setSuggestions([...accumulated]);
        setChosenType({ ...chosen });
      }

      const totalMatched = accumulated.filter((s) => s.best_match).length;
      toast.success(
        `Found matches for ${totalMatched}/${accumulated.length} equipment nodes`,
      );
    } catch (error) {
      console.error("Error fetching equipment type mapping suggestions:", error);
      const msg =
        error.response?.data?.detail ||
        (error.code === "ECONNABORTED"
          ? "Request timed out. Try fewer nodes or use Selected mode."
          : "Failed to get AI suggestions. Please try again.");
      toast.error(msg);
      // Keep whatever we accumulated so far visible.
      if (accumulated.length > 0) {
        setSuggestions([...accumulated]);
        setChosenType({ ...chosen });
      }
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  };

  const setNodeChoice = (nodeId, etId) => {
    setChosenType((prev) => {
      const next = { ...prev };
      if (!etId) delete next[nodeId];
      else next[nodeId] = etId;
      return next;
    });
  };

  const handleAccept = async () => {
    const entries = Object.entries(chosenType).filter(([, v]) => !!v);
    if (entries.length === 0) {
      toast.warning("No mappings selected");
      return;
    }
    setAccepting(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const [nodeId, etId] of entries) {
        try {
          const et = equipmentTypes.find((t) => t.id === etId);
          const patch = { equipment_type_id: etId };
          if (et?.discipline) patch.discipline = et.discipline;
          await api.patch(`/equipment-hierarchy/nodes/${nodeId}`, patch);
          ok += 1;
        } catch (e) {
          console.error(`Failed to update node ${nodeId}`, e);
          failed += 1;
        }
      }
      if (ok > 0) toast.success(`Mapped ${ok} equipment node${ok === 1 ? "" : "s"} to types`);
      if (failed > 0) toast.error(`${failed} update${failed === 1 ? "" : "s"} failed`);
      onMappingApplied?.();
      onClose();
    } finally {
      setAccepting(false);
    }
  };

  const totalChosen = Object.values(chosenType).filter(Boolean).length;
  const typesToAnalyze = getNodesToAnalyze();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        data-testid="ai-equipment-type-mapping-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            AI Equipment Type Mapping
          </DialogTitle>
          <DialogDescription>
            Let AI suggest the right equipment type for each equipment unit in your
            hierarchy. Review, adjust, then accept.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Mode selector */}
          <div
            className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg"
            data-testid="ai-mapping-mode-selector"
          >
            <span className="text-sm font-medium text-slate-700">Analyze:</span>
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setAnalyzeMode("without_type")}
                data-testid="ai-mapping-mode-without-type"
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  analyzeMode === "without_type"
                    ? "bg-purple-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                Without Type ({nodesWithoutType.length})
              </button>
              <button
                onClick={() => setAnalyzeMode("all")}
                data-testid="ai-mapping-mode-all"
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  analyzeMode === "all"
                    ? "bg-purple-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                All Equipment ({eligibleNodes.length})
              </button>
              <button
                onClick={() => setAnalyzeMode("selected")}
                data-testid="ai-mapping-mode-selected"
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  analyzeMode === "selected"
                    ? "bg-purple-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                Selected ({selectedNodeIds.size})
              </button>
            </div>
          </div>

          {analyzeMode === "selected" && (
            <div className="mb-4 border rounded-lg p-3 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name, tag or level..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="ai-mapping-search-input"
                />
              </div>
              <ScrollArea className="h-40">
                <div className="space-y-1">
                  {filteredEligibleNodes.map((n) => {
                    const isSelected = selectedNodeIds.has(n.id);
                    const eqType = equipmentTypes.find(
                      (t) => t.id === n.equipment_type_id,
                    );
                    return (
                      <div
                        key={n.id}
                        onClick={() => toggleNodeSelect(n.id)}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-purple-50 border border-purple-200"
                            : "hover:bg-slate-50"
                        }`}
                        data-testid={`ai-mapping-node-row-${n.id}`}
                      >
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                            isSelected
                              ? "bg-purple-500"
                              : "bg-slate-100 border border-slate-300"
                          }`}
                        >
                          {isSelected && (
                            <CheckCircle className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <Cog className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium flex-1 truncate">
                          {n.tag ? `${n.tag} — ${n.name}` : n.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {n.level}
                        </Badge>
                        {eqType ? (
                          <Badge className="text-xs bg-blue-100 text-blue-700">
                            {eqType.name}
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-slate-100 text-slate-500">
                            unmapped
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {filteredEligibleNodes.length === 0 && (
                    <p className="text-sm text-slate-400 px-2 py-1">
                      No matching equipment.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Header stats */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg mb-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {typesToAnalyze.length}
                </p>
                <p className="text-xs text-slate-500">Nodes to analyze</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">
                  {suggestions.length}
                </p>
                <p className="text-xs text-slate-500">AI matched</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{totalChosen}</p>
                <p className="text-xs text-slate-500">Mappings selected</p>
              </div>
            </div>

            <Button
              onClick={fetchSuggestions}
              disabled={loading || typesToAnalyze.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="ai-mapping-run-btn"
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

          {/* Loading state */}
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
                {loadingStatus || "Analyzing equipment nodes..."}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Processing {Math.min(typesToAnalyze.length, 80)} nodes against{" "}
                {equipmentTypes.length} types
              </p>
            </div>
          )}

          {/* Empty state */}
          {!loading && suggestions.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                Ready to Analyze
              </h3>
              <p className="text-sm text-slate-500 max-w-md">
                {nodesWithoutType.length > 0
                  ? `Click "Get AI Suggestions" to map ${nodesWithoutType.length} unmapped equipment nodes to their equipment types.`
                  : "All eligible equipment nodes already have a type assigned."}
              </p>
            </div>
          )}

          {/* Suggestion list */}
          {!loading && suggestions.length > 0 && (
            <div className="flex-1 overflow-auto min-h-0" data-testid="ai-mapping-results">
              <div className="space-y-3 pr-2 pb-4">
                {suggestions.map((s) => {
                  const node = nodeById[s.node_id];
                  const chosen = chosenType[s.node_id] || "";
                  const allOptions = [
                    ...(s.best_match ? [s.best_match] : []),
                    ...(s.alternatives || []),
                  ];
                  return (
                    <div
                      key={s.node_id}
                      className="border rounded-xl bg-white overflow-hidden"
                      data-testid={`ai-mapping-suggestion-${s.node_id}`}
                    >
                      <div className="flex items-start gap-3 p-4">
                        <Layers className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-slate-900 truncate">
                              {node?.tag ? `${node.tag} — ` : ""}
                              {s.node_name}
                            </h4>
                            {s.node_level && (
                              <Badge variant="outline" className="text-xs">
                                {s.node_level}
                              </Badge>
                            )}
                            {node?.equipment_type_id && (
                              <Badge className="text-xs bg-slate-100 text-slate-500">
                                Currently:{" "}
                                {equipmentTypes.find(
                                  (t) => t.id === node.equipment_type_id,
                                )?.name || node.equipment_type_id}
                              </Badge>
                            )}
                          </div>

                          {allOptions.length === 0 ? (
                            <p className="text-sm text-amber-600 mt-2">
                              No confident match found. Leave unchanged or assign manually.
                            </p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {allOptions.map((opt, idx) => {
                                const isChosen = chosen === opt.equipment_type_id;
                                return (
                                  <button
                                    key={`${opt.equipment_type_id}-${idx}`}
                                    type="button"
                                    onClick={() =>
                                      setNodeChoice(
                                        s.node_id,
                                        isChosen ? "" : opt.equipment_type_id,
                                      )
                                    }
                                    className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                      isChosen
                                        ? "bg-green-50 border-green-200"
                                        : "bg-white border-slate-200 hover:bg-slate-50"
                                    }`}
                                    data-testid={`ai-mapping-option-${s.node_id}-${opt.equipment_type_id}`}
                                  >
                                    <div
                                      className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                        isChosen
                                          ? "bg-green-500"
                                          : "bg-slate-100 border border-slate-300"
                                      }`}
                                    >
                                      {isChosen && (
                                        <CheckCircle className="w-4 h-4 text-white" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-slate-900">
                                          {opt.equipment_type_name}
                                        </span>
                                        {opt.discipline && (
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            {opt.discipline}
                                          </Badge>
                                        )}
                                        <Badge
                                          className={`text-xs ${getConfidenceColor(
                                            opt.confidence,
                                          )}`}
                                        >
                                          {Math.round(opt.confidence * 100)}% match
                                        </Badge>
                                        {idx === 0 && s.best_match && (
                                          <Badge className="text-xs bg-purple-100 text-purple-700">
                                            Best match
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm text-slate-500 mt-1">
                                        {opt.reasoning}
                                      </p>
                                    </div>
                                  </button>
                                );
                              })}
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
              {totalChosen > 0 && (
                <>
                  <span className="font-medium text-green-600">{totalChosen}</span>{" "}
                  equipment node{totalChosen === 1 ? "" : "s"} will be updated
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleAccept}
                disabled={totalChosen === 0 || accepting}
                className="bg-green-600 hover:bg-green-700"
                data-testid="ai-mapping-accept-btn"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Accept ({totalChosen})
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

export default AIEquipmentTypeMappingSuggestions;
