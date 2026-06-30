import { useCallback, useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Download, Loader2, RefreshCw, FileText } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "sonner";
import { failureModesAPI } from "../../lib/apis/failureModes";
import { useLanguage } from "../../contexts/LanguageContext";
import FailureModeInformationCard from "./FailureModeInformationCard";

export default function FailureModeInformationCardDialog({
  open,
  onClose,
  failureModeId,
  failureModeName,
  t,
}) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const cardRef = useRef(null);

  const fetchCard = useCallback(async (force = false) => {
    if (!failureModeId) return;
    setError(null);
    if (force) {
      setRegenerating(true);
    } else {
      setLoading(true);
    }
    try {
      const params = { language };
      const data = force
        ? await failureModesAPI.regenerateInformationCard(failureModeId, params)
        : await failureModesAPI.getInformationCard(failureModeId, params);
      setResult(data);
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || "Failed to load information card";
      setError(typeof message === "string" ? message : JSON.stringify(message));
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [failureModeId, language]);

  useEffect(() => {
    if (open && failureModeId) {
      setResult(null);
      fetchCard(false);
    }
  }, [open, failureModeId, fetchCard]);

  const handleDownload = async () => {
    const target = cardRef.current?.querySelector("[data-testid='failure-mode-information-card']");
    if (!target) {
      toast.error(t?.("failureModeInfoCard.downloadError") || "Could not capture card for download");
      return;
    }
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      const safeName = (failureModeName || "failure-mode").replace(/[^\w\-]+/g, "_").slice(0, 80);
      link.download = `${safeName}-information-card.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success(t?.("failureModeInfoCard.downloaded") || "Information card downloaded");
    } catch (err) {
      toast.error(t?.("failureModeInfoCard.downloadError") || "Could not capture card for download");
    }
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            {t?.("failureModeInfoCard.dialogTitle") || "Failure Mode Information Card"}
          </DialogTitle>
          <DialogDescription>
            {failureModeName
              ? t?.("failureModeInfoCard.dialogDescription", { name: failureModeName }) || `Engineering information card for ${failureModeName}`
              : t?.("failureModeInfoCard.dialogDescriptionGeneric") || "Engineering-grade failure mode documentation"}
          </DialogDescription>
        </DialogHeader>

        {result?.reused && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <div className="font-medium">{t?.("failureModeInfoCard.previouslyGenerated") || "Previously Generated"}</div>
            <div>{t?.("failureModeInfoCard.noChangesDetected") || "No failure mode changes detected."}</div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2" ref={cardRef}>
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p>{t?.("failureModeInfoCard.generating") || "Generating information card..."}</p>
            </div>
          )}
          {error && !loading && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {!loading && !error && result?.card && (
            <FailureModeInformationCard card={result.card} t={t} />
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="text-xs text-slate-500">
            {result?.version != null && (
              <span>
                {t?.("failureModeInfoCard.version") || "Version"} {result.version}
                {result.generated_at ? ` · ${new Date(result.generated_at).toLocaleString()}` : ""}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {result?.reused && (
              <Button
                variant="outline"
                onClick={() => fetchCard(true)}
                disabled={regenerating || loading}
              >
                {regenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t?.("failureModeInfoCard.generateNewVersion") || "Generate New Version"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={!result?.card || loading}
            >
              <Download className="w-4 h-4 mr-2" />
              {t?.("failureModeInfoCard.downloadPng") || "Download PNG"}
            </Button>
            <Button onClick={handleClose}>{t?.("common.close") || "Close"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
