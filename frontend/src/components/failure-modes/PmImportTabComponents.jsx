import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Upload,
  RefreshCw,
  Loader2,
  ClipboardList,
  Brain,
  ChevronDown,
  CheckCircle,
  X,
  Edit,
  Trash2,
  Target,
  Link,
} from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
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
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { toast } from "sonner";
import { pmImportAPI, isPmImportFinalized, isPmImportReviewAccepted, getPmImportStatusDisplay } from "../../lib/apis/pmImport";
import { AIReviewModal } from "../library/AIReviewModal";
import PMApplyFailureModeDialog from "../library/PMApplyFailureModeDialog";

const getTaskEquipmentType = (task) => {
  const match = task?.equipment_match;
  return {
    id: match?.equipment_type_id || task?.equipment_type_id || null,
    name: task?.equipment_type_name || match?.equipment_type_name || null,
  };
};

// Custom PM Import Tab Component
export const CustomPMImportTab = ({ onOpenImportWizard, onOpenEquipmentTypeStrategy }) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('all');
  const [filterFrequency, setFilterFrequency] = useState('all');
  const [editingTask, setEditingTask] = useState(null);
  const [mappingTask, setMappingTask] = useState(null); // {task, mode: 'equipment'|'equipment-type'|'failure-modes'}
  const [showAIReview, setShowAIReview] = useState(false);
  const [selectedSessionForReview, setSelectedSessionForReview] = useState(null);
  const [applyToFmTask, setApplyToFmTask] = useState(null);
  
  // Fetch all flattened tasks across all PM import sessions
  const { data: tasksData, isLoading, refetch } = useQuery({
    queryKey: ['pm-import-tasks'],
    queryFn: () => pmImportAPI.listAllTasks(),
  });
  
  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: ['pm-import-tasks'] });
  
  const acceptMutation = useMutation({
    mutationFn: (task) => pmImportAPI.acceptTask(task.session_id, task.task_id),
    onSuccess: () => { toast.success('Task accepted'); invalidateTasks(); },
    onError: (e) => toast.error(`Accept failed: ${e?.message || 'error'}`),
  });
  
  const rejectMutation = useMutation({
    mutationFn: (task) => pmImportAPI.rejectTask(task.session_id, task.task_id),
    onSuccess: () => { toast.success('Task rejected'); invalidateTasks(); },
    onError: (e) => toast.error(`Reject failed: ${e?.message || 'error'}`),
  });
  
  const deleteMutation = useMutation({
    mutationFn: (task) => pmImportAPI.deleteTask(task.session_id, task.task_id),
    onSuccess: () => { toast.success('Task deleted'); invalidateTasks(); },
    onError: (e) => toast.error(`Delete failed: ${e?.message || 'error'}`),
  });
  
  const updateMutation = useMutation({
    mutationFn: ({ task, updates }) => pmImportAPI.updateTask(task.session_id, task.task_id, updates),
    onSuccess: () => { toast.success('Task updated'); invalidateTasks(); setEditingTask(null); },
    onError: (e) => toast.error(`Update failed: ${e?.message || 'error'}`),
  });
  
  const mappingMutation = useMutation({
    mutationFn: ({ task, payload }) => pmImportAPI.updateMapping(task.session_id, task.task_id, payload),
    onSuccess: () => { toast.success('Mapping saved'); invalidateTasks(); setMappingTask(null); },
    onError: (e) => toast.error(`Mapping failed: ${e?.message || 'error'}`),
  });
  
  const allTasks = useMemo(() => tasksData?.tasks || [], [tasksData]);
  const sessionCount = tasksData?.session_count || 0;
  
  // Get unique sessions with their accepted task counts for AI Review
  const sessionsWithAcceptedTasks = useMemo(() => {
    const sessionMap = new Map();
    allTasks.forEach(task => {
      if (task.session_id) {
        if (!sessionMap.has(task.session_id)) {
          sessionMap.set(task.session_id, { 
            session_id: task.session_id, 
            total: 0, 
            accepted: 0,
            filename: task.source_filename || 'Unknown'
          });
        }
        const session = sessionMap.get(task.session_id);
        session.total++;
        if (isPmImportReviewAccepted(task)) {
          session.accepted++;
        }
      }
    });
    return Array.from(sessionMap.values()).filter(s => s.accepted > 0);
  }, [allTasks]);
  
  // Get unique disciplines and frequencies for filters
  const disciplines = useMemo(() => {
    const set = new Set();
    allTasks.forEach(task => {
      if (task.discipline) set.add(task.discipline);
    });
    return Array.from(set).sort();
  }, [allTasks]);
  
  const frequencies = useMemo(() => {
    const set = new Set();
    allTasks.forEach(task => {
      if (task.frequency) set.add(task.frequency);
    });
    return Array.from(set).sort();
  }, [allTasks]);
  
  // Filter tasks
  const filteredTasks = useMemo(() => {
    return allTasks.filter(task => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          task.task?.toLowerCase().includes(term) ||
          task.equipment?.toLowerCase().includes(term) ||
          task.description?.toLowerCase().includes(term) ||
          task.discipline?.toLowerCase().includes(term) ||
          task.equipment_tag?.toLowerCase().includes(term) ||
          task.equipment_description?.toLowerCase().includes(term) ||
          task.task_description?.toLowerCase().includes(term) ||
          task.equipment_type_name?.toLowerCase().includes(term) ||
          task.equipment_match?.equipment_type_name?.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }
      
      if (filterDiscipline !== 'all' && task.discipline !== filterDiscipline) {
        return false;
      }
      
      if (filterFrequency !== 'all' && task.frequency !== filterFrequency) {
        return false;
      }
      
      return true;
    });
  }, [allTasks, searchTerm, filterDiscipline, filterFrequency]);
  
  // Stats
  const totalTasks = allTasks.length;
  const acceptedTasks = allTasks.filter(isPmImportReviewAccepted).length;
  
  const getDisciplineBadge = (discipline) => {
    if (!discipline) return null;
    const colors = {
      mechanical: 'bg-blue-100 text-blue-700',
      electrical: 'bg-yellow-100 text-yellow-700',
      instrumentation: 'bg-purple-100 text-purple-700',
      rotating: 'bg-orange-100 text-orange-700',
      static: 'bg-teal-100 text-teal-700',
      process: 'bg-green-100 text-green-700',
    };
    const color = colors[discipline.toLowerCase()] || 'bg-gray-100 text-gray-700';
    return <Badge variant="outline" className={`${color} text-xs`}>{discipline}</Badge>;
  };
  
  const getFrequencyBadge = (frequency) => {
    if (!frequency) return null;
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">{frequency}</Badge>;
  };
  
  const getImportStatusBadge = (task) => {
    const { label, className } = getPmImportStatusDisplay(task);
    return (
      <Badge variant="outline" className={`${className} text-xs`}>
        {label}
      </Badge>
    );
  };

  const getTaskTypeBadge = (taskType) => {
    if (!taskType) return null;
    const normalized = String(taskType).toUpperCase();
    const colors = {
      PM: 'bg-green-100 text-green-700',
      PDM: 'bg-purple-100 text-purple-700',
      CBM: 'bg-blue-100 text-blue-700',
      CM: 'bg-red-100 text-red-700',
    };
    const color = colors[normalized] || 'bg-gray-100 text-gray-700';
    return <Badge variant="outline" className={`${color} text-xs font-semibold`}>{normalized}</Badge>;
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4" data-testid="pm-import-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-purple-600" />
            Custom PM Import
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("library.customPmImportDesc") || "View and manage imported maintenance tasks"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {sessionsWithAcceptedTasks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-purple-200 text-purple-700 hover:bg-purple-50"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  AI Review
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {sessionsWithAcceptedTasks.map((session) => (
                  <DropdownMenuItem
                    key={session.session_id}
                    onClick={() => {
                      setSelectedSessionForReview(session.session_id);
                      setShowAIReview(true);
                    }}
                    className="flex flex-col items-start"
                  >
                    <span className="font-medium text-sm">{session.filename}</span>
                    <span className="text-xs text-gray-500">
                      {session.accepted} accepted task{session.accepted !== 1 ? 's' : ''} ready for review
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={onOpenImportWizard}>
            <Upload className="h-4 w-4 mr-2" />
            Import PM Plan
          </Button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-2xl font-bold text-purple-600">{totalTasks}</div>
          <div className="text-sm text-gray-500">Total Tasks Imported</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-green-600">{acceptedTasks}</div>
          <div className="text-sm text-gray-500">Tasks Accepted</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-600">{sessionCount}</div>
          <div className="text-sm text-gray-500">Import Sessions</div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tasks, equipment..."
            className="pl-9"
          />
        </div>
        
        <Select value={filterDiscipline} onValueChange={setFilterDiscipline}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Discipline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Disciplines</SelectItem>
            {disciplines.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={filterFrequency} onValueChange={setFilterFrequency}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Frequencies</SelectItem>
            {frequencies.map(f => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Tasks Table */}
      {allTasks.length === 0 ? (
        <div className="card p-12 text-center">
          <Upload className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No Imported Tasks Yet</h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Import your existing maintenance plans, PM schedules, or OEM documentation to extract and manage maintenance tasks.
          </p>
          <Button className="mt-4" onClick={onOpenImportWizard}>
            <Upload className="h-4 w-4 mr-2" />
            Import Your First Plan
          </Button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">Equipment Tag</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-600">Equipment Description</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">Equipment Type</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-600">Task Description</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">Status</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">Type</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">Discipline</th>
                  <th className="text-left px-3 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">Frequency</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">Hours</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-gray-600 whitespace-nowrap sticky right-0 bg-gray-50 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTasks.map((task, idx) => (
                  <tr key={task.task_id || idx} className="hover:bg-gray-50 group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <PMHierarchyChip
                        task={task}
                        onClick={() => setMappingTask({ task, mode: 'equipment' })}
                      />
                    </td>
                    <td className="px-3 py-3 max-w-[220px]">
                      <div className="text-sm text-gray-700 truncate" title={task.equipment_description}>
                        {task.equipment_match?.name || task.equipment_description || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3 max-w-[160px]">
                      {(() => {
                        const { id: typeId, name: typeName } = getTaskEquipmentType(task);
                        if (typeId && typeName && onOpenEquipmentTypeStrategy) {
                          return (
                            <button
                              type="button"
                              onClick={() => onOpenEquipmentTypeStrategy(typeId)}
                              className="text-sm text-blue-700 hover:text-blue-900 hover:underline truncate text-left max-w-full"
                              title={`${t("library.openEquipmentTypeStrategy")} (${typeName})`}
                              data-testid={`pm-task-equipment-type-${task.task_id}`}
                            >
                              {typeName}
                            </button>
                          );
                        }
                        return (
                          <div
                            className="text-sm text-gray-700 truncate"
                            title={typeName || undefined}
                          >
                            {typeName || '-'}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 max-w-[280px]">
                      <div className="text-sm font-medium text-gray-900 truncate" title={task.task_description}>
                        {task.task_description || '-'}
                      </div>
                      {task.file_name && (
                        <div className="text-xs text-gray-400 truncate" title={task.file_name}>
                          {task.file_name}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {getImportStatusBadge(task)}
                    </td>
                    <td className="px-3 py-3">
                      {getTaskTypeBadge(task.task_type)}
                    </td>
                    <td className="px-3 py-3">
                      {getDisciplineBadge(task.discipline)}
                    </td>
                    <td className="px-3 py-3">
                      {getFrequencyBadge(task.frequency)}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span className="text-sm text-gray-700">{task.estimated_hours != null ? `${task.estimated_hours}h` : '-'}</span>
                    </td>
                    <td className="px-3 py-3 sticky right-0 bg-white group-hover:bg-gray-50 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-purple-600 hover:bg-purple-50"
                          title="Apply to failure mode"
                          disabled={isPmImportFinalized(task) || !isPmImportReviewAccepted(task)}
                          onClick={() => setApplyToFmTask(task)}
                          data-testid={`pm-task-apply-fm-${task.task_id}`}
                        >
                          <Target className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-green-600 hover:bg-green-50"
                          title="Accept"
                          disabled={isPmImportReviewAccepted(task) || isPmImportFinalized(task)}
                          onClick={() => acceptMutation.mutate(task)}
                          data-testid={`pm-task-accept-${task.task_id}`}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-red-600 hover:bg-red-50"
                          title="Reject"
                          disabled={task.review_status === 'rejected'}
                          onClick={() => rejectMutation.mutate(task)}
                          data-testid={`pm-task-reject-${task.task_id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-blue-600 hover:bg-blue-50"
                          title="Edit"
                          onClick={() => setEditingTask(task)}
                          data-testid={`pm-task-edit-${task.task_id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-gray-600 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                          onClick={() => {
                            if (window.confirm(`Delete this task?\n\n"${(task.task_description || '').slice(0, 100)}"`)) {
                              deleteMutation.mutate(task);
                            }
                          }}
                          data-testid={`pm-task-delete-${task.task_id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredTasks.length === 0 && allTasks.length > 0 && (
            <div className="text-center py-8 text-gray-500">
              No tasks match your filters
            </div>
          )}
          
          <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-500">
            Showing {filteredTasks.length} of {allTasks.length} tasks
          </div>
        </div>
      )}
      
      <PMTaskEditDialog
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={(updates) => updateMutation.mutate({ task: editingTask, updates })}
        saving={updateMutation.isPending}
      />
      
      <PMMappingDialog
        mapping={mappingTask}
        onClose={() => setMappingTask(null)}
        onSave={(payload) => mappingMutation.mutate({ task: mappingTask.task, payload })}
        saving={mappingMutation.isPending}
      />
      
      {/* AI Review Modal */}
      <AIReviewModal
        isOpen={showAIReview}
        onClose={() => {
          setShowAIReview(false);
          setSelectedSessionForReview(null);
        }}
        sessionId={selectedSessionForReview}
        onComplete={() => {
          invalidateTasks();
        }}
      />

      <PMApplyFailureModeDialog
        task={applyToFmTask}
        onClose={() => setApplyToFmTask(null)}
        onSuccess={() => invalidateTasks()}
      />
    </div>
  );
};

// ----- Hierarchy chip (single equipment_match per PM Import refactor) -----
const PMHierarchyChip = ({ task, onClick }) => {
  const m = task.equipment_match;
  if (m && m.equipment_id) {
    const colorByType = {
      tag_exact: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
      name_exact: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
      name_partial: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
      manual: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    };
    const cls = colorByType[m.match_type] || 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${cls}`}
        title={`${m.match_type} · ${m.confidence}% — click to change`}
        data-testid={`pm-hierarchy-chip-${task.task_id}`}
      >
        <Link className="h-3 w-3" />
        {m.tag || m.name || '—'}
        <span className="ml-1 opacity-60">({m.confidence}%)</span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 border-dashed max-w-[200px]"
      title={`Unmatched — click to map. Raw: ${task.equipment_tag || task.equipment_description || '—'}`}
      data-testid={`pm-hierarchy-unmatched-${task.task_id}`}
    >
      <span className="truncate">
        {task.equipment_tag || task.equipment_description || 'Unmatched'}
      </span>
      <span className="opacity-60 flex-shrink-0">(unmatched)</span>
    </button>
  );
};

// ----- Unified mapping dialog (PM Import refactor: equipment only) -----
const PMMappingDialog = ({ mapping, onClose, onSave, saving }) => {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const task = mapping?.task;
  
  useEffect(() => {
    if (!mapping) return;
    setQuery('');
    setItems([]);
  }, [mapping]);
  
  useEffect(() => {
    if (!mapping) return;
    let cancelled = false;
    const fn = async () => {
      setLoading(true);
      try {
        const results = await pmImportAPI.lookupEquipment(query);
        if (!cancelled) setItems(results);
      } catch (e) {
        if (!cancelled) toast.error('Lookup failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(fn, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, mapping]);
  
  if (!mapping) return null;
  
  const handleSelect = (item) => {
    onSave({ equipment_id: item.id });
  };
  
  return (
    <Dialog open={!!mapping} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl" data-testid="pm-mapping-dialog">
        <DialogHeader>
          <DialogTitle>Map to Hierarchy Tag</DialogTitle>
          <DialogDescription>
            Task: <span className="font-medium">{(task?.task_description || '').slice(0, 100)}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search by tag or name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="pm-mapping-search"
          />
          <ScrollArea className="h-80 border rounded">
            {loading && (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">No results</div>
            )}
            {!loading && items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b text-sm"
                data-testid={`pm-mapping-item-${item.id}`}
              >
                <div className="font-medium">{item.tag || '—'}</div>
                <div className="text-xs text-gray-500">{item.name} · {item.level}</div>
              </button>
            ))}
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PMTaskEditDialog = ({ task, onClose, onSave, saving }) => {
  const [form, setForm] = useState({});
  
  const TASK_TYPES = ['PM', 'PDM', 'CBM', 'CM'];
  const DISCIPLINES = ['Mechanical', 'Electrical', 'Instrumentation', 'Process', 'Civil', 'Operations', 'HVAC'];
  const FREQUENCIES = ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Every 2 Years', 'Every 3 Years', 'Condition Based', 'One Time'];
  
  useEffect(() => {
    if (task) {
      setForm({
        equipment_tag: task.equipment_tag || '',
        equipment_description: task.equipment_description || '',
        task_description: task.task_description || '',
        task_type: (task.task_type || 'PM').toUpperCase(),
        discipline: task.discipline || 'Mechanical',
        frequency: task.frequency || 'Monthly',
        estimated_hours: task.estimated_hours ?? 0.5,
      });
    }
  }, [task]);
  
  if (!task) return null;
  
  return (
    <Dialog open={!!task} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl" data-testid="pm-task-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit Imported Task</DialogTitle>
          <DialogDescription>From {task.file_name || 'PM Import'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Equipment Tag</Label>
              <Input
                value={form.equipment_tag}
                onChange={(e) => setForm({ ...form, equipment_tag: e.target.value })}
                data-testid="pm-edit-equipment-tag"
              />
            </div>
            <div>
              <Label>Equipment Description</Label>
              <Input
                value={form.equipment_description}
                onChange={(e) => setForm({ ...form, equipment_description: e.target.value })}
                data-testid="pm-edit-equipment-description"
              />
            </div>
          </div>
          <div>
            <Label>Task Description</Label>
            <Textarea
              value={form.task_description}
              onChange={(e) => setForm({ ...form, task_description: e.target.value })}
              rows={3}
              data-testid="pm-edit-task-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Task Type</Label>
              <Select
                value={form.task_type || 'PM'}
                onValueChange={(v) => setForm({ ...form, task_type: v })}
              >
                <SelectTrigger data-testid="pm-edit-task-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(tt => (
                    <SelectItem key={tt} value={tt}>{tt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Discipline</Label>
              <Select
                value={form.discipline || 'Mechanical'}
                onValueChange={(v) => setForm({ ...form, discipline: v })}
              >
                <SelectTrigger data-testid="pm-edit-discipline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency</Label>
              <Select
                value={form.frequency || 'Monthly'}
                onValueChange={(v) => setForm({ ...form, frequency: v })}
              >
                <SelectTrigger data-testid="pm-edit-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estimated Hours</Label>
              <Input
                type="number"
                step="0.25"
                min="0.1"
                max="24"
                value={form.estimated_hours}
                onChange={(e) => setForm({ ...form, estimated_hours: parseFloat(e.target.value) || 0 })}
                data-testid="pm-edit-estimated-hours"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving} data-testid="pm-edit-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
