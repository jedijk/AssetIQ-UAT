import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { sparePartsAPI } from "../../lib/apis/spareParts";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const STATUS_STYLES = {
  ok: "text-green-700 bg-green-50",
  warning: "text-amber-700 bg-amber-50",
  error: "text-red-700 bg-red-50",
};

export default function SparePartsImportDialog({ open, onOpenChange }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [step, setStep] = useState("upload");
  const [validation, setValidation] = useState(null);
  const [fileName, setFileName] = useState("");

  const validateMutation = useMutation({
    mutationFn: (file) => sparePartsAPI.validateImport(file),
    onSuccess: (data) => {
      if (data.parse_errors?.length) {
        toast.error(data.parse_errors.join("; "));
        return;
      }
      setValidation(data);
      setStep("review");
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || t("spareiq.importValidateFailed") || "Validation failed");
    },
  });

  const importMutation = useMutation({
    mutationFn: () => sparePartsAPI.executeImport(validation?.rows || []),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["spare-parts"] });
      toast.success(
        t("spareiq.importComplete", {
          created: result.created,
          updated: result.updated,
        }) || `Import complete: ${result.created} created, ${result.updated} updated`
      );
      handleClose();
    },
    onError: () => toast.error(t("spareiq.importFailed") || "Import failed"),
  });

  const handleClose = () => {
    setStep("upload");
    setValidation(null);
    setFileName("");
    onOpenChange(false);
  };

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    validateMutation.mutate(file);
  };

  const summary = validation?.summary;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("spareiq.importTitle") || "Import Spare Parts"}</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <ol className="text-sm text-slate-600 list-decimal list-inside space-y-1">
              <li>{t("spareiq.importStep1") || "Download the import template"}</li>
              <li>{t("spareiq.importStep2") || "Fill in equipment, description, and type/model"}</li>
              <li>{t("spareiq.importStep3") || "Upload the completed file"}</li>
            </ol>
            <Button type="button" variant="outline" onClick={() => sparePartsAPI.downloadImportTemplate()}>
              <Download className="w-4 h-4 mr-2" />
              {t("spareiq.downloadTemplate") || "Download template"}
            </Button>
            <div
              className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {validateMutation.isPending ? (
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-amber-600" />
              ) : (
                <>
                  <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm text-slate-600">{t("spareiq.uploadExcel") || "Click to upload Excel file"}</p>
                  {fileName && <p className="text-xs text-slate-500 mt-2">{fileName}</p>}
                </>
              )}
            </div>
          </div>
        )}

        {step === "review" && validation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded border p-2"><span className="text-slate-500 block">{t("spareiq.importTotal") || "Rows"}</span><strong>{summary?.total ?? 0}</strong></div>
              <div className="rounded border p-2"><span className="text-slate-500 block">{t("spareiq.importOk") || "Ready"}</span><strong>{summary?.importable ?? 0}</strong></div>
              <div className="rounded border p-2"><span className="text-slate-500 block">{t("spareiq.importWarnings") || "Warnings"}</span><strong>{summary?.warnings ?? 0}</strong></div>
              <div className="rounded border p-2"><span className="text-slate-500 block">{t("spareiq.importErrors") || "Errors"}</span><strong>{summary?.errors ?? 0}</strong></div>
            </div>
            <div className="rounded border overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">{t("spareiq.equipment") || "Equipment"}</th>
                    <th className="px-2 py-2 text-left">{t("spareiq.description") || "Description"}</th>
                    <th className="px-2 py-2 text-left">{t("spareiq.typeModel") || "Type"}</th>
                    <th className="px-2 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(validation.rows || []).map((row) => (
                    <tr key={row.row_number} className="border-t">
                      <td className="px-2 py-1.5">{row.row_number}</td>
                      <td className="px-2 py-1.5">{row.equipment_name || row.equipment}</td>
                      <td className="px-2 py-1.5">{row.description}</td>
                      <td className="px-2 py-1.5">{row.type_model}</td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded ${STATUS_STYLES[row.status] || ""}`}>{row.status}</span>
                        {(row.messages || []).length > 0 && (
                          <div className="text-slate-500 mt-0.5">{row.messages.join("; ")}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("upload")}>
                {t("common.back") || "Back"}
              </Button>
              <Button
                type="button"
                disabled={!summary?.importable || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {t("spareiq.runImport") || "Import"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
