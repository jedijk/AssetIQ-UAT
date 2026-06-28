/**
 * MaintenanceProgramPanel Component
 * 
 * Displays and manages the maintenance program for a specific equipment item.
 * Shows tasks from all sources (strategy, imported, AI, manual) with full CRUD capabilities.
 */
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceProgramAPI } from '../../lib/apis/maintenanceProgram';
import { refreshMaintenanceSchedulerQueries } from '../../lib/apis/maintenanceScheduler';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from 'sonner';
import {
  ClipboardList, Plus, RefreshCw, Sparkles, FileDown, History,
  ChevronRight, ChevronDown, Filter, Search, MoreVertical,
  CheckCircle2, XCircle, AlertCircle, Clock, Wrench, Eye,
  Edit, Trash2, Play, Pause, Settings, Brain, Upload, ArrowUpDown,
  Shield, Gauge, Activity, Calendar, Target, Package,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { Switch } from '../ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '../ui/dropdown-menu';
import { CRITICALITY_CONFIG } from '../maintenance/constants';
import { computeCriticalityScore } from '../../lib/criticalityScore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { cn } from '../../lib/utils';
import SparePartRequirementsEditor from '../spareiq/SparePartRequirementsEditor';
import { taskConsumesSpareParts } from '../spareiq/sparePartUtils';
import AIRecommendationCard from '../ai/AIRecommendationCard';

const PANEL_ROOT_CLASS = 'min-w-0 max-w-full overflow-x-hidden space-y-3 sm:space-y-4';

const DIALOG_CONTENT_CLASS = 'w-[calc(100%-1rem)] max-w-lg max-h-[min(92dvh,100%)] overflow-y-auto sm:w-full';
const FORM_GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

const STRATEGY_BAND_STYLES = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  high: 'bg-red-50 text-red-700 border-red-200',
};

const strategyBandLabel = (t, band) => {
  if (band === 'high') return t('maintenance.criticalityHigh');
  if (band === 'medium') return t('maintenance.criticalityMedium');
  return t('maintenance.criticalityLow');
};

const displayCriticalityScore = (program) => {
  const fromDims = computeCriticalityScore({
    safety_impact: program.safety_impact ?? program.criticality?.safety_impact,
    production_impact: program.production_impact ?? program.criticality?.production_impact,
    environmental_impact: program.environmental_impact ?? program.criticality?.environmental_impact,
    reputation_impact: program.reputation_impact ?? program.criticality?.reputation_impact,
  });
  if (fromDims != null) return fromDims;
  const stored = program.criticality_score;
  if (stored == null) return null;
  if (stored <= 100) return Math.round(stored);
  return Math.min(100, Math.round(stored / 3.5));
};

const ProgramCriticalityBanner = ({ program, strategyUpdateAvailable, t }) => {
  const equipmentLevel = program.equipment_criticality_level || program.criticality_level;
  const strategyBand = program.strategy_criticality_band;
  const criticalityScore = displayCriticalityScore(program);
  const equipConfig = equipmentLevel ? CRITICALITY_CONFIG[equipmentLevel] : null;
  const EquipIcon = equipConfig?.icon;
  const appliedVersion = program.applied_strategy_version || program.source_strategy_version;
  const latestVersion = program.latest_strategy_version;
  const equipmentTypeId = program.equipment_type_id;
  const bandLabel = strategyBand ? strategyBandLabel(t, strategyBand) : null;

  const strategyVersionHref = equipmentTypeId
    ? `/library?tab=maintenance&equipment_type_id=${encodeURIComponent(equipmentTypeId)}`
    : null;

  const renderStrategyVersion = () => {
    if (!appliedVersion && !latestVersion) return null;

    const VersionLink = ({ version, className = '' }) => {
      const label = `v${version}`;
      if (!strategyVersionHref) {
        return <span className={className}>{label}</span>;
      }
      return (
        <Link
          to={strategyVersionHref}
          className={`text-blue-600 hover:text-blue-800 hover:underline ${className}`}
          title={t('equipment.programViewStrategy')}
        >
          {label}
        </Link>
      );
    };

    if (appliedVersion && latestVersion && appliedVersion === latestVersion) {
      return <VersionLink version={appliedVersion} />;
    }

    if (appliedVersion && latestVersion && appliedVersion !== latestVersion) {
      return (
        <>
          <span>
            {t('equipment.programStrategyVersionApplied')}{' '}
            <VersionLink version={appliedVersion} />
          </span>
          <span className={strategyUpdateAvailable ? 'text-amber-600 font-medium' : ''}>
            · {t('equipment.programStrategyVersionLatest')}{' '}
            <VersionLink version={latestVersion} className={strategyUpdateAvailable ? 'text-amber-600' : ''} />
          </span>
        </>
      );
    }

    return <VersionLink version={appliedVersion || latestVersion} />;
  };

  const versionForHint = appliedVersion || latestVersion || '—';

  if (!equipmentLevel && !strategyBand) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        {equipmentLevel && (
          <div className="flex flex-col gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1.5">
            <span className="text-[10px] sm:text-xs text-slate-500 leading-tight">
              {t('equipment.programEquipmentCriticality')}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] sm:text-xs gap-0.5 sm:gap-1 px-1.5 py-0',
                  equipConfig?.bgColor,
                  equipConfig?.textColor,
                  equipConfig?.borderColor,
                )}
              >
                {EquipIcon && <EquipIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
                {equipConfig?.label || equipmentLevel.replace(/_/g, ' ')}
              </Badge>
              {criticalityScore != null && (
                <span className="text-[10px] sm:text-xs text-slate-600">{criticalityScore}/100</span>
              )}
            </div>
          </div>
        )}
        {strategyBand && (
          <div className="flex flex-col gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1.5">
            <span className="text-[10px] sm:text-xs text-slate-500 leading-tight">
              {t('equipment.programStrategyBand')}
            </span>
            <Badge
              variant="outline"
              className={cn('text-[10px] sm:text-xs px-1.5 py-0 w-fit', STRATEGY_BAND_STYLES[strategyBand])}
            >
              {bandLabel || strategyBand}
            </Badge>
          </div>
        )}
        {(appliedVersion || latestVersion) && (
          <div className="flex flex-col gap-0.5 min-w-0 text-[10px] sm:text-xs text-slate-600 sm:flex-row sm:items-center sm:gap-1.5">
            <span className="text-slate-500 shrink-0">{t('equipment.programStrategyVersion')}</span>
            <span className="min-w-0 break-words">{renderStrategyVersion()}</span>
          </div>
        )}
      </div>
      {strategyBand && (
        <p className="text-[10px] sm:text-xs text-slate-500 mt-1.5 leading-snug">
          {t('equipment.programCriticalityUsedHint')
            .replace('{band}', bandLabel || strategyBand)
            .replace('{version}', versionForHint)}
        </p>
      )}
    </div>
  );
};

