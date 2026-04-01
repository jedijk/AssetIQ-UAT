/**
 * SubmissionRow Component
 * Displays a single form submission with expandable details
 */
import { useState } from "react";
import { ChevronRight, ChevronDown, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { ThresholdBadge } from "./FieldPreview";

export const SubmissionRow = ({ submission }) => {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden" data-testid={`submission-${submission.id}`}>
      <div 
        className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <div>
            <p className="font-medium text-slate-900">{submission.template_name || "Form Submission"}</p>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {formatDate(submission.submitted_at || submission.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {submission.has_warnings && (
            <Badge variant="warning" className="text-xs">Warnings</Badge>
          )}
          {submission.has_critical && (
            <Badge variant="destructive" className="text-xs">Critical</Badge>
          )}
          <Badge variant={submission.status === "completed" ? "success" : "secondary"} className="text-xs">
            {submission.status === "completed" ? (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</>
            ) : (
              submission.status || "Pending"
            )}
          </Badge>
        </div>
      </div>

      {expanded && (
        <div className="p-3 bg-slate-50 border-t border-slate-200">
          <div className="space-y-2">
            {submission.responses?.map((response, idx) => (
              <div key={idx} className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-600">{response.field_label || response.field_id}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {typeof response.value === 'object' 
                      ? JSON.stringify(response.value) 
                      : String(response.value ?? "—")}
                  </span>
                  {response.threshold_status && response.threshold_status !== "normal" && (
                    <ThresholdBadge status={response.threshold_status} />
                  )}
                </div>
              </div>
            ))}
            {(!submission.responses || submission.responses.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-2">No response data available</p>
            )}
          </div>
          
          {submission.submitted_by_name && (
            <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
              Submitted by: {submission.submitted_by_name}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SubmissionRow;
