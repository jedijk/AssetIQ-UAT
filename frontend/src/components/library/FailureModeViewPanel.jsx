import { getBackendUrl } from '../../lib/apiConfig';
import { useState, useEffect } from "react";
import { formatDate } from "../../lib/dateUtils";
import { 
  AlertTriangle, Edit, Trash2, X, Plus, Link, CheckCircle, 
  User, Briefcase, Calendar, History, RotateCcw, Clock, ShieldCheck,
  Cog, Thermometer, Activity, Zap, Shield, Leaf, Maximize2, Minimize2, Image
} from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";

const categoryIcons = {
  Rotating: Cog,
  Static: Thermometer,
  Piping: Activity,
  Instrumentation: Zap,
  Electrical: Zap,
  Process: Activity,
  Safety: Shield,
  Environment: Leaf,
  Extruder: Cog,
};

const categoryColors = {
  Rotating: "bg-blue-100 text-blue-700 border-blue-200",
  Static: "bg-purple-100 text-purple-700 border-purple-200",
  Piping: "bg-orange-100 text-orange-700 border-orange-200",
  Instrumentation: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Electrical: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Process: "bg-slate-100 text-slate-700 border-slate-200",
  Safety: "bg-red-100 text-red-700 border-red-200",
  Environment: "bg-green-100 text-green-700 border-green-200",
  Extruder: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

const DISCIPLINE_OPTIONS = [
  { value: "mechanical", label: "Mechanical" },
  { value: "electrical", label: "Electrical" },
  { value: "instrumentation", label: "Instrumentation" },
  { value: "process", label: "Process" },
  { value: "civil", label: "Civil/Structural" },
  { value: "operations", label: "Operations" },
  { value: "laboratory", label: "Laboratory" },
];

const ACTION_TYPE_OPTIONS = [
  { value: "PM", label: "PM (Preventive)", color: "bg-blue-100 text-blue-700" },
  { value: "CM", label: "CM (Corrective)", color: "bg-amber-100 text-amber-700" },
  { value: "PDM", label: "PDM (Predictive)", color: "bg-purple-100 text-purple-700" },
];

export function FailureModeViewPanel({ 
  fm, 
  isEditing, 
  formData, 
  setFormData, 
  onStartEdit, 
  onSave, 
  onCancel, 
  onClose,
  onDelete,
  onValidate,
  onUnvalidate,
  onShowVersionHistory,
  equipmentTypes,
  categories,
  currentUser,
  t,
  isFullscreen = false,
  onToggleFullscreen
}) {
  const Icon = categoryIcons[fm?.category] || AlertTriangle;
  const colors = categoryColors[fm?.category] || "bg-slate-100 text-slate-700 border-slate-200";
  
  // Local state for adding keywords/actions in edit mode
  const [keywordInput, setKeywordInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [actionMinutes, setActionMinutes] = useState("");
  
  // Validation dialog state
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validatorName, setValidatorName] = useState("");
  const [validatorPosition, setValidatorPosition] = useState("");
  
  // State for action discipline and type in inline editing
  const [actionDiscipline, setActionDiscipline] = useState("mechanical");
  const [actionType, setActionType] = useState("PM");
  
  // Avatar URL state for validated user
  const [validatorAvatarUrl, setValidatorAvatarUrl] = useState(null);
  // Current user avatar for validation dialog
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState(null);

  // Auto-fill validator info from current user when dialog opens
  useEffect(() => {
    if (showValidationDialog && currentUser) {
      setValidatorName(currentUser.name || "");
      setValidatorPosition(currentUser.position || "");
    }
  }, [showValidationDialog, currentUser]);
  
  // Fetch current user avatar for validation dialog
  useEffect(() => {
    let objectUrl = null;
    const fetchCurrentUserAvatar = async () => {
      if (!currentUser?.id) return;
      try {
        const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"
        const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
        const backendUrl = getBackendUrl();
        if (!backendUrl || !backendUrl.startsWith('http')) return;
        
        const url = AUTH_MODE === "cookie"
          ? `${backendUrl}/api/users/${currentUser.id}/avatar`
          : `${backendUrl}/api/users/${currentUser.id}/avatar?token=${token}`;
        const response = await fetch(url, {
          credentials: AUTH_MODE === "cookie" ? "include" : "omit",
          headers: {
            ...(AUTH_MODE === "bearer" && token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (response.ok) {
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          setCurrentUserAvatarUrl(objectUrl);
        }
      } catch (err) {
        // No avatar available
      }
    };
    fetchCurrentUserAvatar();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentUser?.id]);
  
  // Fetch validator avatar when viewing validated failure mode
  useEffect(() => {
    let objectUrl = null;
    const fetchValidatorAvatar = async () => {
      if (!fm?.validated_by_id) {
        setValidatorAvatarUrl(null);
        return;
      }
      try {
        const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"
        const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
        const backendUrl = getBackendUrl();
        if (!backendUrl || !backendUrl.startsWith('http')) return;
        
        const url = AUTH_MODE === "cookie"
          ? `${backendUrl}/api/users/${fm.validated_by_id}/avatar`
          : `${backendUrl}/api/users/${fm.validated_by_id}/avatar?token=${token}`;
        const response = await fetch(url, {
          credentials: AUTH_MODE === "cookie" ? "include" : "omit",
          headers: {
            ...(AUTH_MODE === "bearer" && token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (response.ok) {
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          setValidatorAvatarUrl(objectUrl);
        } else {
          setValidatorAvatarUrl(null);
        }
      } catch (err) {
        setValidatorAvatarUrl(null);
      }
    };
    fetchValidatorAvatar();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fm?.validated_by_id]);

  const addKeyword = () => {
    if (keywordInput.trim() && formData) {
      setFormData({ ...formData, keywords: [...(formData.keywords || []), keywordInput.trim()] });
      setKeywordInput("");
    }
  };
  
  const removeKeyword = (idx) => {
    if (formData) {
      setFormData({ ...formData, keywords: formData.keywords.filter((_, i) => i !== idx) });
    }
  };
  
  const addAction = () => {
    if (actionInput.trim() && formData) {
      const minutes = actionMinutes === "" ? null : parseInt(actionMinutes, 10);
      const newAction = {
        description: actionInput.trim(),
        discipline: actionDiscipline,
        action_type: actionType,
        estimated_minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : null,
        auto_create: false  // Default to false, user can enable it
      };
      setFormData({ ...formData, recommended_actions: [...(formData.recommended_actions || []), newAction] });
      setActionInput("");
      setActionMinutes("");
    }
  };
  
  const removeAction = (idx) => {
    if (formData) {
      setFormData({ ...formData, recommended_actions: formData.recommended_actions.filter((_, i) => i !== idx) });
    }
  };

  const toggleActionAutoCreate = (idx) => {
    if (formData && formData.recommended_actions) {
      const updatedActions = formData.recommended_actions.map((action, i) => {
        if (i === idx) {
          const isObject = typeof action === 'object';
          if (isObject) {
            return { ...action, auto_create: !action.auto_create };
          }
          // Convert string action to object with auto_create
          return { description: action, auto_create: true };
        }
        return action;
      });
      setFormData({ ...formData, recommended_actions: updatedActions });
    }
  };

  const setActionEstimatedMinutes = (idx, raw) => {
    if (!formData?.recommended_actions) return;
    const next = formData.recommended_actions.map((action, i) => {
      if (i !== idx) return action;
      const isObject = typeof action === "object" && action !== null;
      const base = isObject ? action : { description: action };
      const minutes = raw === "" ? null : parseInt(raw, 10);
      return {
        ...base,
        estimated_minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : null,
      };
    });
    setFormData({ ...formData, recommended_actions: next });
  };

  if (!fm) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
        <div className="text-center p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-2">{t("library.selectFailureMode")}</h3>
          <p className="text-sm text-slate-400">{t("library.selectFailureModeDesc")}</p>
        </div>
      </div>
    );
  }

  const rpn = fm.severity * fm.occurrence * fm.detectability;
  const data = isEditing ? formData : fm;

  return (
    <div className={`${isFullscreen ? 'h-screen w-screen' : 'h-full'} bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden`} data-testid="failure-mode-view-panel">
      {/* Header */}
      <div className={`${isFullscreen ? 'px-6 py-4' : 'p-4'} border-b border-slate-200 flex items-center gap-3`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.split(' ')[0]}`}>
          <Icon className={`w-6 h-6 ${colors.split(' ')[1]}`} />
        </div>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              value={formData?.failure_mode || ""}
              onChange={(e) => setFormData({ ...formData, failure_mode: e.target.value })}
              className="font-semibold text-lg"
              placeholder={t("library.failureModeName")}
              data-testid="view-panel-name-input"
            />
          ) : (
            <>
              <h2 className="font-semibold text-slate-900 text-lg truncate">{fm.failure_mode}</h2>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>{fm.category}</span>
                {fm.version && (
                  <Badge variant="outline" className="text-xs py-0 px-1.5">
                    v{fm.version}
                  </Badge>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => onShowVersionHistory(fm.id)}
                className="text-slate-500 hover:text-blue-600"
                title="View version history"
              >
                <History className="w-4 h-4" />
              </Button>
              {onToggleFullscreen && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={onToggleFullscreen}
                  className="text-slate-500 hover:text-blue-600"
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  data-testid="toggle-fullscreen-btn"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onStartEdit} data-testid="view-panel-edit-btn">
                <Edit className="w-4 h-4 mr-1" /> {t("common.edit")}
              </Button>
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(fm.id)} data-testid="view-panel-delete-btn">
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
              <Button size="sm" onClick={onSave} className="bg-blue-600 hover:bg-blue-700" data-testid="view-panel-save-btn">
                <ShieldCheck className="w-4 h-4 mr-1" /> {t("common.save")}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} className="ml-2">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className={`flex-1 overflow-y-auto ${isFullscreen ? 'p-6 max-w-5xl mx-auto' : 'p-4'} space-y-6`}>
        {/* RPN Score Card */}
        <div className="grid grid-cols-4 gap-3">
          <div className={`bg-gradient-to-br rounded-xl p-4 text-center ${
            rpn >= 200 ? 'from-red-50 to-red-100' :
            rpn >= 125 ? 'from-orange-50 to-orange-100' :
            rpn >= 80 ? 'from-yellow-50 to-yellow-100' :
            'from-green-50 to-green-100'
          }`}>
            <div className={`text-2xl font-bold ${
              rpn >= 200 ? 'text-red-700' :
              rpn >= 125 ? 'text-orange-700' :
              rpn >= 80 ? 'text-yellow-700' :
              'text-green-700'
            }`}>{rpn}</div>
            <div className="text-xs text-slate-500 mt-1">RPN</div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 text-center">
            {isEditing ? (
              <Select value={String(formData?.severity || 5)} onValueChange={(v) => setFormData({ ...formData, severity: parseInt(v) })}>
                <SelectTrigger className="h-8 text-lg font-bold text-red-700 border-0 bg-transparent justify-center"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <div className="text-2xl font-bold text-red-700">{fm.severity}</div>
            )}
            <div className="text-xs text-red-600 mt-1">{t("library.severity")}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 text-center">
            {isEditing ? (
              <Select value={String(formData?.occurrence || 5)} onValueChange={(v) => setFormData({ ...formData, occurrence: parseInt(v) })}>
                <SelectTrigger className="h-8 text-lg font-bold text-amber-700 border-0 bg-transparent justify-center"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <div className="text-2xl font-bold text-amber-700">{fm.occurrence}</div>
            )}
            <div className="text-xs text-amber-600 mt-1">{t("library.occurrence")}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 text-center">
            {isEditing ? (
              <Select value={String(formData?.detectability || 5)} onValueChange={(v) => setFormData({ ...formData, detectability: parseInt(v) })}>
                <SelectTrigger className="h-8 text-lg font-bold text-blue-700 border-0 bg-transparent justify-center"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <div className="text-2xl font-bold text-blue-700">{fm.detectability}</div>
            )}
            <div className="text-xs text-blue-600 mt-1">{t("library.detectability")}</div>
          </div>
        </div>

        {/* Failure Mode Type Indicator */}
        <div className="flex items-center gap-3">
          {isEditing ? (
            <div className="flex gap-2 flex-1">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, failure_mode_type: "generic" })}
                className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center gap-2 ${
                  (formData?.failure_mode_type || "generic") === "generic"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className={`text-sm font-medium ${(formData?.failure_mode_type || "generic") === "generic" ? "text-blue-700" : "text-slate-600"}`}>
                  Generic (Industry)
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, failure_mode_type: "customer_specific" })}
                className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center gap-2 ${
                  formData?.failure_mode_type === "customer_specific"
                    ? "border-purple-500 bg-purple-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span className={`text-sm font-medium ${formData?.failure_mode_type === "customer_specific" ? "text-purple-700" : "text-slate-600"}`}>
                  Customer Specific
                </span>
              </button>
            </div>
          ) : (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${
              fm.failure_mode_type === "customer_specific" 
                ? "bg-purple-100 text-purple-700" 
                : "bg-blue-100 text-blue-700"
            }`}>
              <div className={`w-2 h-2 rounded-full ${fm.failure_mode_type === "customer_specific" ? "bg-purple-500" : "bg-blue-500"}`}></div>
              <span className="text-sm font-medium">
                {fm.failure_mode_type === "customer_specific" ? "Customer Specific" : "Generic (Industry)"}
              </span>
            </div>
          )}
        </div>

        {/* Validation Status */}
        {fm.is_validated ? (
          <div className="flex items-center gap-4 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
            {/* Validator Photo */}
            <div className="flex-shrink-0">
              {validatorAvatarUrl ? (
                <img
                  src={validatorAvatarUrl}
                  alt={fm.validated_by_name || fm.validated_by}
                  className="w-11 h-11 rounded-full object-cover border-2 border-green-300 shadow-sm"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div 
                className={`w-11 h-11 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 items-center justify-center text-white font-semibold text-lg border-2 border-green-300 shadow-sm ${validatorAvatarUrl ? 'hidden' : 'flex'}`}
              >
                {(fm.validated_by_name || fm.validated_by)?.charAt(0)?.toUpperCase() || "V"}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              {/* Row 1: Validated + Date */}
              <div className="flex items-center gap-3 mb-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">{t("library.validated")}</span>
                </div>
                <span className="text-xs text-green-500">•</span>
                <div className="flex items-center gap-1 text-xs text-green-500">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(fm.validated_at)}</span>
                </div>
              </div>
              {/* Row 2: Name + Position */}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-green-700">{fm.validated_by_name || fm.validated_by}</span>
                <span className="text-green-400">•</span>
                <span className="text-green-600">{fm.validated_by_position || fm.validated_position}</span>
              </div>
            </div>
            {!isEditing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onUnvalidate(fm.id)}
                className="text-green-700 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                title="Remove validation"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-slate-500" />
            </div>
            <span className="text-sm text-slate-600 flex-1">{t("library.pendingValidation")}</span>
            {!isEditing && (
              <Button
                size="sm"
                onClick={() => setShowValidationDialog(true)}
                className="bg-green-600 hover:bg-green-700"
                data-testid="validate-fm-btn"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {t("library.validate")}
              </Button>
            )}
          </div>
        )}

        {/* Category & Equipment */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-slate-500 mb-2 block">{t("library.category")}</Label>
            {isEditing ? (
              <Select value={formData?.category || ""} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue placeholder={t("library.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className={`${colors} px-3 py-1`}>
                <Icon className="w-4 h-4 mr-1.5" />{fm.category}
              </Badge>
            )}
          </div>
          <div>
            <Label className="text-xs text-slate-500 mb-2 block">{t("library.equipment")}</Label>
            {isEditing ? (
              <Select 
                value={formData?.equipment || ""} 
                onValueChange={(v) => setFormData({ ...formData, equipment: v })}
              >
                <SelectTrigger><SelectValue placeholder={t("library.equipmentPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {/* Show unique equipment values from existing failure modes or use equipment types */}
                  {equipmentTypes.map(et => (
                    <SelectItem key={et.id} value={et.name}>{et.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm text-slate-700">{fm.equipment || "—"}</span>
            )}
          </div>
        </div>

        {/* Process */}
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">{t("library.process")}</Label>
          {isEditing ? (
            <Input
              value={formData?.process || ""}
              onChange={(e) => setFormData({ ...formData, process: e.target.value })}
              placeholder={t("library.processPlaceholder")}
            />
          ) : (
            <span className="text-sm text-slate-700">{fm.process || "—"}</span>
          )}
        </div>

        {/* Potential Effects */}
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">{t("library.potentialEffects")}</Label>
          {isEditing ? (
            <Input
              value={Array.isArray(formData?.potential_effects) ? formData.potential_effects.join(", ") : (formData?.potential_effects || "")}
              onChange={(e) => setFormData({ ...formData, potential_effects: e.target.value })}
              placeholder={t("library.potentialEffectsPlaceholder")}
            />
          ) : (
            <span className="text-sm text-slate-700">
              {Array.isArray(fm.potential_effects) ? fm.potential_effects.join(", ") : (fm.potential_effects || "—")}
            </span>
          )}
        </div>

        {/* Potential Causes */}
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">{t("library.potentialCauses")}</Label>
          {isEditing ? (
            <Input
              value={Array.isArray(formData?.potential_causes) ? formData.potential_causes.join(", ") : (formData?.potential_causes || "")}
              onChange={(e) => setFormData({ ...formData, potential_causes: e.target.value })}
              placeholder={t("library.potentialCausesPlaceholder")}
            />
          ) : (
            <span className="text-sm text-slate-700">
              {Array.isArray(fm.potential_causes) ? fm.potential_causes.join(", ") : (fm.potential_causes || "—")}
            </span>
          )}
        </div>

        {/* ISO 14224 Mechanism */}
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">{t("library.iso14224Mechanism")}</Label>
          {isEditing ? (
            <Input
              value={formData?.iso14224_mechanism || ""}
              onChange={(e) => setFormData({ ...formData, iso14224_mechanism: e.target.value })}
              placeholder="e.g., Wear, Corrosion, Fatigue"
            />
          ) : (
            <span className="text-sm text-slate-700">{fm.iso14224_mechanism || "—"}</span>
          )}
        </div>

        {/* Keywords */}
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">{t("library.keywords")}</Label>
          <div className="flex flex-wrap gap-2">
            {(isEditing ? formData?.keywords : fm.keywords)?.map((kw, idx) => (
              <Badge key={idx} variant="secondary" className="bg-slate-100 text-slate-600 px-2 py-1">
                {kw}
                {isEditing && (
                  <button onClick={() => removeKeyword(idx)} className="ml-1.5 text-slate-400 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            ))}
            {(!fm.keywords || fm.keywords.length === 0) && !isEditing && (
              <span className="text-sm text-slate-400">{t("library.noKeywords")}</span>
            )}
          </div>
          {isEditing && (
            <div className="flex gap-2 mt-2">
              <Input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                placeholder={t("library.addKeyword")}
                className="flex-1"
              />
              <Button variant="outline" onClick={addKeyword}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Linked Equipment Types */}
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">{t("library.linkedEquipmentTypes")}</Label>
          {isEditing ? (
            <div className="flex flex-wrap gap-2">
              {equipmentTypes.map(et => {
                const isSelected = formData?.equipment_type_ids?.includes(et.id);
                return (
                  <Badge
                    key={et.id}
                    variant={isSelected ? "default" : "outline"}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-600' : 'hover:bg-blue-50'}`}
                    onClick={() => {
                      const current = formData?.equipment_type_ids || [];
                      setFormData({
                        ...formData,
                        equipment_type_ids: isSelected 
                          ? current.filter(id => id !== et.id)
                          : [...current, et.id]
                      });
                    }}
                  >
                    {isSelected && <CheckCircle className="w-3 h-3 mr-1" />}
                    {et.name}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fm.equipment_type_ids?.length > 0 ? (
                fm.equipment_type_ids.map(etId => {
                  const et = equipmentTypes.find(e => e.id === etId);
                  return et ? (
                    <Badge key={etId} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      <Link className="w-3 h-3 mr-1" />{et.name}
                    </Badge>
                  ) : null;
                })
              ) : (
                <span className="text-sm text-slate-400">{t("library.noLinkedTypes")}</span>
              )}
            </div>
          )}
        </div>

        {/* Recommended Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-slate-500">{t("library.recommendedActions")}</Label>
            {!isEditing && fm.recommended_actions?.some(a => a.auto_create) && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Auto-create enabled
              </span>
            )}
          </div>
          <div className="space-y-2">
            {(isEditing ? formData?.recommended_actions : fm.recommended_actions)?.map((action, idx) => {
              const isObject = typeof action === 'object';
              const description = isObject ? (action.action || action.description) : action;
              const discipline = isObject ? action.discipline : null;
              const actType = isObject ? action.action_type : null;
              const autoCreate = isObject ? action.auto_create : false;
              const estMin = isObject ? action.estimated_minutes : null;
              
              const typeColors = {
                PM: "bg-blue-100 text-blue-700",
                CM: "bg-amber-100 text-amber-700",
                PDM: "bg-purple-100 text-purple-700",
              };
              
              return (
                <div key={idx} className={`flex items-start gap-2 p-3 rounded-lg group border ${autoCreate ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                  {/* Auto-create checkbox */}
                  {isEditing ? (
                    <button
                      onClick={() => toggleActionAutoCreate(idx)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        autoCreate 
                          ? 'bg-green-600 border-green-600 text-white' 
                          : 'border-slate-300 hover:border-green-400'
                      }`}
                      title={autoCreate ? "Auto-create enabled" : "Click to auto-create with observation"}
                      data-testid={`action-auto-create-${idx}`}
                    >
                      {autoCreate && <CheckCircle className="w-3 h-3" />}
                    </button>
                  ) : (
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      autoCreate ? 'bg-green-600 text-white' : ''
                    }`}>
                      {autoCreate ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                  )}
                  <div className="flex-1">
                    {(actType || discipline) && (
                      <div className="flex items-center gap-2 mb-1">
                        {actType && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[actType] || 'bg-slate-100 text-slate-600'}`}>
                            {actType}
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
                        {autoCreate && (
                          <span className="text-xs text-green-600 font-medium">Auto-create</span>
                        )}
                      </div>
                    )}
                    <span className="text-sm text-slate-700">{description}</span>
                    {isEditing && (
                      <div className="mt-2 flex items-center gap-2">
                        <Label className="text-xs text-slate-500 whitespace-nowrap">Est. time (min)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={String(isObject && action.estimated_minutes !== undefined && action.estimated_minutes !== null ? action.estimated_minutes : "")}
                          onChange={(e) => setActionEstimatedMinutes(idx, e.target.value)}
                          className="w-24 h-8 text-xs"
                          placeholder="—"
                          data-testid={`view-panel-action-est-minutes-${idx}`}
                        />
                      </div>
                    )}
                  </div>
                  {isEditing && (
                    <button onClick={() => removeAction(idx)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {(!fm.recommended_actions || fm.recommended_actions.length === 0) && !isEditing && (
              <span className="text-sm text-slate-400">{t("library.noRecommendedActions")}</span>
            )}
            {isEditing && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={actionInput}
                    onChange={(e) => setActionInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAction())}
                    placeholder={t("library.addAction")}
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={addAction}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Select value={actionDiscipline} onValueChange={setActionDiscipline}>
                    <SelectTrigger className="w-36 h-9 text-xs">
                      <SelectValue placeholder="Discipline" />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCIPLINE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger className="w-36 h-9 text-xs">
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
                      className="w-24 h-9 text-xs"
                      placeholder="—"
                      data-testid="view-panel-action-est-minutes"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validation Dialog */}
        <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                {t("library.validateFailureMode")}
              </DialogTitle>
              <DialogDescription>
                {t("library.validateFailureModeDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Current User Preview */}
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                {currentUserAvatarUrl ? (
                  <img
                    src={currentUserAvatarUrl}
                    alt={currentUser?.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-blue-300 shadow-sm"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-xl border-2 border-blue-300 shadow-sm">
                    {currentUser?.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{currentUser?.name || "Unknown User"}</p>
                  <p className="text-xs text-slate-500 truncate">{currentUser?.position || "No position set"}</p>
                  <p className="text-xs text-blue-600 mt-1">{t("library.validatingAs") || "Validating as this user"}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">{t("library.validatorName")}</Label>
                <Input
                  value={validatorName}
                  onChange={(e) => setValidatorName(e.target.value)}
                  placeholder={t("library.validatorNamePlaceholder")}
                  data-testid="validator-name-input"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">{t("library.validatorPosition")}</Label>
                <Input
                  value={validatorPosition}
                  onChange={(e) => setValidatorPosition(e.target.value)}
                  placeholder={t("library.validatorPositionPlaceholder")}
                  data-testid="validator-position-input"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowValidationDialog(false)}>
                {t("common.cancel")}
              </Button>
              <Button 
                onClick={() => {
                  if (validatorName.trim() && validatorPosition.trim()) {
                    onValidate(fm.id, validatorName.trim(), validatorPosition.trim(), currentUser?.id);
                    setShowValidationDialog(false);
                    setValidatorName("");
                    setValidatorPosition("");
                  }
                }}
                disabled={!validatorName.trim() || !validatorPosition.trim()}
                className="bg-green-600 hover:bg-green-700"
                data-testid="confirm-validation-btn"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {t("library.confirmValidation")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default FailureModeViewPanel;
