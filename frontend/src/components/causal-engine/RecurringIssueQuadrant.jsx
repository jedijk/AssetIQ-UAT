import React, { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { 
  RefreshCcw, Plus, X, ChevronDown, ChevronUp, 
  Link2, Unlink, AlertCircle, History, Loader2,
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { formatDate } from "../../lib/dateUtils";

/**
 * Recurring Issue Quadrant Component
 * 
 * Displays a 4-quadrant IS/IS NOT matrix for comparing
 * the current incident with a previous similar incident.
 * 
 * Only visible when:
 * - is_recurring flag is true, OR
 * - linked_incident_id exists
 */
export default function RecurringIssueQuadrant({
  investigation,
  investigationAPI,
  disabled = false,
}) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [quadrantData, setQuadrantData] = useState({
    current_is: [],
    current_is_not: [],
    past_was: [],
    past_was_not: [],
  });
  const [newItems, setNewItems] = useState({
    current_is: "",
    current_is_not: "",
    past_was: "",
    past_was_not: "",
  });

  const isRecurring = investigation?.is_recurring;
  const linkedIncidentId = investigation?.linked_incident_id;
  const showQuadrant = true; // Always show the recurring issue analysis section
  const hasRecurringData = isRecurring || linkedIncidentId;

  // Fetch linked incident details
  const { data: linkedData } = useQuery({
    queryKey: queryKeys.investigations.linkedIncident(investigation?.id),
    queryFn: () => investigationAPI.getLinkedIncident(investigation?.id),
    enabled: !!investigation?.id && !!linkedIncidentId,
  });

  // Fetch similar incidents for linking
  const { data: similarData, isLoading: loadingSimilar } = useQuery({
    queryKey: queryKeys.investigations.similarIncidents(investigation?.id),
    queryFn: () => investigationAPI.getSimilarIncidents(investigation?.id),
    enabled: !!investigation?.id && isExpanded && !linkedIncidentId,
  });

  const linkedIncident = linkedData?.linked_incident;
  const similarIncidents = similarData?.similar_incidents || [];

  // Initialize quadrant data from investigation
  useEffect(() => {
    if (investigation?.recurring_quadrant) {
      setQuadrantData(investigation.recurring_quadrant);
    }
  }, [investigation?.recurring_quadrant]);

  // Save quadrant data mutation
  const saveQuadrantMutation = useMutation({
    mutationFn: (data) => investigationAPI.updateRecurringQuadrant(investigation?.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(investigation?.id) });
      toast.success("Quadrant data saved");
    },
    onError: () => {
      toast.error("Failed to save quadrant data");
    },
  });

  // Link incident mutation
  const linkMutation = useMutation({
    mutationFn: (linkedId) => investigationAPI.linkIncident(investigation?.id, linkedId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(investigation?.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.linkedIncident(investigation?.id) });
      toast.success("Incident linked successfully");
    },
    onError: () => {
      toast.error("Failed to link incident");
    },
  });

  // Unlink incident mutation
  const unlinkMutation = useMutation({
    mutationFn: () => investigationAPI.unlinkIncident(investigation?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.detail(investigation?.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.investigations.linkedIncident(investigation?.id) });
      setQuadrantData({
        current_is: [],
        current_is_not: [],
        past_was: [],
        past_was_not: [],
      });
      toast.success("Incident unlinked");
    },
    onError: () => {
      toast.error("Failed to unlink incident");
    },
  });

  // Handle adding item to quadrant
  const handleAddItem = useCallback((quadrant) => {
    const value = newItems[quadrant]?.trim();
    if (!value) return;

    const updated = {
      ...quadrantData,
      [quadrant]: [...quadrantData[quadrant], value],
    };
    setQuadrantData(updated);
    setNewItems({ ...newItems, [quadrant]: "" });
    
    // Auto-save
    saveQuadrantMutation.mutate(updated);
  }, [newItems, quadrantData, saveQuadrantMutation]);

  // Handle removing item from quadrant
  const handleRemoveItem = useCallback((quadrant, index) => {
    const updated = {
      ...quadrantData,
      [quadrant]: quadrantData[quadrant].filter((_, i) => i !== index),
    };
    setQuadrantData(updated);
    
    // Auto-save
    saveQuadrantMutation.mutate(updated);
  }, [quadrantData, saveQuadrantMutation]);

  // Quadrant cell component
  const QuadrantCell = ({ title, subtitle, quadrantKey, bgColor, borderColor }) => (
    <div className={`p-3 ${bgColor} ${borderColor} rounded-lg`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-medium text-sm text-slate-800">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
      </div>
      
      {/* Items list */}
      <div className="space-y-1.5 mb-2 min-h-[60px]">
        {quadrantData[quadrantKey]?.map((item, idx) => (
          <div 
            key={idx}
            className="flex items-center justify-between gap-2 px-2 py-1 bg-white/60 rounded text-sm"
          >
            <span className="text-slate-700 flex-1">{item}</span>
            {!disabled && (
              <button
                onClick={() => handleRemoveItem(quadrantKey, idx)}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {quadrantData[quadrantKey]?.length === 0 && (
          <div className="text-xs text-slate-400 italic py-2">
            No items added yet
          </div>
        )}
      </div>

      {/* Add new item */}
      {!disabled && (
        <div className="flex gap-1.5">
          <Input
            value={newItems[quadrantKey]}
            onChange={(e) => setNewItems({ ...newItems, [quadrantKey]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddItem(quadrantKey);
              }
            }}
            placeholder="Add context..."
            className="h-8 text-sm bg-white/70"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleAddItem(quadrantKey)}
            className="h-8 px-2"
            disabled={!newItems[quadrantKey]?.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full p-4 hover:bg-slate-50 transition-colors rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <RefreshCcw className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-left">
                <div className="font-medium text-slate-900 flex items-center gap-2">
                  Recurring Issue Analysis
                  {hasRecurringData && (
                    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">
                      Recurring
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  Compare IS/IS NOT context between incidents
                </div>
              </div>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {/* Helper text */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
              <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                Use this exercise to compare what <strong>IS</strong> and <strong>IS NOT</strong> true 
                between the previous occurrence and the current occurrence. This helps isolate 
                contextual differences and identify what changed or remained the same.
              </div>
            </div>

            {/* Linked Incident Info or Link Selection */}
            {linkedIncident ? (
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-slate-400" />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Linked to: {linkedIncident.case_number}
                    </div>
                    <div className="text-xs text-slate-500">
                      {linkedIncident.title} • {formatDate(linkedIncident.incident_date)}
                    </div>
                  </div>
                </div>
                {!disabled && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => unlinkMutation.mutate()}
                          disabled={unlinkMutation.isPending}
                          className="text-slate-500 hover:text-red-500"
                        >
                          {unlinkMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Unlink className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Unlink incident</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            ) : similarIncidents?.length > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">
                    Similar past incidents found
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    onValueChange={(id) => linkMutation.mutate(id)}
                    disabled={linkMutation.isPending || disabled}
                  >
                    <SelectTrigger className="flex-1 h-9 bg-white">
                      <SelectValue placeholder="Select incident to link..." />
                    </SelectTrigger>
                    <SelectContent>
                      {similarIncidents.map((inc) => (
                        <SelectItem key={inc.id} value={inc.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{inc.case_number}</span>
                            <span className="text-slate-600">{inc.title}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  )}
                </div>
              </div>
            ) : loadingSimilar ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : null}

            {/* Quadrant Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Row 1: Current Incident */}
              <QuadrantCell
                title="CURRENT IS"
                subtitle="Context true now"
                quadrantKey="current_is"
                bgColor="bg-green-50"
                borderColor="border border-green-200"
              />
              <QuadrantCell
                title="CURRENT IS NOT"
                subtitle="Context not true now"
                quadrantKey="current_is_not"
                bgColor="bg-red-50"
                borderColor="border border-red-200"
              />

              {/* Row 2: Past Incident */}
              <QuadrantCell
                title="PAST WAS"
                subtitle="Context true before"
                quadrantKey="past_was"
                bgColor="bg-blue-50"
                borderColor="border border-blue-200"
              />
              <QuadrantCell
                title="PAST WAS NOT"
                subtitle="Context not true before"
                quadrantKey="past_was_not"
                bgColor="bg-slate-50"
                borderColor="border border-slate-200"
              />
            </div>

            {/* Save indicator */}
            {saveQuadrantMutation.isPending && (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
