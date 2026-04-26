/**
 * SubmissionRow Component
 * Displays a single form submission with expandable details
 */
import { useState } from "react";
import { ChevronRight, ChevronDown, Clock, CheckCircle2, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ThresholdBadge } from "./FieldPreview";
import { formatDateTime } from "../../lib/dateUtils";
import { formAPI } from "./formAPI";

export const SubmissionRow = ({ submission, labelConfig: labelConfigProp }) => {
  const [expanded, setExpanded] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [labelConfig, setLabelConfig] = useState(
    labelConfigProp !== undefined ? labelConfigProp : undefined
  );

  // Only show the print icon when the form template explicitly has label
  // printing enabled and a template selected. This prevents misleading users
  // and avoids "no label template configured" toasts on every click.
  const labelEnabled = !!(labelConfigProp?.enabled && labelConfigProp?.label_template_id);

  const ensureConfig = async () => {
    if (labelConfig !== undefined) return labelConfig;
    try {
      const tpl = await formAPI.getTemplate(submission.template_id || submission.form_template_id);
      const cfg = tpl?.label_print_config || null;
      setLabelConfig(cfg);
      return cfg;
    } catch (_e) {
      setLabelConfig(null);
      return null;
    }
  };

  const handlePrint = async (e) => {
    e.stopPropagation();
    // IMPORTANT: open the new window SYNCHRONOUSLY within the click event so
    // iOS Safari doesn't block it. We fill it with HTML once the fetch returns.
    let preOpened = null;
    try {
      const { openPrintWindow, isMobileDevice } = await import("../../lib/printLabel");
      if (isMobileDevice()) preOpened = openPrintWindow();
    } catch (_e) { /* ignore */ }

    setPrinting(true);
    try {
      const cfg = await ensureConfig();
      const templateId = submission?.label_template_id || cfg?.label_template_id;
      if (!cfg?.enabled || !templateId) {
        toast.error("This form has no label template configured. Enable it in the form designer.");
        if (preOpened && !preOpened.closed) preOpened.close();
        return;
      }
      const { printLabel } = await import("../../lib/printLabel");
      const res = await printLabel({
        template_id: templateId,
        submission_id: submission.id,
        copies: 1,
      }, {
        win: preOpened,
        filename: `${submission.template_name || "label"}.pdf`,
      });
      if (res.method === "window") toast.success("Label print dialog opened");
      else if (res.mobile) toast.info("Label downloaded — use Share → Print");
      else if (res.method === "download") toast.info("Print blocked — label downloaded.");
      else toast.success("Print dialog opened");
    } catch (err) {
      if (preOpened && !preOpened.closed) preOpened.close();
      toast.error(err.response?.data?.detail || "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return formatDateTime(dateStr);
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
          {labelEnabled && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-slate-500 hover:text-indigo-600"
              title="Reprint label"
              data-testid={`print-label-${submission.id}`}
              onClick={handlePrint}
              disabled={printing}
            >
              {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="p-3 bg-slate-50 border-t border-slate-200">
          <div className="space-y-2">
            {(submission.responses || submission.values || []).map((response, idx) => (
              <div key={idx} className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-600">{response.field_label || response.field_id}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {typeof response.value === 'object' 
                      ? JSON.stringify(response.value) 
                      : String(response.value ?? "—")}
                    {response.unit && <span className="text-slate-400 ml-1">{response.unit}</span>}
                  </span>
                  {response.threshold_status && response.threshold_status !== "normal" && (
                    <ThresholdBadge status={response.threshold_status} />
                  )}
                </div>
              </div>
            ))}
            {((!submission.responses || submission.responses.length === 0) && 
              (!submission.values || submission.values.length === 0)) && (
              <p className="text-sm text-slate-500 text-center py-2">No response data available</p>
            )}
          </div>
          
          {submission.notes && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-sm text-slate-600"><strong>Notes:</strong> {submission.notes}</p>
            </div>
          )}
          
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
