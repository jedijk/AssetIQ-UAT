/**
 * FieldConfigDialog Component
 * Dialog for creating/editing form fields with type-specific sub-options
 */
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  X,
  List,
  SlidersHorizontal,
  Upload,
  Building2,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Badge } from "../ui/badge";
import { FIELD_TYPES, DEFAULT_FIELD_STATE } from "./formConstants";
import { formAPI } from "./formAPI";
import { useLanguage } from "../../contexts/LanguageContext";

export const FieldConfigDialog = ({ 
  open, 
  onOpenChange, 
  field, 
  onSave, 
  isEditing = false 
}) => {
  const { t } = useLanguage();
  const [fieldData, setFieldData] = useState(DEFAULT_FIELD_STATE);
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState("");
  const [equipmentSearchResults, setEquipmentSearchResults] = useState([]);
  const [searchingEquipment, setSearchingEquipment] = useState(false);

  // Initialize field data when dialog opens or field changes
  useEffect(() => {
    if (open && field) {
      setFieldData({
        ...DEFAULT_FIELD_STATE,
        ...field,
        field_type: field.field_type || field.type || "text",
        thresholds: field.thresholds || {},
        options: field.options || [],
        equipment_levels: field.equipment_levels || ["equipment", "component"],
      });
    } else if (open && !field) {
      setFieldData({
        ...DEFAULT_FIELD_STATE,
        field_type: "text",
      });
    }
  }, [open, field]);

  // Debounced equipment search
  const searchEquipment = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setEquipmentSearchResults([]);
      return;
    }
    
    setSearchingEquipment(true);
    try {
      const data = await formAPI.searchEquipment(query);
      setEquipmentSearchResults(data.results || []);
    } catch (error) {
      console.error("Equipment search error:", error);
      setEquipmentSearchResults([]);
    } finally {
      setSearchingEquipment(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (equipmentSearchQuery) {
        searchEquipment(equipmentSearchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [equipmentSearchQuery, searchEquipment]);

  const handleFieldTypeChange = (newType) => {
    setFieldData(prev => ({
      ...prev,
      field_type: newType,
      // Reset type-specific fields
      unit: newType === "numeric" ? prev.unit : "",
      thresholds: newType === "numeric" ? prev.thresholds : {},
      options: (newType === "dropdown" || newType === "multi_select") ? prev.options : [],
      range_min: newType === "range" ? prev.range_min : null,
      range_max: newType === "range" ? prev.range_max : null,
      range_step: newType === "range" ? prev.range_step : null,
      allowed_extensions: (newType === "file" || newType === "image") ? prev.allowed_extensions : [],
      max_file_size_mb: (newType === "file" || newType === "image") ? prev.max_file_size_mb : null,
    }));
  };

  const handleSave = () => {
    if (!fieldData.label) {
      return;
    }
    
    const fieldId = fieldData.id || fieldData.label.toLowerCase().replace(/\s+/g, "_");
    const savedField = {
      ...fieldData,
      id: fieldId,
      type: fieldData.field_type,
    };
    
    onSave(savedField);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("common.edit") : t("common.add")} {t("forms.label")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Field Label */}
          <div className="space-y-2">
            <Label>{t("forms.label")} *</Label>
            <Input
              value={fieldData.label}
              onChange={(e) => setFieldData(prev => ({ ...prev, label: e.target.value }))}
              placeholder="e.g., Temperature"
              data-testid="field-label-input"
            />
          </div>

          {/* Field Type */}
          <div className="space-y-2">
            <Label>{t("forms.fieldType")}</Label>
            <Select
              value={fieldData.field_type}
              onValueChange={handleFieldTypeChange}
              data-testid="field-type-select"
            >
              <SelectTrigger data-testid="field-type-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value} data-testid={`field-type-${type.value}`}>
                    <div className="flex items-center gap-2">
                      <type.icon className="w-4 h-4" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Numeric field sub-options */}
          {fieldData.field_type === "numeric" && (
            <NumericSubOptions fieldData={fieldData} setFieldData={setFieldData} />
          )}

          {/* Dropdown/Multi-select options */}
          {(fieldData.field_type === "dropdown" || fieldData.field_type === "multi_select") && (
            <DropdownSubOptions fieldData={fieldData} setFieldData={setFieldData} />
          )}

          {/* Range slider sub-options */}
          {fieldData.field_type === "range" && (
            <RangeSubOptions fieldData={fieldData} setFieldData={setFieldData} />
          )}

          {/* File/Image upload sub-options */}
          {(fieldData.field_type === "file" || fieldData.field_type === "image") && (
            <FileSubOptions fieldData={fieldData} setFieldData={setFieldData} />
          )}

          {/* Equipment field sub-options */}
          {fieldData.field_type === "equipment" && (
            <EquipmentSubOptions 
              fieldData={fieldData} 
              setFieldData={setFieldData}
              searchQuery={equipmentSearchQuery}
              setSearchQuery={setEquipmentSearchQuery}
              searchResults={equipmentSearchResults}
              isSearching={searchingEquipment}
            />
          )}

          {/* Required toggle */}
          <div className="flex items-center justify-between pt-2">
            <Label>{t("forms.required")}</Label>
            <Switch
              checked={fieldData.required}
              onCheckedChange={(v) => setFieldData(prev => ({ ...prev, required: v }))}
              data-testid="field-required-toggle"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("common.description")}</Label>
            <Input
              value={fieldData.description || ""}
              onChange={(e) => setFieldData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Help text for this field"
              data-testid="field-description-input"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!fieldData.label} data-testid="save-field-btn">
            {isEditing ? t("common.save") : t("common.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Sub-option components
const NumericSubOptions = ({ fieldData, setFieldData }) => (
  <div className="space-y-4 p-3 bg-slate-50 rounded-lg" data-testid="numeric-suboptions">
    <div className="space-y-2">
      <Label>Unit</Label>
      <Input
        value={fieldData.unit || ""}
        onChange={(e) => setFieldData(prev => ({ ...prev, unit: e.target.value }))}
        placeholder="e.g., °C, bar, mm"
        data-testid="numeric-unit-input"
      />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label className="text-xs text-amber-600">Warning Low</Label>
        <Input
          type="number"
          value={fieldData.thresholds?.warning_low ?? ""}
          onChange={(e) => setFieldData(prev => ({
            ...prev,
            thresholds: { ...prev.thresholds, warning_low: e.target.value ? parseFloat(e.target.value) : null }
          }))}
          data-testid="numeric-warning-low"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-amber-600">Warning High</Label>
        <Input
          type="number"
          value={fieldData.thresholds?.warning_high ?? ""}
          onChange={(e) => setFieldData(prev => ({
            ...prev,
            thresholds: { ...prev.thresholds, warning_high: e.target.value ? parseFloat(e.target.value) : null }
          }))}
          data-testid="numeric-warning-high"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-red-600">Critical Low</Label>
        <Input
          type="number"
          value={fieldData.thresholds?.critical_low ?? ""}
          onChange={(e) => setFieldData(prev => ({
            ...prev,
            thresholds: { ...prev.thresholds, critical_low: e.target.value ? parseFloat(e.target.value) : null }
          }))}
          data-testid="numeric-critical-low"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-red-600">Critical High</Label>
        <Input
          type="number"
          value={fieldData.thresholds?.critical_high ?? ""}
          onChange={(e) => setFieldData(prev => ({
            ...prev,
            thresholds: { ...prev.thresholds, critical_high: e.target.value ? parseFloat(e.target.value) : null }
          }))}
          data-testid="numeric-critical-high"
        />
      </div>
    </div>
  </div>
);

const DropdownSubOptions = ({ fieldData, setFieldData }) => (
  <div className="space-y-3 p-3 bg-blue-50 rounded-lg" data-testid="dropdown-suboptions">
    <Label className="flex items-center gap-2">
      <List className="w-4 h-4" />
      Options
    </Label>
    <div className="space-y-2">
      {(fieldData.options || []).map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={typeof opt === 'string' ? opt : opt.label || ""}
            onChange={(e) => {
              const newOptions = [...(fieldData.options || [])];
              newOptions[idx] = { 
                label: e.target.value, 
                value: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                is_failure: opt.is_failure || false
              };
              setFieldData(prev => ({ ...prev, options: newOptions }));
            }}
            placeholder={`Option ${idx + 1}`}
            className="flex-1"
            data-testid={`option-input-${idx}`}
          />
          <div className="flex items-center gap-1">
            <Switch
              checked={opt.is_failure || false}
              onCheckedChange={(v) => {
                const newOptions = [...(fieldData.options || [])];
                newOptions[idx] = { ...newOptions[idx], is_failure: v };
                setFieldData(prev => ({ ...prev, options: newOptions }));
              }}
              data-testid={`option-failure-${idx}`}
            />
            <span className="text-xs text-slate-500">Failure</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500"
            onClick={() => {
              const newOptions = (fieldData.options || []).filter((_, i) => i !== idx);
              setFieldData(prev => ({ ...prev, options: newOptions }));
            }}
            data-testid={`remove-option-${idx}`}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setFieldData(prev => ({
            ...prev,
            options: [...(prev.options || []), { value: "", label: "", is_failure: false }]
          }));
        }}
        className="w-full"
        data-testid="add-option-btn"
      >
        <Plus className="w-4 h-4 mr-2" /> Add Option
      </Button>
    </div>
  </div>
);

const RangeSubOptions = ({ fieldData, setFieldData }) => (
  <div className="space-y-3 p-3 bg-purple-50 rounded-lg" data-testid="range-suboptions">
    <Label className="flex items-center gap-2">
      <SlidersHorizontal className="w-4 h-4" />
      Range Settings
    </Label>
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-2">
        <Label className="text-xs">Min</Label>
        <Input
          type="number"
          value={fieldData.range_min ?? ""}
          onChange={(e) => setFieldData(prev => ({ ...prev, range_min: e.target.value ? parseFloat(e.target.value) : null }))}
          placeholder="0"
          data-testid="range-min"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Max</Label>
        <Input
          type="number"
          value={fieldData.range_max ?? ""}
          onChange={(e) => setFieldData(prev => ({ ...prev, range_max: e.target.value ? parseFloat(e.target.value) : null }))}
          placeholder="100"
          data-testid="range-max"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Step</Label>
        <Input
          type="number"
          value={fieldData.range_step ?? ""}
          onChange={(e) => setFieldData(prev => ({ ...prev, range_step: e.target.value ? parseFloat(e.target.value) : null }))}
          placeholder="1"
          data-testid="range-step"
        />
      </div>
    </div>
  </div>
);

const FileSubOptions = ({ fieldData, setFieldData }) => (
  <div className="space-y-3 p-3 bg-green-50 rounded-lg" data-testid="file-suboptions">
    <Label className="flex items-center gap-2">
      <Upload className="w-4 h-4" />
      Upload Settings
    </Label>
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">Max File Size (MB)</Label>
        <Input
          type="number"
          value={fieldData.max_file_size_mb ?? ""}
          onChange={(e) => setFieldData(prev => ({ ...prev, max_file_size_mb: e.target.value ? parseFloat(e.target.value) : null }))}
          placeholder="10"
          data-testid="file-max-size"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Allowed Extensions (comma-separated)</Label>
        <Input
          value={(fieldData.allowed_extensions || []).join(", ")}
          onChange={(e) => setFieldData(prev => ({ 
            ...prev, 
            allowed_extensions: e.target.value ? e.target.value.split(",").map(s => s.trim()).filter(Boolean) : []
          }))}
          placeholder={fieldData.field_type === "image" ? "jpg, png, gif" : "pdf, doc, xlsx"}
          data-testid="file-extensions"
        />
      </div>
    </div>
  </div>
);

const EquipmentSubOptions = ({ 
  fieldData, 
  setFieldData, 
  searchQuery, 
  setSearchQuery, 
  searchResults, 
  isSearching 
}) => (
  <div className="space-y-3 p-3 bg-indigo-50 rounded-lg" data-testid="equipment-suboptions">
    <Label className="flex items-center gap-2">
      <Building2 className="w-4 h-4" />
      Equipment Selection Settings
    </Label>
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">Allowed Hierarchy Levels</Label>
        <div className="flex flex-wrap gap-2">
          {["installation", "equipment", "component", "sub_component"].map((level) => (
            <Badge
              key={level}
              variant={(fieldData.equipment_levels || []).includes(level) ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => {
                const levels = fieldData.equipment_levels || [];
                const newLevels = levels.includes(level)
                  ? levels.filter(l => l !== level)
                  : [...levels, level];
                setFieldData(prev => ({ ...prev, equipment_levels: newLevels }));
              }}
              data-testid={`equipment-level-${level}`}
            >
              {level.replace("_", " ")}
            </Badge>
          ))}
        </div>
      </div>
      
      {/* Equipment search preview */}
      <div className="space-y-2">
        <Label className="text-xs">Preview: Search Equipment</Label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search equipment..."
            className="pl-8"
            data-testid="equipment-search-preview"
          />
          {isSearching && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="max-h-32 overflow-y-auto border rounded-lg bg-white">
            {searchResults.slice(0, 5).map((result, idx) => (
              <div key={idx} className="p-2 text-xs border-b last:border-b-0 hover:bg-slate-50">
                <span className="font-medium">{result.name}</span>
                {result.path && (
                  <span className="text-slate-400 ml-2">{result.path}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

export default FieldConfigDialog;
