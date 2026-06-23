import { motion } from "framer-motion";
import { Search, Sparkles, Plus, X } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { TabsContent } from "../ui/tabs";
import { EquipmentTypeItem, EquipmentTypeFailureModesPanel, DISCIPLINES, DISCIPLINE_COLORS } from "../library";

export function FailureModesEquipmentTypesTab({
  t,
  equipmentTypes,
  selectedEquipmentType,
  setSelectedEquipmentType,
  equipmentTypeSearch,
  setEquipmentTypeSearch,
  typeFilterNoFailureModes,
  setTypeFilterNoFailureModes,
  noFailureModesTypeCount,
  filterLinkedToEquipment,
  setFilterLinkedToEquipment,
  linkedEquipmentTypeCount,
  typeFilterDiscipline,
  setTypeFilterDiscipline,
  canUseAITools,
  hierarchyNodes,
  matchesActiveEquipmentTypeFilters,
  handleEditType,
  deleteTypeMutation,
  getConnectedFmCount,
  failureModes,
  handleUpdateFailureModeConnection,
  setIsAISuggestionsOpen,
  setIsAINewTypesOpen,
  setEditingType,
  resetTypeForm,
  setIsTypeDialogOpen,
}) {
  return (
    <TabsContent value="libraries" className="flex-1 min-h-0 mt-0 flex flex-col overflow-hidden">
      <div className="flex flex-1 gap-4 min-h-0">
    {/* Left Panel: Equipment Types List */}
    <div className={`${selectedEquipmentType ? 'w-1/2 lg:w-2/5' : 'w-full'} transition-all duration-300 min-w-0`}>
      <div className="card h-full flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-800">{t("library.equipmentTypes")}</h3>
                <p className="text-xs text-slate-500 mt-1">{equipmentTypes.length} {t("library.typesDefined")} • {t("library.clickToViewConnected")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setIsAISuggestionsOpen(true)} 
                  className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                  data-testid="ai-map-failure-modes-btn"
                >
                  <Sparkles className="w-4 h-4 mr-1" /> {t("library.mapFailureModes")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAINewTypesOpen(true)}
                  className={`bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 ${canUseAITools ? "" : "hidden"}`}
                  data-testid="ai-suggest-new-types-btn"
                  disabled={hierarchyNodes.length === 0}
                  title="Suggest new equipment types based on your hierarchy"
                >
                  <Sparkles className="w-4 h-4 mr-1" /> {t("library.suggestNewTypes")}
                </Button>
                <Button size="sm" onClick={() => { setEditingType(null); resetTypeForm(); setIsTypeDialogOpen(true); }} data-testid="add-equipment-type-btn">
                  <Plus className="w-4 h-4 mr-1" /> {t("library.addEquipmentType")}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search Equipment Types */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder={t("library.searchEquipmentTypes")}
                  value={equipmentTypeSearch}
                  onChange={(e) => setEquipmentTypeSearch(e.target.value)}
                  className="pl-9 h-9"
                />
                {equipmentTypeSearch && (
                  <button
                    onClick={() => setEquipmentTypeSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Filter: No Failure Modes */}
              <label className="flex items-center gap-2 text-sm cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={typeFilterNoFailureModes}
                  onChange={(e) => setTypeFilterNoFailureModes(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-600 whitespace-nowrap">No failure modes</span>
                {typeFilterNoFailureModes && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                    {noFailureModesTypeCount}
                  </span>
                )}
              </label>
              <label
                className="flex items-center gap-2 text-sm cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                title={t("library.filterLinkedToEquipmentHint")}
              >
                <input
                  type="checkbox"
                  checked={filterLinkedToEquipment}
                  onChange={(e) => setFilterLinkedToEquipment(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  data-testid="linked-to-equipment-toggle-types"
                />
                <span className="text-slate-600 whitespace-nowrap">{t("library.filterLinkedToEquipment")}</span>
                {filterLinkedToEquipment && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                    {linkedEquipmentTypeCount}
                  </span>
                )}
              </label>
              {/* Discipline Filter */}
              <Select value={typeFilterDiscipline} onValueChange={setTypeFilterDiscipline}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder={t("disciplines.allDisciplines")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("disciplines.allDisciplines")}</SelectItem>
                  {DISCIPLINES.map(d => (
                    <SelectItem key={d} value={d}>{(t(`disciplines.${d}`) !== `disciplines.${d}` ? t(`disciplines.${d}`) : d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 overflow-y-auto">
          {/* Group equipment types by discipline */}
          {DISCIPLINES.filter(d => typeFilterDiscipline === "all" || d === typeFilterDiscipline).map(discipline => {
            let disciplineTypes = equipmentTypes.filter(
              (t) => t.discipline === discipline && matchesActiveEquipmentTypeFilters(t),
            );
            if (disciplineTypes.length === 0) return null;
            const colors = DISCIPLINE_COLORS[discipline] || DISCIPLINE_COLORS["Mechanical"];
            
            return (
              <div key={discipline} className="mb-6 last:mb-0">
                <div className={`flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg ${colors.bg}`}>
                  <span className={`text-sm font-semibold ${colors.text}`}>{(t(`disciplines.${discipline}`) !== `disciplines.${discipline}` ? t(`disciplines.${discipline}`) : discipline)}</span>
                  <span className="text-xs text-slate-400">({disciplineTypes.length})</span>
                </div>
                <div className={`grid gap-3 ${selectedEquipmentType ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                  {disciplineTypes.map(t => (
                    <EquipmentTypeItem 
                      key={t.id} 
                      item={t} 
                      onEdit={handleEditType} 
                      onDelete={(id) => deleteTypeMutation.mutate(id)}
                      onSelect={setSelectedEquipmentType}
                      isSelected={selectedEquipmentType?.id === t.id}
                      connectedFmCount={getConnectedFmCount(t.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    
    {/* Right Panel: Connected Failure Modes */}
    {selectedEquipmentType && (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-1/2 lg:w-3/5 h-full"
      >
        <EquipmentTypeFailureModesPanel
          equipmentType={selectedEquipmentType}
          allFailureModes={failureModes}
          onUpdateFailureMode={handleUpdateFailureModeConnection}
          onClose={() => setSelectedEquipmentType(null)}
          t={t}
        />
      </motion.div>
      )}
      </div>
    </TabsContent>
  );
}
