import React, { useState, useEffect, useMemo } from "react";
import { Play, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Badge } from "../../ui/badge";
import { ScrollArea } from "../../ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { useLanguage } from "../../../contexts/LanguageContext";

export function ApplyStrategyDialog({
  open,
  onClose,
  equipmentTypeId,
  equipmentTypeName,
  affectedEquipment,
  onApply,
  isApplying,
}) {
  const { t } = useLanguage();
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Auto pre-select equipment that already has the strategy applied (currently
  // active coverage). If no equipment has it applied yet (first-time apply for
  // this strategy), fall back to pre-selecting all so the user isn't stuck with
  // an empty initial state.
  useEffect(() => {
    if (open) {
      const list = affectedEquipment || [];
      const appliedIds = list.filter((e) => e.strategy_applied).map((e) => e.id);
      if (appliedIds.length > 0) {
        setSelectedEquipment(appliedIds);
      } else {
        setSelectedEquipment(list.map((e) => e.id));
      }
    }
  }, [open, affectedEquipment]);

  // Deselected equipment objects — those in affectedEquipment but NOT selected.
  // Surfaced in the confirm dialog so the user knows exactly what will be wiped.
  const deselectedEquipment = useMemo(() => {
    const selectedSet = new Set(selectedEquipment);
    return (affectedEquipment || []).filter((e) => !selectedSet.has(e.id));
  }, [affectedEquipment, selectedEquipment]);

  const handleSelectAll = () => {
    if (selectedEquipment.length === affectedEquipment?.length) {
      setSelectedEquipment([]);
    } else {
      setSelectedEquipment(affectedEquipment?.map((e) => e.id) || []);
    }
  };

  // Click handler for "Apply Strategy" button.
  // If the user has deselected any equipment, show a confirmation dialog
  // warning that programs/scheduled tasks for those equipment will be removed.
  const handleApplyClick = () => {
    if (deselectedEquipment.length > 0) {
      setConfirmOpen(true);
    } else {
      onApply(selectedEquipment);
    }
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    onApply(selectedEquipment);
  };

  const allSelected =
    selectedEquipment.length === affectedEquipment?.length && (affectedEquipment?.length || 0) > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-600" />
              {t("maintenance.applyStrategyDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("maintenance.applyStrategyDialogDescPrefix")}{" "}
              <strong>{equipmentTypeName}</strong>{" "}
              {t("maintenance.applyStrategyDialogDescSuffix")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t("maintenance.selectEquipmentLabel")}</Label>
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                {allSelected ? t("maintenance.deselectAll") : t("maintenance.selectAll")}
              </Button>
            </div>

            <ScrollArea className="h-[300px] border rounded-lg p-2">
              {affectedEquipment?.map((equip) => (
                <div
                  key={equip.id}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                    selectedEquipment.includes(equip.id) ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    if (selectedEquipment.includes(equip.id)) {
                      setSelectedEquipment(selectedEquipment.filter((id) => id !== equip.id));
                    } else {
                      setSelectedEquipment([...selectedEquipment, equip.id]);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedEquipment.includes(equip.id)}
                    onChange={() => {}}
                    className="pointer-events-none"
                  />
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm font-medium">{equip.name}</span>
                    {equip.tag && (
                      <Badge variant="outline" className="text-xs font-mono">
                        {equip.tag}
                      </Badge>
                    )}
                    {equip.strategy_applied && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 ml-auto"
                      >
                        Active
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </ScrollArea>

            <p className="text-sm text-slate-500">
              {selectedEquipment.length} {t("maintenance.equipmentSelectedOf")}{" "}
              {affectedEquipment?.length || 0} {t("maintenance.equipmentSelectedSuffix")}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleApplyClick}
              disabled={selectedEquipment.length === 0 || isApplying}
              data-testid="apply-strategy-confirm-btn"
            >
              {isApplying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {t("maintenance.applyStrategy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog — only shown when user has deselected equipment */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          className="max-w-md z-[160]"
          data-testid="apply-strategy-confirm-dialog"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              Remove maintenance coverage?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  You're about to remove maintenance programs and scheduled
                  tasks from <strong>{deselectedEquipment.length}</strong>{" "}
                  equipment that you unchecked. This action cannot be undone.
                </p>
                <ScrollArea className="max-h-[200px] border rounded-md p-2 bg-amber-50/40">
                  <ul className="space-y-1.5">
                    {deselectedEquipment.map((eq) => (
                      <li
                        key={eq.id}
                        className="flex items-center gap-2 text-xs"
                        data-testid={`deselected-equipment-${eq.id}`}
                      >
                        <span className="font-medium text-slate-700">
                          {eq.name}
                        </span>
                        {eq.tag && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono"
                          >
                            {eq.tag}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
                <p className="text-xs text-slate-500">
                  The remaining{" "}
                  <strong>{selectedEquipment.length}</strong> equipment will
                  have their maintenance programs created or refreshed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="apply-strategy-confirm-cancel">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600"
              data-testid="apply-strategy-confirm-proceed"
            >
              Yes, remove &amp; apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
