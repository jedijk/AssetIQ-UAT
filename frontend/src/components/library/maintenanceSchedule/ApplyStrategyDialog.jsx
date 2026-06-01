import React, { useState } from "react";
import { Play, Loader2 } from "lucide-react";
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

  const handleSelectAll = () => {
    if (selectedEquipment.length === affectedEquipment?.length) {
      setSelectedEquipment([]);
    } else {
      setSelectedEquipment(affectedEquipment?.map((e) => e.id) || []);
    }
  };

  const handleApply = () => {
    onApply(selectedEquipment);
  };

  const allSelected =
    selectedEquipment.length === affectedEquipment?.length && (affectedEquipment?.length || 0) > 0;

  return (
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
                <div className="flex-1">
                  <span className="text-sm font-medium">{equip.name}</span>
                  {equip.tag && (
                    <Badge variant="outline" className="ml-2 text-xs font-mono">
                      {equip.tag}
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
          <Button onClick={handleApply} disabled={selectedEquipment.length === 0 || isApplying}>
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
  );
}