// Task source icons and colors
const SOURCE_CONFIG = {
  strategy_generated: { icon: Target, color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Strategy' },
  customer_imported: { icon: Upload, color: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Imported' },
  ai_generated: { icon: Brain, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'AI' },
  manual: { icon: Edit, color: 'bg-green-100 text-green-700 border-green-200', label: 'Manual' },
  equipment_specific: { icon: Wrench, color: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Specific' },
};

// Task category icons
const CATEGORY_CONFIG = {
  inspection: { icon: Eye, label: 'Inspection' },
  condition_monitoring: { icon: Activity, label: 'Condition Monitoring' },
  preventive_maintenance: { icon: Shield, label: 'Preventive' },
  functional_test: { icon: Play, label: 'Functional Test' },
  lubrication: { icon: Package, label: 'Lubrication' },
  calibration: { icon: Gauge, label: 'Calibration' },
  cleaning: { icon: Sparkles, label: 'Cleaning' },
  safety_verification: { icon: Shield, label: 'Safety' },
  regulatory_compliance: { icon: ClipboardList, label: 'Regulatory' },
  predictive: { icon: Brain, label: 'Predictive' },
  corrective: { icon: Wrench, label: 'Corrective' },
};

// Frequency labels
const FREQUENCY_LABELS = {
  not_required: 'Not Required',
  continuous: 'Continuous',
  hourly: 'Hourly',
  shift: 'Per Shift',
  daily: 'Daily',
  weekly: 'Weekly',
  bi_weekly: 'Bi-Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
  biennial: 'Biennial',
  on_condition: 'On Condition',
};

// Priority colors
const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

// Status badge component
const StatusBadge = ({ status }) => {
  const config = {
    draft: { color: 'bg-gray-100 text-gray-700', label: 'Draft' },
    active: { color: 'bg-green-100 text-green-700', label: 'Active' },
    archived: { color: 'bg-blue-100 text-blue-700', label: 'Archived' },
    superseded: { color: 'bg-amber-100 text-amber-700', label: 'Superseded' },
  };
  const { color, label } = config[status] || config.draft;
  return <Badge variant="outline" className={`${color} text-[10px] sm:text-xs px-1.5 py-0`}>{label}</Badge>;
};

// Source badge component
const SourceBadge = ({ source }) => {
  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.manual;
  const IconComponent = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} text-[10px] sm:text-xs gap-0.5 sm:gap-1 px-1.5 py-0`}>
      <IconComponent className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
      {config.label}
    </Badge>
  );
};

// Task row component
const TaskRow = ({ task, onEdit, onDelete, onToggleActive, isExpanded, onToggleExpand, canToggle, isTogglePending }) => {
  const { t } = useLanguage();
  const categoryConfig = CATEGORY_CONFIG[task.task_category] || CATEGORY_CONFIG.preventive_maintenance;
  const CategoryIcon = categoryConfig.icon;
  const isActive = task.is_active !== false;

  const metaBadges = (
    <>
      <SourceBadge source={task.task_source} />
      <Badge variant="outline" className={`${PRIORITY_COLORS[task.priority]} text-[10px] sm:text-xs px-1.5 py-0`}>
        {task.priority}
      </Badge>
      <Badge variant="outline" className="bg-gray-50 text-gray-600 text-[10px] sm:text-xs gap-0.5 sm:gap-1 px-1.5 py-0">
        <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        {FREQUENCY_LABELS[task.frequency] || task.frequency}
      </Badge>
      <Badge variant="outline" className="bg-gray-50 text-gray-600 text-[10px] sm:text-xs px-1.5 py-0">
        {task.estimated_duration_hours}h
      </Badge>
    </>
  );
  
  return (
    <div className={`border rounded-lg mb-1.5 sm:mb-2 min-w-0 ${!isActive ? 'opacity-60' : ''}`}>
      <div
        className="p-2 sm:p-3 cursor-pointer hover:bg-gray-50"
        onClick={onToggleExpand}
      >
        <div className="flex items-start gap-1.5 sm:gap-3 min-w-0">
          <div className="flex-shrink-0 pt-0.5">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
          </div>

          <div className="flex-shrink-0">
            <div className={`p-1.5 sm:p-2 rounded-lg ${isActive ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <CategoryIcon className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`font-medium text-xs sm:text-base break-words ${!isActive ? 'line-through text-gray-400' : ''}`}>
                    {task.task_title}
                  </span>
                  {!isActive && (
                    <Badge variant="outline" className="bg-slate-100 text-slate-600 text-[10px] sm:text-xs px-1.5 py-0">
                      Disabled
                    </Badge>
                  )}
                  {task.is_overridden && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-600 text-[10px] sm:text-xs px-1.5 py-0">Overridden</Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2 sm:truncate">
                  {task.task_description || 'No description'}
                </div>
              </div>

              <div
                className="flex items-center gap-1.5 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {canToggle && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <Switch
                            checked={isActive}
                            disabled={isTogglePending}
                            onCheckedChange={() => onToggleActive(task, isActive)}
                            aria-label={isActive ? 'Disable task' : 'Enable task'}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{isActive ? t('tooltips.disableTask') : t('tooltips.enableTask')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {task.is_pm_import_pending ? (
                      <DropdownMenuItem disabled className="text-xs text-gray-500">
                        Manage in Library → PM Import
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(task)}>
                          <Edit className="h-4 w-4 mr-2" /> Edit Task
                        </DropdownMenuItem>
                        {canToggle && (
                          <DropdownMenuItem onClick={() => onToggleActive(task, isActive)}>
                            {isActive ? (
                              <><Pause className="h-4 w-4 mr-2" /> Disable task</>
                            ) : (
                              <><Play className="h-4 w-4 mr-2" /> Enable task</>
                            )}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(task)} className="text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete Task
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 mt-1.5 sm:hidden">
              {metaBadges}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 flex-shrink-0 self-center">
            {metaBadges}
          </div>
        </div>
      </div>
      
      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 sm:px-12 pb-3 border-t bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 py-3">
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Category</div>
              <div className="text-sm">{categoryConfig.label}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Skill Required</div>
              <div className="text-sm capitalize">{task.skill_requirement?.replace('_', ' ') || 'Technician'}</div>
            </div>
            {(task.pm_import_task_type || task.task_type) && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Type</div>
                <div className="text-sm uppercase">
                  {task.pm_import_task_type || task.task_type}
                </div>
              </div>
            )}
            {task.discipline && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Discipline</div>
                <div className="text-sm">{task.discipline}</div>
              </div>
            )}
            {task.traceability?.failure_mode_name && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Linked Failure Mode</div>
                <div className="text-sm">{task.traceability.failure_mode_name}</div>
              </div>
            )}
          </div>
          
          {task.procedure_steps?.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-gray-500 mb-1">Procedure Steps</div>
              <ol className="list-decimal list-inside text-sm text-gray-700 space-y-0.5">
                {task.procedure_steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          
          {task.traceability?.override_reason && (
            <div className="mt-2 p-2 bg-orange-50 rounded text-sm">
              <span className="font-medium text-orange-700">Override Reason:</span>{' '}
              {task.traceability.override_reason}
            </div>
          )}
          
          {task.traceability?.ai_reasoning && (
            <div className="mt-2 p-2 bg-amber-50 rounded text-sm">
              <span className="font-medium text-amber-700">AI Reasoning:</span>{' '}
              {task.traceability.ai_reasoning}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Add Task Dialog
const AddTaskDialog = ({ open, onClose, equipmentId, onSuccess }) => {
  const [formData, setFormData] = useState({
    task_title: '',
    task_description: '',
    frequency: 'monthly',
    estimated_duration_hours: 1,
    task_category: 'preventive_maintenance',
    priority: 'medium',
    skill_requirement: 'technician',
    discipline: '',
    procedure_steps: [],
  });
  const [procedureInput, setProcedureInput] = useState('');
  
  const addTaskMutation = useMutation({
    mutationFn: (data) => maintenanceProgramAPI.addTask(equipmentId, data),
    onSuccess: (response) => {
      toast.success('Task added successfully');
      onSuccess?.(response);
      onClose();
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to add task: ${error.message}`);
    },
  });
  
  const resetForm = () => {
    setFormData({
      task_title: '',
      task_description: '',
      frequency: 'monthly',
      estimated_duration_hours: 1,
      task_category: 'preventive_maintenance',
      priority: 'medium',
      skill_requirement: 'technician',
      discipline: '',
      procedure_steps: [],
    });
    setProcedureInput('');
  };
  
  const handleAddStep = () => {
    if (procedureInput.trim()) {
      setFormData(prev => ({
        ...prev,
        procedure_steps: [...prev.procedure_steps, procedureInput.trim()]
      }));
      setProcedureInput('');
    }
  };
  
  const handleRemoveStep = (index) => {
    setFormData(prev => ({
      ...prev,
      procedure_steps: prev.procedure_steps.filter((_, i) => i !== index)
    }));
  };
  
  const handleSubmit = () => {
    if (!formData.task_title.trim()) {
      toast.error('Task title is required');
      return;
    }
    addTaskMutation.mutate(formData);
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-600" />
            Add Manual Task
          </DialogTitle>
          <DialogDescription>
            Add a custom maintenance task to this equipment's program.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label>Task Title *</Label>
            <Input
              value={formData.task_title}
              onChange={(e) => setFormData(prev => ({ ...prev, task_title: e.target.value }))}
              placeholder="Enter task title"
            />
          </div>
          
          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.task_description}
              onChange={(e) => setFormData(prev => ({ ...prev, task_description: e.target.value }))}
              placeholder="Enter task description"
              rows={2}
            />
          </div>
          
          <div className={FORM_GRID_CLASS}>
            <div>
              <Label>Frequency</Label>
              <Select 
                value={formData.frequency}
                onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Duration (hours)</Label>
              <Input
                type="number"
                min="0.25"
                step="0.25"
                value={formData.estimated_duration_hours}
                onChange={(e) => setFormData(prev => ({ ...prev, estimated_duration_hours: parseFloat(e.target.value) || 1 }))}
              />
            </div>
          </div>
          
          <div className={FORM_GRID_CLASS}>
            <div>
              <Label>Category</Label>
              <Select 
                value={formData.task_category}
                onValueChange={(value) => setFormData(prev => ({ ...prev, task_category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Priority</Label>
              <Select 
                value={formData.priority}
                onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label>Procedure Steps</Label>
            <div className="flex flex-col sm:flex-row gap-2 mt-1">
              <Input
                value={procedureInput}
                onChange={(e) => setProcedureInput(e.target.value)}
                placeholder="Enter a step"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStep())}
              />
              <Button type="button" variant="outline" onClick={handleAddStep}>Add</Button>
            </div>
            {formData.procedure_steps.length > 0 && (
              <ol className="list-decimal list-inside mt-2 text-sm space-y-1">
                {formData.procedure_steps.map((step, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="flex-1">{step}</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0"
                      onClick={() => handleRemoveStep(idx)}
                    >
                      <XCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={addTaskMutation.isPending}>
            {addTaskMutation.isPending ? 'Adding...' : 'Add Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Edit Task Dialog
const EditTaskDialog = ({ open, onClose, task, equipmentId, onSuccess }) => {
  const [formData, setFormData] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  
  React.useEffect(() => {
    if (task) {
      setFormData({
        task_title: task.task_title,
        task_description: task.task_description || '',
        frequency: task.frequency,
        estimated_duration_hours: task.estimated_duration_hours,
        task_category: task.task_category,
        priority: task.priority,
        is_active: task.is_active !== false,
        spare_part_requirements: task.spare_part_requirements || [],
      });
      setOverrideReason('');
    }
  }, [task]);
  
  const updateTaskMutation = useMutation({
    mutationFn: (data) => maintenanceProgramAPI.updateTask(equipmentId, task.id, data),
    onSuccess: (response) => {
      toast.success('Task updated successfully');
      onSuccess?.(response);
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to update task: ${error.message}`);
    },
  });
  
  const handleSubmit = () => {
    const updates = { ...formData };
    if (task.task_source === 'strategy_generated' && overrideReason) {
      updates.override_reason = overrideReason;
    }
    if (showSpareParts && updates.spare_part_requirements) {
      updates.spare_part_requirements = updates.spare_part_requirements.map((req) => ({
        spare_part_id: req.spare_part_id,
        quantity: req.quantity || 1,
      }));
    } else {
      delete updates.spare_part_requirements;
    }
    updateTaskMutation.mutate(updates);
  };
  
  if (!formData) return null;
  
  const isStrategyTask = task?.task_source === 'strategy_generated';
  const showSpareParts = taskConsumesSpareParts({ ...task, ...formData });
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-600" />
            Edit Task
          </DialogTitle>
          {isStrategyTask && (
            <DialogDescription className="text-amber-600">
              This is a strategy-generated task. Changes will be tracked as overrides.
            </DialogDescription>
          )}
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label>Task Title</Label>
            <Input
              value={formData.task_title}
              onChange={(e) => setFormData(prev => ({ ...prev, task_title: e.target.value }))}
            />
          </div>
          
          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.task_description}
              onChange={(e) => setFormData(prev => ({ ...prev, task_description: e.target.value }))}
              rows={2}
            />
          </div>
          
          <div className={FORM_GRID_CLASS}>
            <div>
              <Label>Frequency</Label>
              <Select 
                value={formData.frequency}
                onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Duration (hours)</Label>
              <Input
                type="number"
                min="0.25"
                step="0.25"
                value={formData.estimated_duration_hours}
                onChange={(e) => setFormData(prev => ({ ...prev, estimated_duration_hours: parseFloat(e.target.value) || 1 }))}
              />
            </div>
          </div>
          
          <div className={FORM_GRID_CLASS}>
            <div>
              <Label>Category</Label>
              <Select 
                value={formData.task_category}
                onValueChange={(value) => setFormData(prev => ({ ...prev, task_category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Priority</Label>
              <Select 
                value={formData.priority}
                onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <Label className="text-sm">Task enabled</Label>
              <p className="text-xs text-slate-500">Disabled tasks stay in the program but are not active.</p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
            />
          </div>

          {isStrategyTask && (
            <div>
              <Label>Override Reason</Label>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why this task is being modified..."
                rows={2}
              />
            </div>
          )}

          {showSpareParts && (
            <SparePartRequirementsEditor
              equipmentId={equipmentId}
              requirements={formData.spare_part_requirements || []}
              onChange={(spare_part_requirements) =>
                setFormData((prev) => ({ ...prev, spare_part_requirements }))
              }
            />
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateTaskMutation.isPending}>
            {updateTaskMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Version History Dialog
const VersionHistoryDialog = ({ open, onClose, equipmentId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-program-version-history', equipmentId],
    queryFn: () => maintenanceProgramAPI.getVersionHistory(equipmentId),
    enabled: open && !!equipmentId,
  });
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" />
            Version History
          </DialogTitle>
          <DialogDescription>
            Current Version: {data?.current_version || '1.0'}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[min(50dvh,400px)] sm:h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.version_history || []).map((entry, idx) => (
                <div key={idx} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      v{entry.version}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {entry.changed_at ? new Date(entry.changed_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="text-sm font-medium capitalize">{entry.change_type?.replace('_', ' ')}</div>
                  <div className="text-sm text-gray-600 mt-1">{entry.change_summary}</div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    {entry.tasks_added > 0 && <span className="text-green-600">+{entry.tasks_added} added</span>}
                    {entry.tasks_modified > 0 && <span className="text-amber-600">{entry.tasks_modified} modified</span>}
                    {entry.tasks_removed > 0 && <span className="text-red-600">-{entry.tasks_removed} removed</span>}
                  </div>
                </div>
              ))}
              {(!data?.version_history || data.version_history.length === 0) && (
                <div className="text-center text-gray-500 py-8">
                  No version history available
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Main Component
const MaintenanceProgramPanel = ({ equipmentId, equipmentName }) => {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showDisabledTasks, setShowDisabledTasks] = useState(true);
  const [aiPayload, setAiPayload] = useState(null);
  const [acceptedAiIds, setAcceptedAiIds] = useState(new Set());
  
  // Fetch program
  const { data: programData, isLoading: isLoadingProgram, error: programError } = useQuery({
    queryKey: ['maintenance-program', equipmentId],
    queryFn: () => maintenanceProgramAPI.getProgram(equipmentId),
    enabled: !!equipmentId,
  });
  
  // Create / sync program mutation
  const syncProgramMutation = useMutation({
    mutationFn: () => maintenanceProgramAPI.createProgram(equipmentId, { 
      generate_from_strategy: true 
    }),
    onSuccess: () => {
      toast.success(t('equipment.programSyncSuccess'));
      queryClient.invalidateQueries({ queryKey: ['maintenance-program', equipmentId] });
      refreshMaintenanceSchedulerQueries(queryClient);
    },
    onError: (error) => {
      toast.error(`${t('equipment.programSyncFailed')}: ${error.message}`);
    },
  });

  // Delete program mutation
  const deleteProgramMutation = useMutation({
    mutationFn: () => maintenanceProgramAPI.deleteProgram(equipmentId),
    onSuccess: (data) => {
      const cancelled = data?.scheduled_tasks_cancelled ?? 0;
      toast.success(
        cancelled > 0
          ? `Maintenance program deleted (${cancelled} scheduled task(s) cancelled)`
          : 'Maintenance program deleted',
      );
      queryClient.invalidateQueries({ queryKey: ['maintenance-program', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-program'] });
      refreshMaintenanceSchedulerQueries(queryClient);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || error.message || 'Failed to delete program');
    },
  });
  
  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: (taskId) => maintenanceProgramAPI.deleteTask(equipmentId, taskId),
    onSuccess: () => {
      toast.success('Task deleted');
      queryClient.invalidateQueries({ queryKey: ['maintenance-program', equipmentId] });
      refreshMaintenanceSchedulerQueries(queryClient);
    },
    onError: (error) => {
      toast.error(`Failed to delete task: ${error.message}`);
    },
  });
  
  const canMutateTasks = Boolean(programData?.exists);

  // Toggle task active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ task, wasActive }) =>
      maintenanceProgramAPI.updateTask(equipmentId, task.id, { is_active: !wasActive }),
    onMutate: async ({ task, wasActive }) => {
      await queryClient.cancelQueries({ queryKey: ['maintenance-program', equipmentId] });
      const previous = queryClient.getQueryData(['maintenance-program', equipmentId]);
      const nextActive = !wasActive;

      queryClient.setQueryData(['maintenance-program', equipmentId], (old) => {
        if (!old?.program?.tasks) return old;
        const tasks = old.program.tasks.map((t) =>
          t.id === task.id ? { ...t, is_active: nextActive } : t,
        );
        const active_tasks = tasks.filter((t) => t.is_active !== false).length;
        return {
          ...old,
          program: {
            ...old.program,
            tasks,
            active_tasks,
          },
        };
      });

      return { previous };
    },
    onSuccess: (data, { wasActive }) => {
      toast.success(wasActive ? 'Task disabled' : 'Task enabled');

      if (data?.task) {
        queryClient.setQueryData(['maintenance-program', equipmentId], (old) => {
          if (!old?.program?.tasks) return old;
          const tasks = old.program.tasks.map((t) =>
            t.id === data.task.id ? { ...t, ...data.task } : t,
          );
          const active_tasks = tasks.filter((t) => t.is_active !== false).length;
          return {
            ...old,
            program: {
              ...old.program,
              tasks,
              active_tasks,
              version: data.version ?? old.program.version,
            },
          };
        });
      }

      void refreshMaintenanceSchedulerQueries(queryClient);
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['maintenance-program', equipmentId], context.previous);
      }
      toast.error(error.response?.data?.detail || error.message || 'Failed to update task');
    },
  });
  
  const generateAiMutation = useMutation({
    mutationFn: () => maintenanceProgramAPI.generateAIRecommendations(equipmentId),
    onSuccess: (data) => {
      setAiPayload(data);
      setAcceptedAiIds(new Set());
      const count = data?.recommendations?.length ?? 0;
      toast.success(
        count
          ? `Generated ${count} AI maintenance recommendations`
          : 'AI analysis complete',
      );
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || error.message || 'Failed to generate AI recommendations');
    },
  });

  const acceptAiMutation = useMutation({
    mutationFn: (task) => maintenanceProgramAPI.acceptAIRecommendation(equipmentId, task),
    onSuccess: (_data, task) => {
      setAcceptedAiIds((prev) => new Set([...prev, task.id]));
      queryClient.invalidateQueries({ queryKey: ['maintenance-program', equipmentId] });
      refreshMaintenanceSchedulerQueries(queryClient);
      toast.success(`Accepted "${task.task_title}"`);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || error.message || 'Failed to accept recommendation');
    },
  });

  // Regenerate mutation
  const regenerateMutation = useMutation({
    mutationFn: () => maintenanceProgramAPI.regenerateProgram(equipmentId, {
      preserve_overrides: true,
      preserve_manual_tasks: true,
    }),
    onSuccess: (response) => {
      const changes = response.changes || {};
      toast.success(`Program regenerated: ${changes.tasks_to_add?.length || 0} added, ${changes.tasks_to_remove?.length || 0} removed`);
      queryClient.invalidateQueries({ queryKey: ['maintenance-program', equipmentId] });
      refreshMaintenanceSchedulerQueries(queryClient);
    },
    onError: (error) => {
      toast.error(`Failed to regenerate: ${error.message}`);
    },
  });
  
  // Filter and search tasks
  const filteredTasks = useMemo(() => {
    if (!programData?.program?.tasks) return [];
    
    let tasks = programData.program.tasks;
    
    // Apply source filter
    if (sourceFilter !== 'all') {
      tasks = tasks.filter(t => t.task_source === sourceFilter);
    }
    
    if (!showDisabledTasks) {
      tasks = tasks.filter((t) => t.is_active !== false);
    }

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      tasks = tasks.filter(t => 
        t.task_title?.toLowerCase().includes(term) ||
        t.task_description?.toLowerCase().includes(term) ||
        t.traceability?.failure_mode_name?.toLowerCase().includes(term)
      );
    }
    
    return tasks;
  }, [programData?.program?.tasks, sourceFilter, searchTerm, showDisabledTasks]);
  
  // Stats from program
  const stats = programData?.program ? {
    total: programData.program.total_tasks || 0,
    active: programData.program.active_tasks || 0,
    strategy: programData.program.strategy_tasks || 0,
    imported: programData.program.imported_tasks || 0,
    ai: programData.program.ai_tasks || 0,
    manual: programData.program.manual_tasks || 0,
  } : null;
  
  // Toggle task expansion
  const toggleExpand = (taskId) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };
  
  // Handle task operations
  const handleDeleteTask = (task) => {
    if (task.is_pm_import_pending) {
      toast.info('This task comes from Custom PM Import. Edit or remove it in Library → PM Import.');
      return;
    }
    if (window.confirm(`Delete task "${task.task_title}"?`)) {
      deleteTaskMutation.mutate(task.id);
    }
  };
  
  const handleTaskSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance-program', equipmentId] });
    refreshMaintenanceSchedulerQueries(queryClient);
  };
  
  if (isLoadingProgram) {
    return (
      <div className={PANEL_ROOT_CLASS}>
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const hasTaskList =
    programData?.has_tasks ||
    (programData?.program?.tasks?.length ?? 0) > 0;

  // No stored program and no PM Import tasks for this equipment
  if (!programData?.exists && !hasTaskList) {
    return (
      <div className={PANEL_ROOT_CLASS}>
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-64 gap-4">
          <ClipboardList className="h-16 w-16 text-gray-300" />
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-700">No Maintenance Program</h3>
            <p className="text-sm text-gray-500 mt-1">
              Create a maintenance program to manage tasks for this equipment.
            </p>
          </div>
          <Button 
            onClick={() => syncProgramMutation.mutate()}
            disabled={syncProgramMutation.isPending}
          >
            {syncProgramMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> {t('equipment.programSyncing')}</>
            ) : (
              <><Plus className="h-4 w-4 mr-2" /> {t('equipment.programCreateProgram')}</>
            )}
          </Button>
        </CardContent>
      </Card>
      </div>
    );
  }
  
  const program = programData.program;
  const pmImportOnly = !programData?.exists && hasTaskList;
  
  return (
    <div className={PANEL_ROOT_CLASS}>
      <ProgramCriticalityBanner
        program={program}
        strategyUpdateAvailable={programData.strategy_update_available}
        t={t}
      />

      {/* Header — title lives in dialog chrome on mobile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="hidden sm:flex items-start gap-3 min-w-0">
          <ClipboardList className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold break-words">{program.program_name}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <StatusBadge status={program.status} />
              <span className="text-xs text-gray-500">v{program.version}</span>
              {pmImportOnly && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 text-xs">
                  Includes Custom PM Import tasks
                </Badge>
              )}
              {programData.strategy_update_available && (
                <Badge variant="outline" className="bg-amber-50 text-amber-600 text-xs">
                  Strategy Update Available
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:hidden min-w-0">
          <StatusBadge status={program.status} />
          <span className="text-[10px] text-gray-500">v{program.version}</span>
          {pmImportOnly && (
            <Badge variant="outline" className="bg-purple-50 text-purple-700 text-[10px] px-1.5 py-0">
              PM Import
            </Badge>
          )}
          {programData.strategy_update_available && (
            <Badge variant="outline" className="bg-amber-50 text-amber-600 text-[10px] px-1.5 py-0">
              Update
            </Badge>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:justify-end">
          {!pmImportOnly && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                      onClick={() => setShowVersionHistory(true)}
                      aria-label={t('tooltips.versionHistory')}
                    >
                      <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('tooltips.versionHistory')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                      onClick={() => regenerateMutation.mutate()}
                      disabled={regenerateMutation.isPending}
                      aria-label={t('tooltips.regenerateFromStrategy')}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('tooltips.regenerateFromStrategy')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}

          {programData?.exists && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const ok = window.confirm(
                  'Delete this maintenance program? Open scheduled tasks for this equipment will be cancelled.',
                );
                if (ok) deleteProgramMutation.mutate();
              }}
              disabled={deleteProgramMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              {deleteProgramMutation.isPending ? (
                <RefreshCw className="h-4 w-4 sm:mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">Delete Program</span>
            </Button>
          )}
          
          {!pmImportOnly && (
            <Button size="sm" className="flex-1 sm:flex-none h-8 text-xs sm:text-sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Task</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
          {pmImportOnly && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none h-8 text-xs sm:text-sm"
              onClick={() => syncProgramMutation.mutate()}
              disabled={syncProgramMutation.isPending}
            >
              {syncProgramMutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2 animate-spin" /> <span className="hidden sm:inline">{t('equipment.programSyncing')}</span></>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2" /> {t('equipment.programSync')}</>
              )}
            </Button>
          )}
        </div>
      </div>
      
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1 sm:gap-3">
          <Card className="p-1.5 sm:p-3 min-w-0">
            <div className="text-base sm:text-2xl font-bold text-gray-900 leading-none">{stats.total}</div>
            <div className="text-[9px] sm:text-xs text-gray-500 mt-0.5 leading-tight">
              <span className="sm:hidden">Total</span>
              <span className="hidden sm:inline">Total Tasks</span>
            </div>
          </Card>
          <Card className="p-1.5 sm:p-3 min-w-0">
            <div className="text-base sm:text-2xl font-bold text-green-600 leading-none">{stats.active}</div>
            <div className="text-[9px] sm:text-xs text-gray-500 mt-0.5 leading-tight">Active</div>
          </Card>
          <Card className="p-1.5 sm:p-3 min-w-0">
            <div className="text-base sm:text-2xl font-bold text-blue-600 leading-none">{stats.strategy}</div>
            <div className="text-[9px] sm:text-xs text-gray-500 mt-0.5 leading-tight">
              <span className="sm:hidden">Strategy</span>
              <span className="hidden sm:inline">From Strategy</span>
            </div>
          </Card>
          <Card className="p-1.5 sm:p-3 min-w-0">
            <div className="text-base sm:text-2xl font-bold text-purple-600 leading-none">{stats.imported}</div>
            <div className="text-[9px] sm:text-xs text-gray-500 mt-0.5 leading-tight">Imported</div>
          </Card>
          <Card className="p-1.5 sm:p-3 min-w-0">
            <div className="text-base sm:text-2xl font-bold text-amber-600 leading-none">{stats.ai}</div>
            <div className="text-[9px] sm:text-xs text-gray-500 mt-0.5 leading-tight">
              <span className="sm:hidden">AI</span>
              <span className="hidden sm:inline">AI Generated</span>
            </div>
          </Card>
          <Card className="p-1.5 sm:p-3 min-w-0">
            <div className="text-base sm:text-2xl font-bold text-green-600 leading-none">{stats.manual}</div>
            <div className="text-[9px] sm:text-xs text-gray-500 mt-0.5 leading-tight">Manual</div>
          </Card>
        </div>
      )}
      
      {canMutateTasks && !pmImportOnly && (
        <Card data-testid="maintenance-program-ai-panel">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  AI Maintenance Recommendations
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Generate grounded task suggestions from failure history and equipment context
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => generateAiMutation.mutate()}
                disabled={generateAiMutation.isPending}
                data-testid="maintenance-program-generate-ai-btn"
                className="w-full sm:w-auto"
              >
                {generateAiMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {aiPayload?.recommendations?.length || aiPayload?.summary ? (
              <div className="space-y-4">
                <AIRecommendationCard payload={aiPayload} compact />
                {(aiPayload.recommendations || []).length > 0 && (
                  <div className="space-y-2" data-testid="maintenance-program-ai-task-list">
                    <p className="text-xs font-medium text-slate-700">Suggested tasks</p>
                    {(aiPayload.recommendations || []).map((rec, idx) => {
                      const accepted = acceptedAiIds.has(rec.id);
                      return (
                        <div
                          key={rec.id || `ai-rec-${idx}`}
                          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-slate-100 bg-slate-50 p-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{rec.task_title}</p>
                            {rec.task_description && (
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{rec.task_description}</p>
                            )}
                            {rec.traceability?.ai_reasoning && (
                              <p className="text-[10px] text-slate-400 mt-1">{rec.traceability.ai_reasoning}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={accepted ? 'outline' : 'default'}
                            className="shrink-0"
                            disabled={accepted || acceptAiMutation.isPending}
                            onClick={() => acceptAiMutation.mutate(rec)}
                            data-testid={`maintenance-program-accept-ai-${rec.id || idx}`}
                          >
                            {accepted ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                Accepted
                              </>
                            ) : (
                              'Accept'
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-gray-500">
                <Brain className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                Click Generate to get AI-powered maintenance task recommendations
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0">
        <div className="relative flex-1 w-full min-w-0">
          <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tasks..."
            className="pl-8 sm:pl-9 h-8 sm:h-10 text-xs sm:text-sm"
          />
        </div>
        
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-48 h-8 sm:h-10 text-xs sm:text-sm">
            <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="strategy_generated">Strategy</SelectItem>
            <SelectItem value="customer_imported">Imported</SelectItem>
            <SelectItem value="ai_generated">AI Generated</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 shrink-0">
          <Switch
            id="show-disabled-tasks"
            checked={showDisabledTasks}
            onCheckedChange={setShowDisabledTasks}
            className="scale-90 sm:scale-100"
          />
          <Label htmlFor="show-disabled-tasks" className="text-[10px] sm:text-xs text-gray-600 cursor-pointer">
            Show disabled
          </Label>
        </div>
      </div>
      
      {/* Tasks List */}
      <Card>
        <CardContent className={isMobile ? 'p-2' : 'p-4'}>
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <ClipboardList className="h-12 w-12 mb-3 text-gray-300" />
              <div className="text-center">
                <div className="font-medium">No tasks found</div>
                <div className="text-sm mt-1">
                  {searchTerm || sourceFilter !== 'all' 
                    ? 'Try adjusting your filters' 
                    : 'Add tasks to get started'}
                </div>
              </div>
            </div>
          ) : (
            <div>
              {filteredTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isExpanded={expandedTasks.has(task.id)}
                  onToggleExpand={() => toggleExpand(task.id)}
                  onEdit={setEditingTask}
                  onDelete={handleDeleteTask}
                  canToggle={canMutateTasks && !task.is_pm_import_pending}
                  isTogglePending={
                    toggleActiveMutation.isPending &&
                    toggleActiveMutation.variables?.task?.id === task.id
                  }
                  onToggleActive={(t, wasActive) => toggleActiveMutation.mutate({ task: t, wasActive })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Dialogs */}
      <AddTaskDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        equipmentId={equipmentId}
        onSuccess={handleTaskSuccess}
      />
      
      <EditTaskDialog
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        task={editingTask}
        equipmentId={equipmentId}
        onSuccess={handleTaskSuccess}
      />
      
      <VersionHistoryDialog
        open={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        equipmentId={equipmentId}
      />
    </div>
  );
};

export default MaintenanceProgramPanel;
