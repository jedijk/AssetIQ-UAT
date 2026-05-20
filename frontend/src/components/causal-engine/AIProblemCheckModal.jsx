import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, CheckCircle, Edit3, X, AlertTriangle, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";

/**
 * AI Problem Check Modal Component
 * 
 * Analyzes investigation descriptions for:
 * - Defensive reasoning (blaming, rationalizing)
 * - Solution reasoning (jumping to fixes)
 * - Problem clarity (factual, neutral, focused)
 */
export default function AIProblemCheckModal({
  open,
  onOpenChange,
  investigationId,
  currentDescription,
  onAccept,
  investigationAPI,
}) {
  const [aiResult, setAiResult] = useState(null);
  const [editedDescription, setEditedDescription] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Mutation for AI analysis
  const analyzeMutation = useMutation({
    mutationFn: () => investigationAPI.aiProblemCheck(investigationId, currentDescription),
    onSuccess: (data) => {
      setAiResult(data);
      setEditedDescription(data.refined_description);
    },
    onError: (error) => {
      console.error("AI Problem Check failed:", error);
      toast.error("Failed to analyze description. Please try again.");
    },
  });

  // Start analysis when modal opens
  React.useEffect(() => {
    if (open && currentDescription && !aiResult) {
      analyzeMutation.mutate();
    }
  }, [open, currentDescription]);

  // Reset state when modal closes
  React.useEffect(() => {
    if (!open) {
      setAiResult(null);
      setEditedDescription("");
      setIsEditing(false);
    }
  }, [open]);

  const handleAccept = () => {
    const descriptionToUse = isEditing ? editedDescription : aiResult?.refined_description;
    if (descriptionToUse) {
      onAccept(descriptionToUse);
      onOpenChange(false);
      toast.success("Description updated with AI suggestion");
    }
  };

  const handleReject = () => {
    onOpenChange(false);
    toast.info("Original description kept");
  };

  const hasIssues = aiResult?.has_issues;
  const analysis = aiResult?.analysis || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Problem Check
          </DialogTitle>
          <DialogDescription>
            Analyzing your description for defensive reasoning, premature solutions, and clarity issues.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Loading State */}
          {analyzeMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600 mb-4" />
              <p className="text-sm text-slate-600">Analyzing your description...</p>
            </div>
          )}

          {/* Results */}
          {aiResult && (
            <>
              {/* Original Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Original Description</label>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600">
                  {currentDescription}
                </div>
              </div>

              {/* Analysis Summary */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700">Analysis</label>
                  {hasIssues ? (
                    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Issues Found
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Looks Good
                    </Badge>
                  )}
                </div>

                {/* Defensive Reasoning */}
                {analysis.defensive_reasoning?.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      Defensive Reasoning Detected
                    </div>
                    <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
                      {analysis.defensive_reasoning.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Solution Reasoning */}
                {analysis.solution_reasoning?.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-2">
                      <Lightbulb className="w-4 h-4" />
                      Solution Reasoning Detected
                    </div>
                    <ul className="text-sm text-amber-600 space-y-1 list-disc list-inside">
                      {analysis.solution_reasoning.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Clarity Issues */}
                {analysis.clarity_issues?.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-2">
                      <Edit3 className="w-4 h-4" />
                      Clarity Issues
                    </div>
                    <ul className="text-sm text-blue-600 space-y-1 list-disc list-inside">
                      {analysis.clarity_issues.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Changes Made */}
                {aiResult.changes_made?.length > 0 && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="text-purple-700 font-medium text-sm mb-2">
                      Changes Made
                    </div>
                    <ul className="text-sm text-purple-600 space-y-1 list-disc list-inside">
                      {aiResult.changes_made.map((change, i) => (
                        <li key={i}>{change}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Refined Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">
                    {isEditing ? "Edit Suggestion" : "AI Suggestion"}
                  </label>
                  {!isEditing && hasIssues && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="text-slate-500 hover:text-slate-700 h-7"
                    >
                      <Edit3 className="w-3 h-3 mr-1" />
                      Edit First
                    </Button>
                  )}
                </div>
                
                {isEditing ? (
                  <Textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="min-h-[100px]"
                    placeholder="Edit the suggested description..."
                  />
                ) : (
                  <div className={`p-3 rounded-lg border text-sm ${
                    hasIssues 
                      ? "bg-green-50 border-green-200 text-green-800" 
                      : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}>
                    {aiResult.refined_description}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {aiResult && (
            <>
              <Button variant="outline" onClick={handleReject}>
                <X className="w-4 h-4 mr-1" />
                Keep Original
              </Button>
              {isEditing && (
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  className="text-slate-600"
                >
                  Cancel Edit
                </Button>
              )}
              <Button 
                onClick={handleAccept}
                className="bg-purple-600 hover:bg-purple-700"
                disabled={!aiResult.refined_description && !editedDescription}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {isEditing ? "Apply Edited" : "Accept & Inject"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
