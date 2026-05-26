import { useState } from "react";
import { 
  Sparkles, Loader2, CheckCircle, X, ChevronDown, ChevronRight, 
  AlertTriangle, Brain, Link, RefreshCw, Search, Cog
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { toast } from "sonner";
import api from "../../lib/api";

// Confidence color helper
const getConfidenceColor = (confidence) => {
  if (confidence >= 0.9) return "bg-green-100 text-green-700 border-green-200";
  if (confidence >= 0.75) return "bg-blue-100 text-blue-700 border-blue-200";
  if (confidence >= 0.6) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

// RPN color helper
const getRpnColor = (rpn) => {
  if (rpn >= 200) return "bg-red-100 text-red-700";
  if (rpn >= 125) return "bg-orange-100 text-orange-700";
  if (rpn >= 80) return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
};

export function AIFailureModeSuggestions({
  isOpen,
  onClose,
  equipmentTypes = [],
  failureModes = [],
  onAcceptSuggestions,
  t
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [expandedTypes, setExpandedTypes] = useState({});
  const [selectedMappings, setSelectedMappings] = useState({}); // {equipmentTypeId: Set of fmIds}
  const [accepting, setAccepting] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState("without_fm"); // "without_fm" | "all" | "selected"
  const [selectedTypesForAnalysis, setSelectedTypesForAnalysis] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  
  // Equipment types without failure modes
  const equipmentTypesWithoutFm = equipmentTypes.filter(et => {
    const connectedCount = failureModes.filter(fm => 
      fm.equipment_type_ids?.includes(et.id)
    ).length;
    return connectedCount === 0;
  });
  
  // Get equipment types to analyze based on mode
  const getTypesToAnalyze = () => {
    switch (analyzeMode) {
      case "without_fm":
        return equipmentTypesWithoutFm;
      case "all":
        return equipmentTypes;
      case "selected":
        return equipmentTypes.filter(et => selectedTypesForAnalysis.has(et.id));
      default:
        return equipmentTypesWithoutFm;
    }
  };
  
  // Filter equipment types for selection based on search
  const filteredEquipmentTypes = equipmentTypes.filter(et =>
    !searchQuery || 
    et.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    et.discipline?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Toggle equipment type selection for analysis
  const toggleTypeSelection = (typeId) => {
    setSelectedTypesForAnalysis(prev => {
      const newSet = new Set(prev);
      if (newSet.has(typeId)) {
        newSet.delete(typeId);
      } else {
        newSet.add(typeId);
      }
      return newSet;
    });
  };
  
  // Fetch AI suggestions - processes in batches of 5
  const fetchSuggestions = async () => {
    const typesToAnalyze = getTypesToAnalyze();
    
    if (typesToAnalyze.length === 0) {
      toast.info(analyzeMode === "selected" 
        ? "Please select at least one equipment type to analyze"
        : "No equipment types to analyze");
      return;
    }
    
    setLoading(true);
    setSuggestions([]);
    
    try {
      // Process in batches of 5 for performance
      const batchSize = 5;
      const allSuggestions = [];
      const typeIds = typesToAnalyze.map(et => et.id);
      
      // Only process first batch for now (max 5 types)
      const batch = typeIds.slice(0, batchSize);
      
      const response = await api.post("/ai-suggestions/failure-modes", {
        equipment_type_ids: batch,
        existing_failure_modes: failureModes.slice(0, 100).map(fm => ({
          id: fm.id,
          failure_mode: fm.failure_mode,
          category: fm.category,
          keywords: fm.keywords?.slice(0, 5),
          severity: fm.severity,
          occurrence: fm.occurrence,
          detectability: fm.detectability,
          equipment_type_ids: fm.equipment_type_ids
        }))
      }, {
        timeout: 60000 // 60 second timeout for AI requests
      });
      
      // Filter out failure modes that are already connected to each equipment type
      const filteredSuggestions = (response.data.suggestions || []).map(suggestion => {
        const existingFmIds = failureModes
          .filter(fm => fm.equipment_type_ids?.includes(suggestion.equipment_type_id))
          .map(fm => fm.id);
        
        return {
          ...suggestion,
          suggested_failure_modes: suggestion.suggested_failure_modes.filter(
            fm => !existingFmIds.includes(fm.failure_mode_id)
          )
        };
      }).filter(s => s.suggested_failure_modes.length > 0);
      
      allSuggestions.push(...filteredSuggestions);
      
      setSuggestions(allSuggestions);
      
      // Initialize selected mappings with all suggested failure modes
      const initialMappings = {};
      for (const suggestion of allSuggestions) {
        initialMappings[suggestion.equipment_type_id] = new Set(
          suggestion.suggested_failure_modes.map(fm => fm.failure_mode_id)
        );
      }
      setSelectedMappings(initialMappings);
      
      // Expand all by default
      const expanded = {};
      for (const suggestion of allSuggestions) {
        expanded[suggestion.equipment_type_id] = true;
      }
      setExpandedTypes(expanded);
      
      const total = allSuggestions.reduce((sum, s) => sum + s.suggested_failure_modes.length, 0);
      
      if (typeIds.length > batchSize) {
        toast.success(`Found ${total} suggestions for ${allSuggestions.length} equipment types. (${typeIds.length - batchSize} more types available for next batch)`);
      } else {
        toast.success(`Found ${total} suggestions for ${allSuggestions.length} equipment types`);
      }
    } catch (error) {
      console.error("Error fetching AI suggestions:", error);
      toast.error(error.response?.data?.detail || "Failed to get AI suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  
  // Toggle expansion
  const toggleExpand = (equipmentTypeId) => {
    setExpandedTypes(prev => ({
      ...prev,
      [equipmentTypeId]: !prev[equipmentTypeId]
    }));
  };
  
  // Toggle selection of a failure mode for an equipment type
  const toggleSelection = (equipmentTypeId, fmId) => {
    setSelectedMappings(prev => {
      const current = new Set(prev[equipmentTypeId] || []);
      if (current.has(fmId)) {
        current.delete(fmId);
      } else {
        current.add(fmId);
      }
      return { ...prev, [equipmentTypeId]: current };
    });
  };
  
  // Select all for an equipment type
  const selectAll = (equipmentTypeId, fmIds) => {
    setSelectedMappings(prev => ({
      ...prev,
      [equipmentTypeId]: new Set(fmIds)
    }));
  };
  
  // Deselect all for an equipment type
  const deselectAll = (equipmentTypeId) => {
    setSelectedMappings(prev => ({
      ...prev,
      [equipmentTypeId]: new Set()
    }));
  };
  
  // Accept selected suggestions
  const handleAccept = async () => {
    // Build the mappings to apply
    const mappingsToApply = [];
    
    for (const [equipmentTypeId, fmIdSet] of Object.entries(selectedMappings)) {
      if (fmIdSet.size > 0) {
        mappingsToApply.push({
          equipment_type_id: equipmentTypeId,
          failure_mode_ids: Array.from(fmIdSet)
        });
      }
    }
    
    if (mappingsToApply.length === 0) {
      toast.warning("No suggestions selected to accept");
      return;
    }
    
    setAccepting(true);
    
    try {
      // Apply mappings by updating each failure mode
      for (const mapping of mappingsToApply) {
        for (const fmId of mapping.failure_mode_ids) {
          const fm = failureModes.find(f => f.id === fmId);
          if (fm) {
            const currentIds = fm.equipment_type_ids || [];
            if (!currentIds.includes(mapping.equipment_type_id)) {
              const newIds = [...currentIds, mapping.equipment_type_id];
              await api.put(`/failure-modes/${fmId}`, {
                equipment_type_ids: newIds
              });
            }
          }
        }
      }
      
      const totalMappings = mappingsToApply.reduce((sum, m) => sum + m.failure_mode_ids.length, 0);
      toast.success(`Successfully mapped ${totalMappings} failure modes to ${mappingsToApply.length} equipment types`);
      
      if (onAcceptSuggestions) {
        onAcceptSuggestions(mappingsToApply);
      }
      
      onClose();
    } catch (error) {
      console.error("Error accepting suggestions:", error);
      toast.error("Failed to apply some mappings");
    } finally {
      setAccepting(false);
    }
  };
  
  // Count total selected
  const totalSelected = Object.values(selectedMappings).reduce(
    (sum, set) => sum + set.size, 0
  );
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            AI Failure Mode Suggestions
          </DialogTitle>
          <DialogDescription>
            Use AI to intelligently suggest new failure mode mappings for equipment types. Works for all equipment types - suggests only unmapped failure modes.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Mode Selection */}
          <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
            <span className="text-sm font-medium text-slate-700">Analyze:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setAnalyzeMode("without_fm")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  analyzeMode === "without_fm" 
                    ? "bg-purple-600 text-white" 
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                Without FM ({equipmentTypesWithoutFm.length})
              </button>
              <button
                onClick={() => setAnalyzeMode("all")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  analyzeMode === "all" 
                    ? "bg-purple-600 text-white" 
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                All Types ({equipmentTypes.length})
              </button>
              <button
                onClick={() => setAnalyzeMode("selected")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  analyzeMode === "selected" 
                    ? "bg-purple-600 text-white" 
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                Selected ({selectedTypesForAnalysis.size})
              </button>
            </div>
          </div>
          
          {/* Equipment Type Selection (when mode is "selected") */}
          {analyzeMode === "selected" && (
            <div className="mb-4 border rounded-lg p-3 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search equipment types..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-40">
                <div className="space-y-1">
                  {filteredEquipmentTypes.map(et => {
                    const connectedCount = failureModes.filter(fm => 
                      fm.equipment_type_ids?.includes(et.id)
                    ).length;
                    const isSelected = selectedTypesForAnalysis.has(et.id);
                    
                    return (
                      <div
                        key={et.id}
                        onClick={() => toggleTypeSelection(et.id)}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                          isSelected ? "bg-purple-50 border border-purple-200" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                          isSelected ? "bg-purple-500" : "bg-slate-100 border border-slate-300"
                        }`}>
                          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <Cog className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium flex-1">{et.name}</span>
                        <Badge variant="outline" className="text-xs">{et.discipline}</Badge>
                        <span className="text-xs text-slate-400">{connectedCount} FM</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
          
          {/* Header stats */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg mb-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-slate-900">{getTypesToAnalyze().length}</p>
                <p className="text-xs text-slate-500">Equipment types to analyze</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{suggestions.length}</p>
                <p className="text-xs text-slate-500">Types with suggestions</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{totalSelected}</p>
                <p className="text-xs text-slate-500">Mappings selected</p>
              </div>
            </div>
            
            <Button
              onClick={fetchSuggestions}
              disabled={loading || getTypesToAnalyze().length === 0}
              className="bg-purple-600 hover:bg-purple-700"
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
              <p className="text-slate-600 font-medium">Analyzing equipment types...</p>
              <p className="text-sm text-slate-400 mt-1">This may take a moment</p>
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
                {equipmentTypesWithoutFm.length > 0 
                  ? `Click "Get AI Suggestions" to analyze ${equipmentTypesWithoutFm.length} equipment types and get intelligent failure mode mapping recommendations.`
                  : "All equipment types already have failure modes connected. Great job!"}
              </p>
            </div>
          )}
          
          {/* Suggestions list */}
          {!loading && suggestions.length > 0 && (
            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-4">
                {suggestions.map(suggestion => {
                  const isExpanded = expandedTypes[suggestion.equipment_type_id];
                  const selected = selectedMappings[suggestion.equipment_type_id] || new Set();
                  const allFmIds = suggestion.suggested_failure_modes.map(fm => fm.failure_mode_id);
                  const allSelected = allFmIds.every(id => selected.has(id));
                  
                  return (
                    <div 
                      key={suggestion.equipment_type_id}
                      className="border rounded-xl overflow-hidden bg-white"
                    >
                      {/* Equipment type header */}
                      <div 
                        className="flex items-center gap-3 p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => toggleExpand(suggestion.equipment_type_id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        )}
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-slate-900">
                              {suggestion.equipment_type_name}
                            </h4>
                            <Badge variant="outline" className="text-xs">
                              {suggestion.discipline}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {suggestion.ai_reasoning}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className="text-sm">
                            <span className="font-medium text-green-600">{selected.size}</span>
                            <span className="text-slate-400">/{suggestion.suggested_failure_modes.length}</span>
                          </span>
                          
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => allSelected ? deselectAll(suggestion.equipment_type_id) : selectAll(suggestion.equipment_type_id, allFmIds)}
                              className="text-xs"
                            >
                              {allSelected ? "Deselect All" : "Select All"}
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Failure modes list */}
                      {isExpanded && (
                        <div className="p-4 space-y-2 border-t">
                          {suggestion.suggested_failure_modes.map(fm => {
                            const isSelected = selected.has(fm.failure_mode_id);
                            
                            return (
                              <div
                                key={fm.failure_mode_id}
                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                  isSelected 
                                    ? 'bg-green-50 border-green-200' 
                                    : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                                onClick={() => toggleSelection(suggestion.equipment_type_id, fm.failure_mode_id)}
                              >
                                {/* Checkbox indicator */}
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                  isSelected ? 'bg-green-500' : 'bg-slate-100 border border-slate-300'
                                }`}>
                                  {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                                </div>
                                
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-xs">
                                      {fm.category}
                                    </Badge>
                                    <Badge className={`text-xs ${getConfidenceColor(fm.confidence)}`}>
                                      {Math.round(fm.confidence * 100)}% match
                                    </Badge>
                                    {fm.rpn && (
                                      <Badge className={`text-xs ${getRpnColor(fm.rpn)}`}>
                                        RPN: {fm.rpn}
                                      </Badge>
                                    )}
                                  </div>
                                  <h5 className="font-medium text-slate-900">
                                    {fm.failure_mode_name}
                                  </h5>
                                  <p className="text-sm text-slate-500 mt-1">
                                    {fm.reasoning}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
        
        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-slate-500">
              {totalSelected > 0 && (
                <>
                  <span className="font-medium text-green-600">{totalSelected}</span> failure modes will be mapped
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleAccept}
                disabled={totalSelected === 0 || accepting}
                className="bg-green-600 hover:bg-green-700"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Accept Selected ({totalSelected})
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

export default AIFailureModeSuggestions;
