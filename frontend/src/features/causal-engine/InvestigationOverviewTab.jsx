import {
  Clock,
  AlertTriangle,
  GitBranch,
  CheckSquare,
  Trash2,
  Calendar,
  User,
  MapPin,
  Target,
  Loader2,
  Edit,
  FileDown,
  Presentation,
  Sparkles,
  Brain,
  FileText,
  X,
  Save,
  Lock,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import AttachmentsPanel from "../../components/attachments/AttachmentsPanel";
import { ReliabilityEvidencePanel } from "../../components/reliability/ReliabilityEvidencePanel";
import RecurringIssueQuadrant from "../../components/causal-engine/RecurringIssueQuadrant";
import EquipmentTimeline from "../../components/EquipmentTimeline";
import { INVESTIGATION_STATUSES } from "../../components/causal-engine/constants";

export function InvestigationOverviewTab({
  isEditingInvestigation,
  onCancelEdit,
  onSaveInvestigation,
  savePending,
  editInvForm,
  setEditInvForm,
  equipmentNodes,
  users,
  investigation,
  isInvestigationLocked,
  onStatusChange,
  translateAssetName,
  formatDate,
  stats,
  onGenerateAISummary,
  isGeneratingAISummary,
  onDownloadPPTX,
  onDownloadPDF,
  isGeneratingReport,
  onEditInvestigation,
  deleteInvOptions,
  setDeleteInvOptions,
  onDeleteInvestigation,
  onNavigateTab,
  onShowAIProblemCheck,
  localNotes,
  onNotesChange,
  evidenceItems,
  isUploading,
  onUploadFiles,
  onRemoveEvidence,
  apiBaseUrl,
  investigationAPI,
  t,
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ReliabilityEvidencePanel
          equipmentId={investigation?.asset_id}
          equipmentName={investigation?.asset_name}
          anchorNodeType="investigation"
          anchorNodeId={investigation?.id}
          anchorLabel={
            investigation?.case_number
              ? `#${investigation.case_number} · ${investigation?.title || "Investigation"}`
              : investigation?.title
          }
          buttonLabel="Graph evidence"
        />
      </div>
      {isEditingInvestigation ? (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-slate-900">Edit Investigation</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onCancelEdit}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={onSaveInvestigation} disabled={savePending}>
                <Save className="w-4 h-4 mr-1" /> {savePending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editInvForm.title}
                onChange={(e) => setEditInvForm({ ...editInvForm, title: e.target.value })}
                placeholder="Investigation title"
                className="mt-1"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editInvForm.description}
                onChange={(e) => setEditInvForm({ ...editInvForm, description: e.target.value })}
                placeholder="Investigation description"
                className="mt-1 min-h-[80px]"
              />
            </div>

            <div>
              <Label htmlFor="edit-equipment">Equipment</Label>
              {equipmentNodes.length > 0 ? (
                <Select
                  value={editInvForm.asset_name}
                  onValueChange={(v) => setEditInvForm({ ...editInvForm, asset_name: v })}
                >
                  <SelectTrigger className="mt-1" id="edit-equipment">
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentNodes.map((node) => (
                      <SelectItem key={node.id} value={node.name}>
                        {node.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="edit-equipment"
                  value={editInvForm.asset_name}
                  onChange={(e) => setEditInvForm({ ...editInvForm, asset_name: e.target.value })}
                  placeholder="Enter equipment name"
                  className="mt-1"
                />
              )}
            </div>

            <div>
              <Label htmlFor="edit-location">Location</Label>
              <Input
                id="edit-location"
                value={editInvForm.location}
                onChange={(e) => setEditInvForm({ ...editInvForm, location: e.target.value })}
                placeholder="Location"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edit-date">Incident Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editInvForm.incident_date}
                onChange={(e) => setEditInvForm({ ...editInvForm, incident_date: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edit-lead">Investigation Lead</Label>
              <Select
                value={editInvForm.investigation_leader}
                onValueChange={(v) => setEditInvForm({ ...editInvForm, investigation_leader: v })}
              >
                <SelectTrigger className="mt-1" id="edit-lead">
                  <SelectValue placeholder="Select lead" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.name || user.email}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editInvForm.status}
                onValueChange={(v) => setEditInvForm({ ...editInvForm, status: v })}
              >
                <SelectTrigger className="mt-1" id="edit-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {INVESTIGATION_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-mono text-slate-500">{investigation.case_number}</span>
                {isInvestigationLocked ? (
                  <div className="flex items-center gap-1 h-7 px-2 rounded-md bg-green-100 text-green-700 text-xs font-medium">
                    <Lock className="w-3 h-3" />
                    {investigation.status === "completed" ? "Completed" : "Closed"}
                  </div>
                ) : (
                  <Select value={investigation.status} onValueChange={onStatusChange}>
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVESTIGATION_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-1">{investigation.title}</h1>
              <p className="text-sm text-slate-600">{investigation.description}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="text-purple-600 border-purple-200 hover:bg-purple-50 h-8"
                onClick={onGenerateAISummary}
                disabled={isGeneratingAISummary}
                data-testid="ai-summary-btn"
              >
                {isGeneratingAISummary ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4 mr-1" />
                )}
                AI Summary
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-slate-600 h-8"
                    disabled={isGeneratingReport}
                    data-testid="export-report-btn"
                  >
                    {isGeneratingReport ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <FileDown className="w-4 h-4 mr-1" />
                    )}
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onDownloadPPTX} disabled={isGeneratingReport}>
                    <Presentation className="w-4 h-4 mr-2 text-orange-500" />
                    PowerPoint (.pptx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDownloadPDF} disabled={isGeneratingReport}>
                    <FileText className="w-4 h-4 mr-2 text-red-500" />
                    PDF Report (.pdf)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {!isInvestigationLocked && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onEditInvestigation}
                  className="text-slate-500 hover:text-blue-600"
                  data-testid="edit-investigation-btn"
                >
                  <Edit className="w-4 h-4" />
                </Button>
              )}
              {!isInvestigationLocked && (
                <AlertDialog
                  onOpenChange={(open) => {
                    if (!open) setDeleteInvOptions({ deleteCentralActions: false });
                  }}
                >
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-red-500" data-testid="delete-investigation-btn">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Investigation</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this investigation and all its internal data (timeline events,
                        failure identifications, causes, evidence).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4 space-y-3">
                      <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deleteInvOptions.deleteCentralActions}
                          onChange={(e) =>
                            setDeleteInvOptions((prev) => ({ ...prev, deleteCentralActions: e.target.checked }))
                          }
                          className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                        />
                        <div>
                          <div className="font-medium text-slate-900">Also delete linked Actions</div>
                          <div className="text-sm text-slate-500">
                            Remove all Central Actions created from this investigation
                          </div>
                        </div>
                      </label>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onDeleteInvestigation} className="bg-red-600 hover:bg-red-700">
                        Delete Investigation
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-blue-50">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-slate-900">{stats.totalEvents}</span>
                <span className="text-xs text-slate-500 ml-1">Events</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-orange-50">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-slate-900">{stats.totalFailures}</span>
                <span className="text-xs text-slate-500 ml-1">Failures</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-purple-50">
                <GitBranch className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-slate-900">{stats.totalCauses}</span>
                <span className="text-xs text-slate-500 ml-1">Causes</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-red-50">
                <Target className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-red-600">{stats.rootCauses}</span>
                <span className="text-xs text-slate-500 ml-1">Root Causes</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <div className="p-1.5 rounded-md bg-green-50">
                <CheckSquare className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <span className="text-lg font-bold text-slate-900">{stats.totalActions}</span>
                <span className="text-xs text-slate-500 ml-1">Actions</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {investigation.asset_name && (
              <div className="bg-white rounded-lg border p-3">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <Target className="w-3 h-3" />
                  Equipment
                </div>
                <p className="font-medium text-sm">
                  {translateAssetName(investigation.asset_name)}
                  {investigation.equipment_tag && (
                    <span className="text-slate-400 ml-1">({investigation.equipment_tag})</span>
                  )}
                </p>
              </div>
            )}
            {investigation.location && (
              <div className="bg-white rounded-lg border p-3">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <MapPin className="w-3 h-3" />
                  Location
                </div>
                <p className="font-medium text-sm">{investigation.location}</p>
              </div>
            )}
            {investigation.incident_date && (
              <div className="bg-white rounded-lg border p-3">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <Calendar className="w-3 h-3" />
                  Date
                </div>
                <p className="font-medium text-sm">{formatDate(investigation.incident_date)}</p>
              </div>
            )}
            {investigation.investigation_leader && (
              <div className="bg-white rounded-lg border p-3">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <User className="w-3 h-3" />
                  Lead
                </div>
                <p className="font-medium text-sm">{investigation.investigation_leader}</p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => onNavigateTab("timeline")}
          className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Clock className="w-5 h-5 text-blue-600" />
          <div className="text-left">
            <div className="font-medium text-sm">Timeline</div>
            <div className="text-xs text-slate-500">Build sequence</div>
          </div>
        </button>
        <button
          onClick={() => onNavigateTab("failures")}
          className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          <div className="text-left">
            <div className="font-medium text-sm">Failures</div>
            <div className="text-xs text-slate-500">Identify what failed</div>
          </div>
        </button>
        <button
          onClick={() => onNavigateTab("causes")}
          className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <GitBranch className="w-5 h-5 text-purple-600" />
          <div className="text-left">
            <div className="font-medium text-sm">Causes</div>
            <div className="text-xs text-slate-500">Build causal tree</div>
          </div>
        </button>
        <button
          onClick={() => onNavigateTab("actions")}
          className="flex items-center gap-3 p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
        >
          <CheckSquare className="w-5 h-5 text-green-600" />
          <div className="text-left">
            <div className="font-medium text-sm">Actions</div>
            <div className="text-xs text-slate-500">Track corrections</div>
          </div>
        </button>
      </div>

      <RecurringIssueQuadrant
        investigation={investigation}
        investigationAPI={investigationAPI}
        disabled={isInvestigationLocked}
      />

      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-700">
            <FileText className="w-4 h-4" />
            <span className="font-medium text-sm">Problem Statement</span>
          </div>
          {!isInvestigationLocked && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowAIProblemCheck}
              className="text-purple-600 hover:bg-purple-50 h-7 px-2"
              title="Defensive Reasoning Check - Analyze for defensive reasoning, premature solutions, and clarity"
              data-testid="ai-problem-check-btn"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              <span className="text-xs">Defensive Reasoning Check</span>
            </Button>
          )}
        </div>
        <Textarea
          value={localNotes}
          onChange={onNotesChange}
          placeholder="Describe the problem statement - what is the observable issue that needs to be investigated..."
          className="min-h-[120px] resize-y text-sm"
          data-testid="investigation-notes"
        />
      </div>

      {investigation.threat_id && (
        <EquipmentTimeline
          threatId={investigation.threat_id}
          equipmentId={null}
          equipmentName={investigation.asset_name}
        />
      )}

      <div className="bg-white rounded-lg border p-4">
        <AttachmentsPanel
          title={t("causal.attachedFiles") || "Attachments"}
          items={evidenceItems}
          editable={!isInvestigationLocked}
          isUploading={isUploading}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          getKey={(e) => e?.id}
          getName={(e) => e?.original_filename || e?.name || "Attachment"}
          getUrl={(e) => (e?.storage_path ? `${apiBaseUrl}/api/storage/${e.storage_path}` : null)}
          getContentType={(e) => e?.content_type}
          onAddFiles={onUploadFiles}
          onRemove={onRemoveEvidence}
        />
      </div>
    </div>
  );
}
