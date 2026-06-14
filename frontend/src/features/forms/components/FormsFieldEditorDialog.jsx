import {
  Building2,
  ChevronRight,
  List,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { FIELD_TYPES } from "../../../components/forms";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { Switch } from "../../../components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "../../../components/ui/dialog";

export function FormsFieldEditorDialog({
  open,
  onOpenChange,
  editingField,
  newField,
  setNewField,
  t,
  onSave,
  onReset,
  equipmentSearchQuery,
  setEquipmentSearchQuery,
  equipmentSearchResults,
  searchingEquipment,
  onSearchEquipment,
}) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? t("common.edit") : t("common.add")} {t("forms.label")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("forms.label")} *</Label>
              <Input
                value={newField.label}
                onChange={(e) => setNewField(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g., Temperature"
                data-testid="field-label-input"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("forms.fieldType")}</Label>
              <Select
                value={newField.field_type}
                onValueChange={(v) => {
                  // Clear type-specific sub-options when changing field type
                  const clearedField = {
                    ...newField,
                    field_type: v,
                    // Clear numeric-specific
                    unit: v === "numeric" ? newField.unit : "",
                    thresholds: v === "numeric" ? newField.thresholds : {},
                    // Clear dropdown/multi_select-specific
                    options: (v === "dropdown" || v === "multi_select") ? newField.options : [],
                    // Clear range-specific
                    range_min: v === "range" ? newField.range_min : null,
                    range_max: v === "range" ? newField.range_max : null,
                    range_step: v === "range" ? newField.range_step : null,
                    // Clear file/image-specific
                    allowed_extensions: (v === "file" || v === "image") ? newField.allowed_extensions : [],
                    max_file_size_mb: (v === "file" || v === "image") ? newField.max_file_size_mb : null,
                  };
                  setNewField(clearedField);
                }}
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
            {newField.field_type === "numeric" && (
              <div className="space-y-4 p-3 bg-slate-50 rounded-lg" data-testid="numeric-suboptions">
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={newField.unit || ""}
                    onChange={(e) => setNewField(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="e.g., °C, bar, mm"
                    data-testid="numeric-unit-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-amber-600">Warning Low</Label>
                    <Input
                      type="number"
                      value={newField.thresholds?.warning_low ?? ""}
                      onChange={(e) => setNewField(prev => ({
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
                      value={newField.thresholds?.warning_high ?? ""}
                      onChange={(e) => setNewField(prev => ({
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
                      value={newField.thresholds?.critical_low ?? ""}
                      onChange={(e) => setNewField(prev => ({
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
                      value={newField.thresholds?.critical_high ?? ""}
                      onChange={(e) => setNewField(prev => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, critical_high: e.target.value ? parseFloat(e.target.value) : null }
                      }))}
                      data-testid="numeric-critical-high"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Dropdown/Multi-select options */}
            {(newField.field_type === "dropdown" || newField.field_type === "multi_select") && (
              <div className="space-y-3 p-3 bg-blue-50 rounded-lg" data-testid="dropdown-suboptions">
                <Label className="flex items-center gap-2">
                  <List className="w-4 h-4" />
                  Options
                </Label>
                <div className="space-y-2">
                  {(newField.options || []).map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={opt.label}
                        onChange={(e) => {
                          const newOptions = [...(newField.options || [])];
                          newOptions[idx] = { ...newOptions[idx], label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, "_") };
                          setNewField(prev => ({ ...prev, options: newOptions }));
                        }}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1"
                        data-testid={`option-input-${idx}`}
                      />
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={opt.is_failure || false}
                          onCheckedChange={(v) => {
                            const newOptions = [...(newField.options || [])];
                            newOptions[idx] = { ...newOptions[idx], is_failure: v };
                            setNewField(prev => ({ ...prev, options: newOptions }));
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
                          const newOptions = (newField.options || []).filter((_, i) => i !== idx);
                          setNewField(prev => ({ ...prev, options: newOptions }));
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
                      setNewField(prev => ({
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
            )}

            {/* Range slider sub-options */}
            {newField.field_type === "range" && (
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
                      value={newField.range_min ?? ""}
                      onChange={(e) => setNewField(prev => ({ ...prev, range_min: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="0"
                      data-testid="range-min"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Max</Label>
                    <Input
                      type="number"
                      value={newField.range_max ?? ""}
                      onChange={(e) => setNewField(prev => ({ ...prev, range_max: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="100"
                      data-testid="range-max"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Step</Label>
                    <Input
                      type="number"
                      value={newField.range_step ?? ""}
                      onChange={(e) => setNewField(prev => ({ ...prev, range_step: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="1"
                      data-testid="range-step"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* File/Image upload sub-options */}
            {(newField.field_type === "file" || newField.field_type === "image") && (
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
                      value={newField.max_file_size_mb ?? ""}
                      onChange={(e) => setNewField(prev => ({ ...prev, max_file_size_mb: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="10"
                      data-testid="file-max-size"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Allowed Extensions (comma-separated)</Label>
                    <Input
                      value={(newField.allowed_extensions || []).join(", ")}
                      onChange={(e) => setNewField(prev => ({ 
                        ...prev, 
                        allowed_extensions: e.target.value ? e.target.value.split(",").map(s => s.trim()).filter(Boolean) : []
                      }))}
                      placeholder={newField.field_type === "image" ? "jpg, png, gif" : "pdf, doc, xlsx"}
                      data-testid="file-extensions"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Equipment field sub-options - Configure hierarchy selection */}
            {newField.field_type === "equipment" && (
              <div className="space-y-3 p-3 bg-indigo-50 rounded-lg" data-testid="equipment-suboptions">
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Equipment Selection Settings
                </Label>
                <p className="text-xs text-slate-600 mb-2">
                  This field will show a hierarchical equipment selector to the user during form execution.
                </p>
                
                {/* Preview of equipment selector */}
                <div className="space-y-2 border border-indigo-200 rounded-lg p-3 bg-white">
                  <Label className="text-xs text-slate-500">Preview (Hierarchy Levels)</Label>
                  <div className="flex flex-wrap gap-1">
                    {['Installation', 'System', 'Unit', 'Subunit', 'Equipment'].map((level, idx) => (
                      <Badge key={level} variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                        {idx > 0 && <ChevronRight className="w-3 h-3 mr-0.5" />}
                        {level}
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Test equipment search to verify hierarchy data exists */}
                  <div className="mt-3">
                    <Label className="text-xs text-slate-500 mb-1 block">Test equipment search:</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        value={equipmentSearchQuery}
                        onChange={(e) => {
                          setEquipmentSearchQuery(e.target.value);
                          onSearchEquipment(e.target.value);
                        }}
                        placeholder="Type to search equipment..."
                        className="pl-8 h-9 text-sm"
                        data-testid="equipment-search-test"
                      />
                      {searchingEquipment && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                      )}
                    </div>
                    
                    {/* Show search results with hierarchy path */}
                    {equipmentSearchResults.length > 0 && equipmentSearchQuery && (
                      <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                        {equipmentSearchResults.map((eq) => (
                          <div
                            key={eq.id}
                            className="px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 truncate">{eq.name}</p>
                                <p className="text-xs text-slate-500 truncate">
                                  {eq.path || eq.full_path || `Level: ${eq.level}`}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-xs capitalize">
                                {eq.level}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {equipmentSearchQuery && equipmentSearchResults.length === 0 && !searchingEquipment && (
                      <p className="mt-2 text-xs text-amber-600">
                        No equipment found. Ensure equipment hierarchy is configured in Settings.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={newField.required}
                onCheckedChange={(v) => setNewField(prev => ({ ...prev, required: v }))}
              />
              <Label>Required field</Label>
            </div>

            <div className="space-y-2">
              <Label>Description / Help Text</Label>
              <Input
                value={newField.description || ""}
                onChange={(e) => setNewField(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional help text for users"
              />
            </div>
            
            {/* Equipment Link */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                Link to Equipment (optional)
              </Label>
              
              {newField.linked_equipment ? (
                <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">{newField.linked_equipment.name}</p>
                      {newField.linked_equipment.path && (
                        <p className="text-xs text-blue-600">{newField.linked_equipment.path}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewField(prev => ({ ...prev, linked_equipment: null }))}
                    className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={equipmentSearchQuery}
                      onChange={(e) => {
                        setEquipmentSearchQuery(e.target.value);
                        onSearchEquipment(e.target.value);
                      }}
                      placeholder="Search equipment to link..."
                      className="pl-9"
                      data-testid="equipment-link-search"
                    />
                    {searchingEquipment && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                    )}
                  </div>
                  
                  {equipmentSearchResults.length > 0 && equipmentSearchQuery && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {equipmentSearchResults.map((eq) => (
                        <button
                          key={eq.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-100 last:border-0"
                          onClick={() => {
                            setNewField(prev => ({
                              ...prev,
                              linked_equipment: {
                                id: eq.id,
                                name: eq.name,
                                path: eq.path || eq.full_path,
                                level: eq.level
                              }
                            }));
                            setEquipmentSearchQuery("");
                            setEquipmentSearchResults([]);
                          }}
                        >
                          <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{eq.name}</p>
                            {(eq.path || eq.full_path) && (
                              <p className="text-xs text-slate-500 truncate">{eq.path || eq.full_path}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">Link this field to a specific equipment from the hierarchy</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              onOpenChange(false);
              onReset();
            }}>
              Cancel
            </Button>
            <Button onClick={onSave} data-testid="save-field-btn">
              {editingField ? "Update Field" : "Add Field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

  );
}
