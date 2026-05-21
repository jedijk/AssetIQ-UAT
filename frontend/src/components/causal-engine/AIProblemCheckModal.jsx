import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { 
  Sparkles, Loader2, CheckCircle, Edit3, X, AlertTriangle, 
  Lightbulb, HelpCircle, AlertCircle, Target, MessageSquare
} from "lucide-react";
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
 * Defensive Reasoning Check Modal Component
 * 
 * Analyzes problem statements for:
 * - Defensive reasoning (blaming, assumptions, minimization)
 * - Solution reasoning (jumping to fixes)
 * - Vague language
 * 
 * Provides detailed guidance and suggestions for improvement.
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
      console.error("Defensive Reasoning Check failed:", error);
      toast.error("Failed to analyze problem statement. Please try again.");
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
      toast.success("Problem statement updated");
    }
  };

  const handleReject = () => {
    onOpenChange(false);
    toast.info("Original problem statement kept");
  };

  const hasIssues = aiResult?.has_issues;
  const analysis = aiResult?.analysis || {};
  const defensiveItems = analysis.defensive_reasoning || [];
  const overallScore = analysis.overall_score;
  const scoreExplanation = analysis.score_explanation;
  const guidance = aiResult?.guidance || [];

  // Get score badge color
  const getScoreBadge = () => {
    switch (overallScore) {
      case "RED":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">
            <AlertCircle className="w-3 h-3 mr-1" />
            Needs Revision
          </Badge>
        );
      case "YELLOW":
        return (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Could Improve
          </Badge>
        );
      case "GREEN":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Good Statement
          </Badge>
        );
      default:
        return hasIssues ? (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Issues Found
          </Badge>
        ) : (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Looks Good
          </Badge>
        );
    }
  };

  // Get pattern icon
  const getPatternIcon = (pattern) => {
    switch (pattern) {
      case "BLAME":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "ASSUMPTION":
        return <HelpCircle className="w-4 h-4 text-orange-500" />;
      case "SOLUTION":
        return <Lightbulb className="w-4 h-4 text-amber-500" />;
      case "MINIMIZATION":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "VAGUE":
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-500" />;
    }
  };

  // Get pattern label
  const getPatternLabel = (pattern) => {
    switch (pattern) {
      case "BLAME":
        return "Blame & Attribution";
      case "ASSUMPTION":
        return "Assumption Protection";
      case "SOLUTION":
        return "Premature Solution";
      case "MINIMIZATION":
        return "Minimization";
      case "VAGUE":
        return "Vague Language";
      default:
        return pattern || "Issue";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Defensive Reasoning Check
          </DialogTitle>
          <DialogDescription>
            Analyzing your problem statement for patterns that block effective root cause investigation.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Loading State */}
          {analyzeMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-purple-600 mb-4" />
              <p className="text-sm text-slate-600 font-medium">Analyzing problem statement...</p>
              <p className="text-xs text-slate-400 mt-1">Checking for defensive reasoning patterns</p>
            </div>
          )}

          {/* Empty State */}
          {!analyzeMutation.isPending && !currentDescription && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-sm text-slate-600 font-medium">No problem statement to analyze</p>
              <p className="text-xs text-slate-400 mt-1">Enter a problem statement first, then run the check</p>
            </div>
          )}

          {/* Results */}
          {aiResult && (
            <>
              {/* Score Summary */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border">
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-1">Overall Assessment</div>
                  {scoreExplanation && (
                    <p className="text-xs text-slate-500">{scoreExplanation}</p>
                  )}
                </div>
                {getScoreBadge()}
              </div>

              {/* Original Problem Statement */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Your Problem Statement</label>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600">
                  {currentDescription || <span className="italic text-slate-400">Empty</span>}
                </div>
              </div>

              {/* Defensive Reasoning Issues - Detailed */}
              {defensiveItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <label className="text-sm font-medium text-slate-700">
                      Issues Found ({defensiveItems.length})
                    </label>
                  </div>
                  
                  <div className="space-y-3">
                    {defensiveItems.map((item, i) => (
                      <div key={i} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        {/* Pattern Header */}
                        <div className="flex items-center gap-2 mb-2">
                          {getPatternIcon(item.pattern)}
                          <span className="text-sm font-semibold text-red-800">
                            {getPatternLabel(item.pattern)}
                          </span>
                        </div>
                        
                        {/* Quote */}
                        {item.quote && (
                          <div className="mb-2 pl-3 border-l-2 border-red-300">
                            <p className="text-sm text-red-700 italic">"{item.quote}"</p>
                          </div>
                        )}
                        
                        {/* Why Problematic */}
                        {item.why_problematic && (
                          <div className="mb-2">
                            <span className="text-xs font-medium text-red-600 uppercase tracking-wide">Why this is problematic:</span>
                            <p className="text-sm text-red-700 mt-1">{item.why_problematic}</p>
                          </div>
                        )}
                        
                        {/* Suggestion */}
                        {item.suggestion && (
                          <div className="mt-2 p-2 bg-white/50 rounded">
                            <span className="text-xs font-medium text-green-600 uppercase tracking-wide">Suggestion:</span>
                            <p className="text-sm text-green-700 mt-1">{item.suggestion}</p>
                          </div>
                        )}

                        {/* Fallback for string items (old format) */}
                        {typeof item === 'string' && (
                          <p className="text-sm text-red-700">{item}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Guidance Section */}
              {guidance.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-3">
                    <Target className="w-4 h-4" />
                    Guidance: Questions to Consider
                  </div>
                  <ul className="space-y-2">
                    {guidance.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-blue-700">
                        <span className="text-blue-400 mt-1">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Changes Made */}
              {aiResult.changes_made?.length > 0 && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-700 font-medium text-sm mb-2">
                    <Edit3 className="w-4 h-4" />
                    Changes Made to Improve
                  </div>
                  <ul className="space-y-1">
                    {aiResult.changes_made.map((change, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-purple-700">
                        <span className="text-purple-400 mt-1">•</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Refined Problem Statement */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">
                    {isEditing ? "Edit Suggested Statement" : "Suggested Problem Statement"}
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
                    placeholder="Edit the suggested problem statement..."
                  />
                ) : (
                  <div className={`p-3 rounded-lg border text-sm ${
                    hasIssues 
                      ? "bg-green-50 border-green-200 text-green-800" 
                      : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}>
                    {aiResult.refined_description || <span className="italic text-slate-400">No changes suggested</span>}
                  </div>
                )}
              </div>

              {/* What Makes a Good Problem Statement - Tip */}
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
                <div className="text-xs font-medium text-slate-600 mb-1">💡 Tip: A Good Problem Statement...</div>
                <ul className="text-xs text-slate-500 space-y-0.5">
                  <li>• States only observable facts (what you saw, heard, measured)</li>
                  <li>• Is specific about what, where, and when</li>
                  <li>• Is neutral - no blame, no emotion, no assumptions about cause</li>
                  <li>• Describes the deviation from expected/normal</li>
                  <li>• Opens inquiry rather than closing it</li>
                </ul>
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
                {isEditing ? "Apply Edited" : "Accept Suggestion"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
