import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";

import { equipmentHierarchyAPI } from "../../lib/apis/equipment";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const EQUIPMENT_LEVELS = new Set(["equipment", "equipment_unit", "tag"]);

export default function SparePartFormDialog({
  open,
  onOpenChange,
  categories = [],
  initialValues = null,
  onSubmit,
  isSubmitting = false,
}) {
  const { t } = useLanguage();
  const [description, setDescription] = useState("");
  const [typeModel, setTypeModel] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [componentPositions, setComponentPositions] = useState({});

  const [equipmentNodes, setEquipmentNodes] = useState([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    equipmentHierarchyAPI.getNodes().then((res) => {
      if (!cancelled) {
        const nodes = Array.isArray(res) ? res : res?.nodes || [];
        setEquipmentNodes(
          nodes.filter((n) => EQUIPMENT_LEVELS.has(n.level) || !n.level)
        );
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initialValues) {
      setDescription(initialValues.description || "");
      setTypeModel(initialValues.type_model || "");
      setManufacturer(initialValues.manufacturer || "");
      setCategoryId(initialValues.category_id || "");
      setNotes(initialValues.notes || "");
      setDocumentUrl(initialValues.document_url || "");
      const links = initialValues.equipment_links || initialValues.linked_equipment || [];
      setSelectedEquipment(links.map((l) => l.equipment_id));
      const positions = {};
      links.forEach((l) => {
        if (l.equipment_id) positions[l.equipment_id] = l.component_position || "";
      });
      setComponentPositions(positions);
    } else {
      setDescription("");
      setTypeModel("");
      setManufacturer("");
      setCategoryId("");
      setNotes("");
      setDocumentUrl("");
      setSelectedEquipment([]);
      setComponentPositions({});
      setEquipmentSearch("");
    }
  }, [open, initialValues]);

  const filteredEquipment = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    if (!q) return equipmentNodes.slice(0, 50);
    return equipmentNodes
      .filter((n) => (n.name || "").toLowerCase().includes(q) || (n.tag || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [equipmentNodes, equipmentSearch]);

  const toggleEquipment = (equipmentId) => {
    setSelectedEquipment((prev) =>
      prev.includes(equipmentId)
        ? prev.filter((id) => id !== equipmentId)
        : [...prev, equipmentId]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      description: description.trim(),
      type_model: typeModel.trim(),
      manufacturer: manufacturer.trim() || null,
      category_id: categoryId || null,
      notes: notes.trim() || null,
      document_url: documentUrl.trim() || null,
      equipment_links: selectedEquipment.map((equipment_id) => ({
        equipment_id,
        component_position: (componentPositions[equipment_id] || "").trim() || null,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initialValues
              ? (t("spareiq.edit") || "Edit Spare Part")
              : (t("spareiq.create") || "Create Spare Part")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sp-description">{t("spareiq.description") || "Description"} *</Label>
            <Input id="sp-description" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-type">{t("spareiq.typeModel") || "Type / Model"} *</Label>
            <Input id="sp-type" value={typeModel} onChange={(e) => setTypeModel(e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sp-mfr">{t("spareiq.manufacturer") || "Manufacturer"}</Label>
              <Input id="sp-mfr" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("spareiq.category") || "Category"}</Label>
              <Select value={categoryId || "__none"} onValueChange={(v) => setCategoryId(v === "__none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("spareiq.selectCategory") || "Select category"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-notes">{t("spareiq.notes") || "Notes"}</Label>
            <Textarea id="sp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-doc-url">{t("spareiq.documentUrl") || "Document URL"}</Label>
            <Input id="sp-doc-url" value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <Label>{t("spareiq.equipment") || "Equipment"} *</Label>
            <Input
              value={equipmentSearch}
              onChange={(e) => setEquipmentSearch(e.target.value)}
              placeholder={t("spareiq.searchEquipment") || "Search equipment..."}
            />
            <div className="max-h-40 overflow-y-auto rounded border border-slate-200 divide-y">
              {filteredEquipment.map((node) => {
                const checked = selectedEquipment.includes(node.id);
                return (
                  <label key={node.id} className="flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleEquipment(node.id)}
                    />
                    <span>
                      <span className="font-medium text-slate-900">{node.name}</span>
                      {node.tag && <span className="text-slate-500 ml-1">({node.tag})</span>}
                      {checked && (
                        <Input
                          className="mt-1 h-8 text-xs"
                          placeholder={t("spareiq.componentPosition") || "Component position"}
                          value={componentPositions[node.id] || ""}
                          onChange={(e) => setComponentPositions((prev) => ({ ...prev, [node.id]: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button type="submit" disabled={isSubmitting || !description.trim() || !typeModel.trim() || selectedEquipment.length === 0}>
              {t("common.save") || "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
