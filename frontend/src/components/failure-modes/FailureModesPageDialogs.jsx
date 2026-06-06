import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Clock,
  Cog,
  Globe,
  Building,
  History,
  RotateCcw,
  Trash2,
  User,
  Link,
  Search,
} from "lucide-react";
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
import { SearchableSelect } from "../ui/searchable-select";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { formatDateTime } from "../../lib/dateUtils";
import { EQUIPMENT_ICONS, ICON_OPTIONS, DISCIPLINES } from "../library";
import { disciplineColors } from "./disciplineStyles";

export function EquipmentTypeFormDialog(props) {
  const {
    t,
    isTypeDialogOpen,
    setIsTypeDialogOpen,
    editingType,
    setEditingType,
    newType,
    setNewType,
    equipmentTypes,
    handleSaveType,
    resetTypeForm,
  } = props;
  return (
<Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{editingType ? t("library.editEquipmentType") : t("library.addEquipmentType")}</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <div>
        <Label>{t("common.name")}</Label>
        <Input 
          value={newType.name} 
          onChange={e => setNewType({ ...newType, name: e.target.value })} 
          placeholder="Custom Pump" 
          data-testid="type-name-input" 
        />
        {/* Show duplicate warning */}
        {newType.name.trim() && equipmentTypes.some(
          et => et.name.toLowerCase() === newType.name.trim().toLowerCase() && 
                (!editingType || et.id !== editingType.id)
        ) && (
          <p className="text-sm text-red-500 mt-1">An equipment type with this name already exists</p>
        )}
      </div>
      <div>
        <Label>{t("library.discipline")}</Label>
        <Select value={newType.discipline} onValueChange={v => setNewType({ ...newType, discipline: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{(t(`disciplines.${d}`) !== `disciplines.${d}` ? t(`disciplines.${d}`) : d)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t("library.icon")}</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {ICON_OPTIONS.map(icon => { 
            const IconComp = EQUIPMENT_ICONS[icon] || Cog; 
            return (
              <button 
                key={icon} 
                onClick={() => setNewType({ ...newType, icon })} 
                className={`p-2 rounded-lg border ${newType.icon === icon ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <IconComp className="w-5 h-5" />
              </button>
            ); 
          })}
        </div>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => { setIsTypeDialogOpen(false); setEditingType(null); resetTypeForm(); }}>
        {t("common.cancel")}
      </Button>
      <Button 
        onClick={handleSaveType} 
        disabled={!newType.name.trim() || equipmentTypes.some(
          et => et.name.toLowerCase() === newType.name.trim().toLowerCase() && 
                (!editingType || et.id !== editingType.id)
        )} 
        data-testid="save-type-btn"
      >
        {editingType ? t("common.save") : t("common.create")}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
  );
}

export function FailureModeFormDialog(props) {
  const {
    t,
    isFmDialogOpen,
    setIsFmDialogOpen,
    editingFm,
    newFm,
    setNewFm,
    keywordInput,
    setKeywordInput,
    actionInput,
    setActionInput,
    actionDiscipline,
    setActionDiscipline,
    actionType,
    setActionType,
    actionMinutes,
    setActionMinutes,
    equipmentTypes,
    categories,
    FAILURE_MODE_TYPE_OPTIONS,
    ACTION_TYPE_OPTIONS,
    handleSaveFm,
    addKeyword,
    removeKeyword,
    addAction,
    removeAction,
    toggleEquipmentType,
    resetFmForm,
    setEditingFm,
  } = props;
  return (
<Dialog open={isFmDialogOpen} onOpenChange={setIsFmDialogOpen}>
  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>{editingFm ? t("library.editFailureMode") : t("library.addFailureMode")}</DialogTitle>
      <DialogDescription>
        {editingFm ? t("library.updateFailureModeDesc") : t("library.addFailureModeDesc")}
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-4">
      {/* Category */}
      <div>
        <Label>{t("library.discipline")} *</Label>
        <Select value={newFm.discipline} onValueChange={v => setNewFm({ ...newFm, discipline: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{(t(`disciplines.${d}`) !== `disciplines.${d}` ? t(`disciplines.${d}`) : d)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Failure Mode Type Selection */}
      <div>
        <Label className="flex items-center gap-2">
          Failure Mode Type *
          <span className="text-xs text-slate-400 font-normal">(Generic = industry standard, Customer = specific to your organization)</span>
        </Label>
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => setNewFm({ ...newFm, failure_mode_type: "generic" })}
            className={`flex-1 p-3 rounded-lg border-2 transition-all flex items-center gap-3 ${
              newFm.failure_mode_type === "generic"
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
            data-testid="fm-type-generic"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              newFm.failure_mode_type === "generic" ? "bg-blue-100" : "bg-slate-100"
            }`}>
              <Globe className={`w-5 h-5 ${newFm.failure_mode_type === "generic" ? "text-blue-600" : "text-slate-400"}`} />
            </div>
            <div className="text-left">
              <p className={`font-medium ${newFm.failure_mode_type === "generic" ? "text-blue-700" : "text-slate-700"}`}>
                Generic
              </p>
              <p className="text-xs text-slate-500">Industry standard failure modes</p>
            </div>
            {newFm.failure_mode_type === "generic" && (
              <CheckCircle className="w-5 h-5 text-blue-600 ml-auto" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setNewFm({ ...newFm, failure_mode_type: "customer_specific" })}
            className={`flex-1 p-3 rounded-lg border-2 transition-all flex items-center gap-3 ${
              newFm.failure_mode_type === "customer_specific"
                ? "border-purple-500 bg-purple-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
            data-testid="fm-type-customer"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              newFm.failure_mode_type === "customer_specific" ? "bg-purple-100" : "bg-slate-100"
            }`}>
              <Building className={`w-5 h-5 ${newFm.failure_mode_type === "customer_specific" ? "text-purple-600" : "text-slate-400"}`} />
            </div>
            <div className="text-left">
              <p className={`font-medium ${newFm.failure_mode_type === "customer_specific" ? "text-purple-700" : "text-slate-700"}`}>
                Customer Specific
              </p>
              <p className="text-xs text-slate-500">Unique to your organization</p>
            </div>
            {newFm.failure_mode_type === "customer_specific" && (
              <CheckCircle className="w-5 h-5 text-purple-600 ml-auto" />
            )}
          </button>
        </div>
      </div>

      {/* Failure Mode Name */}
      <div>
        <Label>{t("library.failureModeName")} *</Label>
        <Input 
          value={newFm.failure_mode} 
          onChange={e => setNewFm({ ...newFm, failure_mode: e.target.value })} 
          placeholder="e.g., Seal Failure, Bearing Damage" 
          data-testid="fm-name-input"
        />
      </div>

      {/* Process Field */}
      <div>
        <Label>{t("library.process")}</Label>
        <Input 
          value={newFm.process || ""} 
          onChange={e => setNewFm({ ...newFm, process: e.target.value })} 
          placeholder={t("library.processPlaceholder")}
        />
      </div>

      {/* Potential Effects */}
      <div>
        <Label>{t("library.potentialEffects")}</Label>
        <Input 
          value={newFm.potential_effects || ""} 
          onChange={e => setNewFm({ ...newFm, potential_effects: e.target.value })} 
          placeholder={t("library.potentialEffectsPlaceholder")}
        />
      </div>

      {/* Potential Causes */}
      <div>
        <Label>{t("library.potentialCauses")}</Label>
        <Input 
          value={newFm.potential_causes || ""} 
          onChange={e => setNewFm({ ...newFm, potential_causes: e.target.value })} 
          placeholder={t("library.potentialCausesPlaceholder")}
        />
      </div>

      {/* Linked Equipment Types - Multi-select with Search */}
      <div>
        <Label className="flex items-center gap-2">
          <Link className="w-4 h-4 text-blue-500" />
          {t("library.linkedEquipmentTypes")}
        </Label>
        <p className="text-xs text-slate-500 mb-2">{t("library.clickToSelect")}</p>
        {/* Search input for equipment types */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search equipment types..."
            value={equipmentTypeSearch}
            onChange={(e) => setEquipmentTypeSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {/* Selected equipment types shown at top */}
        {(newFm.equipment_type_ids || []).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
            {(newFm.equipment_type_ids || []).map(id => {
              const eqt = equipmentTypes.find(e => e.id === id);
              return eqt ? (
                <button
                  key={eqt.id}
                  type="button"
                  onClick={() => toggleEquipmentType(eqt.id)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-500 text-white flex items-center gap-1"
                >
                  {eqt.name}
                  <X className="w-3 h-3" />
                </button>
              ) : null;
            })}
          </div>
        )}
        {/* Available equipment types */}
        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg max-h-40 overflow-y-auto">
          {filteredEquipmentTypes.filter(eqt => !(newFm.equipment_type_ids || []).includes(eqt.id)).map(eqt => (
            <button
              key={eqt.id}
              type="button"
              onClick={() => toggleEquipmentType(eqt.id)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all bg-white border border-slate-200 text-slate-600 hover:border-blue-300"
            >
              {eqt.name}
            </button>
          ))}
          {filteredEquipmentTypes.filter(eqt => !(newFm.equipment_type_ids || []).includes(eqt.id)).length === 0 && (
            <span className="text-sm text-slate-400 py-2">
              {equipmentTypeSearch ? "No matching equipment types" : "All equipment types selected"}
            </span>
          )}
        </div>
        {(newFm.equipment_type_ids || []).length > 0 && (
          <p className="text-xs text-blue-600 mt-1">
            {t("library.selected")}: {(newFm.equipment_type_ids || []).length} {t("library.types")}
          </p>
        )}
      </div>

      {/* FMEA Scores Row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>{t("library.severity")} (1-10) *</Label>
          <Input 
            type="number" 
            min={1} max={10} 
            value={newFm.severity} 
            onChange={e => setNewFm({ ...newFm, severity: parseInt(e.target.value) || 5 })} 
          />
        </div>
        <div>
          <Label>{t("library.occurrence")} (1-10) *</Label>
          <Input 
            type="number" 
            min={1} max={10} 
            value={newFm.occurrence} 
            onChange={e => setNewFm({ ...newFm, occurrence: parseInt(e.target.value) || 5 })} 
          />
        </div>
        <div>
          <Label>{t("library.detectability")} (1-10) *</Label>
          <Input 
            type="number" 
            min={1} max={10} 
            value={newFm.detectability} 
            onChange={e => setNewFm({ ...newFm, detectability: parseInt(e.target.value) || 5 })} 
          />
        </div>
      </div>
      <div className="bg-slate-50 p-3 rounded-lg text-center">
        <span className="text-sm text-slate-600">RPN = {newFm.severity} × {newFm.occurrence} × {newFm.detectability} = </span>
        <span className={`text-lg font-bold ${newFm.severity * newFm.occurrence * newFm.detectability >= 300 ? "text-red-600" : newFm.severity * newFm.occurrence * newFm.detectability >= 200 ? "text-orange-600" : "text-green-600"}`}>
          {newFm.severity * newFm.occurrence * newFm.detectability}
        </span>
      </div>

      {/* Keywords */}
      <div>
        <Label>{t("library.keywords")}</Label>
        <div className="flex gap-2">
          <Input 
            value={keywordInput} 
            onChange={e => setKeywordInput(e.target.value)} 
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKeyword())}
            placeholder={t("library.addKeyword")} 
          />
          <Button type="button" variant="outline" onClick={addKeyword}>{t("common.add")}</Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {newFm.keywords.map((kw) => (
            <Badge key={kw} variant="secondary" className="flex items-center gap-1">
              {kw}
              <button onClick={() => removeKeyword(kw)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Recommended Actions */}
      <div>
        <Label>{t("library.recommendedActions")}</Label>
        <div className="flex gap-2">
          <Input 
            value={actionInput} 
            onChange={e => setActionInput(e.target.value)} 
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addAction())}
            placeholder={t("library.addAction")} 
          />
          <Button type="button" variant="outline" onClick={addAction}>{t("common.add")}</Button>
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <Select value={actionDiscipline} onValueChange={setActionDiscipline}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Discipline" />
            </SelectTrigger>
            <SelectContent>
              {DISCIPLINE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionType} onValueChange={setActionType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 whitespace-nowrap">Est. time (min)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={actionMinutes}
              onChange={(e) => setActionMinutes(e.target.value)}
              className="w-24"
              placeholder="—"
              data-testid="fm-action-est-minutes"
            />
          </div>
        </div>
        <ul className="space-y-2 mt-3">
          {newFm.recommended_actions.map((action, i) => {
            // Handle both old string format and new object format
            const isObject = typeof action === 'object';
            const description = isObject ? (action.action || action.description) : action;
            const discipline = isObject ? action.discipline : null;
            const type = isObject ? action.action_type : null;
            const estMin = isObject ? action.estimated_minutes : null;
            const typeConfig = ACTION_TYPE_OPTIONS.find(t => t.value === type);
            const actionKey = `${description}-${discipline || 'none'}-${type || 'none'}-${i}`;
            
            return (
              <li key={actionKey} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {type && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeConfig?.color || 'bg-slate-100 text-slate-600'}`}>
                        {type}
                      </span>
                    )}
                    {discipline && (
                      <span className="text-xs text-slate-500 capitalize">{discipline}</span>
                    )}
                    {Number.isFinite(estMin) && estMin !== null && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                        {estMin} min
                      </span>
                    )}
                  </div>
                  <span className="text-sm">{i + 1}. {description}</span>
                </div>
                <button onClick={() => removeAction(i)} className="text-red-500 hover:text-red-700 ml-2"><X className="w-4 h-4" /></button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => { setIsFmDialogOpen(false); setEditingFm(null); resetFmForm(); }}>
        {t("common.cancel")}
      </Button>
      <Button 
        onClick={handleSaveFm} 
        disabled={!newFm.failure_mode.trim()} 
        data-testid="save-fm-btn"
      >
        {editingFm ? t("common.save") : t("common.create")}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

  );
}

export function FailureModeVersionHistoryDialog(props) {
  const {
    showVersionHistory,
    setShowVersionHistory,
    versionsLoading,
    versions,
    selectedFm,
    handleRollback,
    rollbackMutation,
  } = props;
  return (
<Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
  <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <History className="w-5 h-5 text-blue-600" />
        Version History
      </DialogTitle>
      <DialogDescription>
        View previous versions and rollback if needed. Each edit creates a new version.
      </DialogDescription>
    </DialogHeader>
    
    <div className="flex-1 overflow-y-auto">
      {versionsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : versions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No version history available</p>
          <p className="text-sm text-slate-400 mt-1">History will appear after the first edit</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* First show comparison with current state */}
          {selectedFm && versions.length > 0 && (
            <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-green-600 text-white">Current v{selectedFm.version}</Badge>
                <span className="text-xs text-green-700">Live version</span>
              </div>
              {(() => {
                const curr = selectedFm;
                const prev = versions[0]?.snapshot || {};
                const changes = [];
                
                if (curr.failure_mode !== prev.failure_mode) {
                  changes.push({ field: 'Name', from: prev.failure_mode, to: curr.failure_mode });
                }
                if (curr.discipline !== prev.discipline) {
                  changes.push({ field: 'Discipline', from: prev.discipline, to: curr.discipline });
                }
                if ((curr.failure_mode_type || 'generic') !== (prev.failure_mode_type || 'generic')) {
                  changes.push({ field: 'Type', from: prev.failure_mode_type || 'generic', to: curr.failure_mode_type || 'generic' });
                }
                if (curr.severity !== prev.severity) {
                  changes.push({ field: 'Severity', from: prev.severity, to: curr.severity });
                }
                if (curr.occurrence !== prev.occurrence) {
                  changes.push({ field: 'Occurrence', from: prev.occurrence, to: curr.occurrence });
                }
                if (curr.detectability !== prev.detectability) {
                  changes.push({ field: 'Detectability', from: prev.detectability, to: curr.detectability });
                }
                const currRPN = curr.severity * curr.occurrence * curr.detectability;
                const prevRPN = (prev.severity || 0) * (prev.occurrence || 0) * (prev.detectability || 0);
                if (currRPN !== prevRPN) {
                  changes.push({ field: 'RPN', from: prevRPN, to: currRPN, isRPN: true });
                }
                
                // Check recommended actions
                const currActions = curr.recommended_actions || [];
                const prevActions = prev.recommended_actions || [];
                if (currActions.length !== prevActions.length || JSON.stringify(currActions) !== JSON.stringify(prevActions)) {
                  const added = currActions.filter(a => !prevActions.includes(a)).length;
                  const removed = prevActions.filter(a => !currActions.includes(a)).length;
                  if (added > 0 || removed > 0) {
                    let actionChange = '';
                    if (added > 0 && removed > 0) actionChange = `+${added}/-${removed}`;
                    else if (added > 0) actionChange = `+${added} added`;
                    else if (removed > 0) actionChange = `-${removed} removed`;
                    changes.push({ field: 'Actions', from: `${prevActions.length}`, to: `${currActions.length} (${actionChange})`, isAction: true });
                  }
                }
                
                // Check keywords
                const currKeywords = curr.keywords || [];
                const prevKeywords = prev.keywords || [];
                if (currKeywords.length !== prevKeywords.length || JSON.stringify(currKeywords.sort()) !== JSON.stringify(prevKeywords.sort())) {
                  const added = currKeywords.filter(k => !prevKeywords.includes(k)).length;
                  const removed = prevKeywords.filter(k => !currKeywords.includes(k)).length;
                  if (added > 0 || removed > 0) {
                    let keywordChange = '';
                    if (added > 0 && removed > 0) keywordChange = `+${added}/-${removed}`;
                    else if (added > 0) keywordChange = `+${added} added`;
                    else if (removed > 0) keywordChange = `-${removed} removed`;
                    changes.push({ field: 'Keywords', from: `${prevKeywords.length}`, to: `${currKeywords.length} (${keywordChange})` });
                  }
                }
                
                return changes.length > 0 ? (
                  <div className="p-2 bg-white/50 rounded border border-green-200">
                    <div className="text-xs font-medium text-green-800 mb-1">
                      Changes from v{versions[0]?.version}:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {changes.map((change) => (
                        <span key={`${change.field}-${change.from}-${change.to}`} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                          change.isRPN ? (change.to > change.from ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')
                          : change.isAction ? 'bg-purple-100 text-purple-700'
                          : 'bg-slate-100 text-slate-700'
                        }`}>
                          <span className="font-medium">{change.field}:</span>
                          <span className="opacity-60">{change.from}</span>
                          <span>→</span>
                          <span className="font-semibold">{change.to}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-green-700">No changes from previous version</div>
                );
              })()}
              <div className="mt-2 flex items-center gap-4 text-sm">
                <span className={`font-bold text-lg ${
                  selectedFm.severity * selectedFm.occurrence * selectedFm.detectability >= 200 ? 'text-red-600' : 'text-green-700'
                }`}>
                  {selectedFm.severity * selectedFm.occurrence * selectedFm.detectability}
                </span>
                <span className="text-green-600">{selectedFm.failure_mode}</span>
              </div>
            </div>
          )}
          
          {/* Historical versions */}
          {versions.map((version, idx) => {
            // Compare this version with the NEXT newer version (or current if idx=0)
            const newerVersion = idx === 0 ? selectedFm : versions[idx - 1]?.snapshot;
            const thisVersion = version.snapshot || {};
            const changes = [];
            
            if (newerVersion && idx > 0) {
              const newer = versions[idx - 1]?.snapshot || {};
              
              // Show what changed FROM this version TO the newer version
              if (thisVersion.failure_mode !== newer.failure_mode) {
                changes.push({ field: 'Name', from: thisVersion.failure_mode, to: newer.failure_mode });
              }
              if (thisVersion.discipline !== newer.discipline) {
                changes.push({ field: 'Discipline', from: thisVersion.discipline, to: newer.discipline });
              }
              if ((thisVersion.failure_mode_type || 'generic') !== (newer.failure_mode_type || 'generic')) {
                changes.push({ field: 'Type', from: thisVersion.failure_mode_type || 'generic', to: newer.failure_mode_type || 'generic' });
              }
              if (thisVersion.severity !== newer.severity) {
                changes.push({ field: 'Severity', from: thisVersion.severity, to: newer.severity });
              }
              if (thisVersion.occurrence !== newer.occurrence) {
                changes.push({ field: 'Occurrence', from: thisVersion.occurrence, to: newer.occurrence });
              }
              if (thisVersion.detectability !== newer.detectability) {
                changes.push({ field: 'Detectability', from: thisVersion.detectability, to: newer.detectability });
              }
              
              const thisRPN = (thisVersion.severity || 0) * (thisVersion.occurrence || 0) * (thisVersion.detectability || 0);
              const newerRPN = (newer.severity || 0) * (newer.occurrence || 0) * (newer.detectability || 0);
              if (thisRPN !== newerRPN) {
                changes.push({ field: 'RPN', from: thisRPN, to: newerRPN, isRPN: true });
              }
              
              // Check recommended actions
              const thisActions = thisVersion.recommended_actions || [];
              const newerActions = newer.recommended_actions || [];
              if (thisActions.length !== newerActions.length || JSON.stringify(thisActions) !== JSON.stringify(newerActions)) {
                const added = newerActions.filter(a => !thisActions.includes(a)).length;
                const removed = thisActions.filter(a => !newerActions.includes(a)).length;
                if (added > 0 || removed > 0) {
                  let actionChange = '';
                  if (added > 0 && removed > 0) actionChange = `+${added}/-${removed}`;
                  else if (added > 0) actionChange = `+${added} added`;
                  else if (removed > 0) actionChange = `-${removed} removed`;
                  changes.push({ field: 'Actions', from: `${thisActions.length}`, to: `${newerActions.length} (${actionChange})`, isAction: true });
                }
              }
              
              // Check keywords
              const thisKeywords = thisVersion.keywords || [];
              const newerKeywords = newer.keywords || [];
              if (thisKeywords.length !== newerKeywords.length || JSON.stringify(thisKeywords.sort()) !== JSON.stringify(newerKeywords.sort())) {
                const added = newerKeywords.filter(k => !thisKeywords.includes(k)).length;
                const removed = thisKeywords.filter(k => !newerKeywords.includes(k)).length;
                if (added > 0 || removed > 0) {
                  let keywordChange = '';
                  if (added > 0 && removed > 0) keywordChange = `+${added}/-${removed}`;
                  else if (added > 0) keywordChange = `+${added} added`;
                  else if (removed > 0) keywordChange = `-${removed} removed`;
                  changes.push({ field: 'Keywords', from: `${thisKeywords.length}`, to: `${newerKeywords.length} (${keywordChange})` });
                }
              }
            }
            
            const rpn = (thisVersion.severity || 0) * (thisVersion.occurrence || 0) * (thisVersion.detectability || 0);
            
            return (
            <div 
              key={version.id}
              className="p-4 rounded-lg border border-slate-200 bg-white"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">v{version.version}</Badge>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDateTime(version.created_at)}
                    </span>
                  </div>
                  
                  {/* Change Summary - what changed FROM this version TO the next */}
                  {changes.length > 0 && (
                    <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="text-xs font-medium text-amber-800 mb-1 flex items-center gap-1">
                        <ChevronRight className="w-3 h-3" />
                        Changed to v{versions[idx - 1]?.version}:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {changes.map((change) => (
                          <span 
                            key={`${change.field}-${change.from}-${change.to}`} 
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                              change.isRPN 
                                ? change.to > change.from 
                                  ? 'bg-red-100 text-red-700' 
                                  : 'bg-green-100 text-green-700'
                                : change.isAction
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <span className="font-medium">{change.field}:</span>
                            <span className="opacity-60">{change.from}</span>
                            <span>→</span>
                            <span className="font-semibold">{change.to}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Version snapshot summary */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-lg ${
                        rpn >= 200 ? 'text-red-600' :
                        rpn >= 125 ? 'text-orange-600' :
                        'text-slate-700'
                      }`}>
                        {rpn}
                      </span>
                      <span className="text-slate-400 text-xs">
                        ({thisVersion.severity}×{thisVersion.occurrence}×{thisVersion.detectability})
                      </span>
                    </div>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600">{thisVersion.failure_mode}</span>
                  </div>
                  
                  {version.updated_by && (
                    <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      Changed by: {version.updated_by}
                    </div>
                  )}
                  
                  {version.change_reason && (
                    <div className="mt-1 text-xs text-slate-500 italic">
                      {version.change_reason}
                    </div>
                  )}
                </div>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRollback(version.id)}
                  disabled={rollbackMutation.isPending}
                  className="flex-shrink-0 gap-1"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore
                </Button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowVersionHistory(false)}>
        Close
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
  );
}

export function FailureModeDeleteDialog(props) {
  const {
    deleteConfirmFm,
    setDeleteConfirmFm,
    deleteFmMutation,
    setSelectedFm,
  } = props;
  return (
<Dialog open={!!deleteConfirmFm} onOpenChange={() => setDeleteConfirmFm(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-red-600">
        <Trash2 className="w-5 h-5" />
        Delete Failure Mode
      </DialogTitle>
      <DialogDescription>
        Are you sure you want to delete this failure mode? This action can be undone using the global undo button.
      </DialogDescription>
    </DialogHeader>
    
    {deleteConfirmFm && (
      <div className="py-4">
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <Badge className={disciplineColors[deleteConfirmFm.discipline] || "bg-slate-100"}>
              {deleteConfirmFm.discipline}
            </Badge>
            <span className={`font-bold ${
              deleteConfirmFm.severity * deleteConfirmFm.occurrence * deleteConfirmFm.detectability >= 200 
                ? 'text-red-600' : 'text-slate-700'
            }`}>
              RPN: {deleteConfirmFm.severity * deleteConfirmFm.occurrence * deleteConfirmFm.detectability}
            </span>
          </div>
          <h3 className="font-semibold text-slate-900">{deleteConfirmFm.failure_mode}</h3>
          <p className="text-sm text-slate-500 mt-1">{deleteConfirmFm.equipment}</p>
          {deleteConfirmFm.is_builtin && (
            <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              This is a built-in failure mode
            </div>
          )}
        </div>
      </div>
    )}
    
    <DialogFooter>
      <Button variant="outline" onClick={() => setDeleteConfirmFm(null)}>
        Cancel
      </Button>
      <Button 
        variant="destructive"
        onClick={() => {
          if (deleteConfirmFm) {
            deleteFmMutation.mutate(deleteConfirmFm.id);
            setSelectedFm(null);
            setDeleteConfirmFm(null);
          }
        }}
        disabled={deleteFmMutation.isPending}
        className="bg-red-600 hover:bg-red-700"
      >
        {deleteFmMutation.isPending ? "Deleting..." : "Delete Failure Mode"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
  );
}
