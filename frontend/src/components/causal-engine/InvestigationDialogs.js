import { useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { Loader2, User } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SearchableSelect } from "../ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { CAUSE_CATEGORIES } from "../CauseNodeItem";
import { DISCIPLINES } from "../../constants/disciplines";

const INVESTIGATION_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Under Review" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

const EVENT_CATEGORIES = [
  { value: "operational_event", label: "Operational Event" },
  { value: "alarm", label: "Alarm" },
  { value: "maintenance_action", label: "Maintenance Action" },
  { value: "human_decision", label: "Human Decision" },
  { value: "system_response", label: "System Response" },
  { value: "environmental_condition", label: "Environmental" },
];

const ACTION_PRIORITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const ACTION_TYPES = [
  { value: "CM", label: "CM - Corrective" },
  { value: "PM", label: "PM - Preventive" },
  { value: "PDM", label: "PDM - Predictive" },
];

export const NewInvestigationDialog = ({ open, onOpenChange, form, setForm, onSubmit, isPending, users = [] }) => {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("causal.newInvestigation")}</DialogTitle><DialogDescription>{t("causal.newInvestigationDesc") || "Create a new causal investigation"}</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div><label className="text-sm font-medium">{t("common.name")} *</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Investigation title" data-testid="new-inv-title" /></div>
          <div><label className="text-sm font-medium">{t("common.description")} *</label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe..." rows={3} data-testid="new-inv-description" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium">{t("common.asset")}</label><Input value={form.asset_name} onChange={(e) => setForm({ ...form, asset_name: e.target.value })} placeholder="Equipment" /></div>
            <div><label className="text-sm font-medium">{t("causal.location")}</label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Area" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium">{t("causal.incidentDate")}</label><Input type="date" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} /></div>
            <div>
              <label className="text-sm font-medium">{t("causal.lead")}</label>
              {users.length > 0 ? (
                <SearchableSelect
                  options={[
                    { value: "none", label: "No lead assigned" },
                    ...users.map(user => ({
                      value: user.name,
                      label: user.name,
                      badge: user.position || user.role || ""
                    }))
                  ]}
                  value={form.investigation_leader || "none"}
                  onValueChange={(v) => setForm({ ...form, investigation_leader: v === "none" ? "" : v })}
                  placeholder="Select lead"
                  searchPlaceholder="Search users..."
                  data-testid="new-inv-lead-select"
                />
              ) : (
                <Input value={form.investigation_leader} onChange={(e) => setForm({ ...form, investigation_leader: e.target.value })} placeholder="Name" />
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={!form.title || !form.description || isPending} data-testid="create-inv-btn">{isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const EditInvestigationDialog = ({ open, onOpenChange, form, setForm, onSubmit, isPending, users = [] }) => {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("causal.editInvestigation") || "Edit Investigation"}</DialogTitle>
          <DialogDescription>{t("causal.editInvestigationDesc") || "Update investigation details"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">{t("common.name")} *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Investigation title" data-testid="edit-inv-title" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("common.description")} *</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe..." rows={3} data-testid="edit-inv-description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t("common.asset")}</label>
              <Input value={form.asset_name} onChange={(e) => setForm({ ...form, asset_name: e.target.value })} placeholder="Equipment" />
            </div>
            <div>
              <label className="text-sm font-medium">{t("causal.location")}</label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Area" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t("causal.incidentDate")}</label>
              <Input type="date" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("causal.lead")}</label>
              {users.length > 0 ? (
                <SearchableSelect
                  options={[
                    { value: "none", label: "No lead assigned" },
                    ...users.map(user => ({
                      value: user.name,
                      label: user.name,
                      badge: user.position || user.role || ""
                    }))
                  ]}
                  value={form.investigation_leader || "none"}
                  onValueChange={(v) => setForm({ ...form, investigation_leader: v === "none" ? "" : v })}
                  placeholder="Select lead"
                  searchPlaceholder="Search users..."
                  data-testid="edit-inv-lead-select"
                />
              ) : (
                <Input value={form.investigation_leader} onChange={(e) => setForm({ ...form, investigation_leader: e.target.value })} placeholder="Name" />
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">{t("common.status")}</label>
            <Select value={form.status || "draft"} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger data-testid="edit-inv-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVESTIGATION_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={!form.title || !form.description || isPending} data-testid="save-inv-btn">
            {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {t("common.save") || "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const EventDialog = ({ open, onOpenChange, editingItem, form, setForm, onSubmit }) => {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editingItem?.type === "event" ? t("causal.editEvent") : t("causal.addEvent")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div><label className="text-sm font-medium">{t("common.time")} *</label><Input value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} placeholder="2024-03-15 14:30" /></div>
          <div><label className="text-sm font-medium">{t("common.description")} *</label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What happened?" rows={2} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium">{t("causal.category")}</label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div><label className="text-sm font-medium">{t("causal.confidence")}</label><Select value={form.confidence} onValueChange={(v) => setForm({ ...form, confidence: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">{t("common.high")}</SelectItem><SelectItem value="medium">{t("common.medium")}</SelectItem><SelectItem value="low">{t("common.low")}</SelectItem><SelectItem value="uncertain">Uncertain</SelectItem></SelectContent></Select></div>
          </div>
          <div><label className="text-sm font-medium">{t("causal.evidenceSource")}</label><Input value={form.evidence_source} onChange={(e) => setForm({ ...form, evidence_source: e.target.value })} placeholder="Log file, witness..." /></div>
          <div><label className="text-sm font-medium">{t("common.comment")}</label><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Add notes or comments..." rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={!form.event_time || !form.description}>{editingItem?.type === "event" ? t("common.update") : t("common.add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const FailureDialog = ({ open, onOpenChange, editingItem, form, setForm, onSubmit, equipmentNodes = [], failureModes = [] }) => {
  const { t } = useLanguage();
  const [customFailureMode, setCustomFailureMode] = useState("");
  
  // Get unique failure mode names from library (field is 'failure_mode' not 'name')
  const failureModeOptions = [...new Set(failureModes.map(fm => fm.failure_mode || fm.name))].filter(Boolean);
  
  const handleFailureModeChange = (value) => {
    if (value === "__custom__") {
      // User wants to enter custom failure mode
      setForm({ ...form, failure_mode: customFailureMode });
    } else {
      setForm({ ...form, failure_mode: value });
      setCustomFailureMode("");
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editingItem?.type === "failure" ? t("causal.editFailure") : t("causal.addFailure")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label className="text-sm font-medium">{t("common.asset")} *</Label>
            {equipmentNodes.length > 0 ? (
              <Select value={form.asset_name || "none"} onValueChange={(v) => setForm({ ...form, asset_name: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select equipment</SelectItem>
                  {equipmentNodes.map(node => (
                    <SelectItem key={node.id} value={node.name}>{node.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.asset_name} onChange={(e) => setForm({ ...form, asset_name: e.target.value })} placeholder="Equipment name" className="mt-1" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-sm font-medium">{t("causal.subsystem")}</Label><Input value={form.subsystem} onChange={(e) => setForm({ ...form, subsystem: e.target.value })} placeholder="e.g., Sealing" className="mt-1" /></div>
            <div><Label className="text-sm font-medium">{t("causal.component")} *</Label><Input value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })} placeholder="e.g., Seal" className="mt-1" /></div>
          </div>
          <div>
            <Label className="text-sm font-medium">{t("common.failureMode")} *</Label>
            {failureModeOptions.length > 0 ? (
              <div className="space-y-2 mt-1">
                <Select 
                  value={failureModeOptions.includes(form.failure_mode) ? form.failure_mode : (form.failure_mode ? "__custom__" : "none")} 
                  onValueChange={handleFailureModeChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select or enter failure mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select failure mode</SelectItem>
                    {failureModeOptions.map(fm => (
                      <SelectItem key={fm} value={fm}>{fm}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">+ Enter custom failure mode</SelectItem>
                  </SelectContent>
                </Select>
                {(!failureModeOptions.includes(form.failure_mode) && form.failure_mode) || customFailureMode ? (
                  <Input 
                    value={form.failure_mode || customFailureMode} 
                    onChange={(e) => {
                      setCustomFailureMode(e.target.value);
                      setForm({ ...form, failure_mode: e.target.value });
                    }} 
                    placeholder="Enter custom failure mode" 
                  />
                ) : null}
              </div>
            ) : (
              <Input value={form.failure_mode} onChange={(e) => setForm({ ...form, failure_mode: e.target.value })} placeholder="e.g., Leakage" className="mt-1" />
            )}
          </div>
          <div><Label className="text-sm font-medium">{t("causal.mechanism")}</Label><Input value={form.degradation_mechanism} onChange={(e) => setForm({ ...form, degradation_mechanism: e.target.value })} placeholder="e.g., Fatigue" className="mt-1" /></div>
          <div><Label className="text-sm font-medium">{t("common.comment")}</Label><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Add notes or comments..." rows={2} className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={!form.asset_name || !form.component || !form.failure_mode}>{editingItem?.type === "failure" ? t("common.update") : t("common.add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const CauseDialog = ({ open, onOpenChange, editingItem, form, setForm, onSubmit, causeNodes }) => {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editingItem?.type === "cause" ? t("causal.editCause") : t("causal.addCause")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div><label className="text-sm font-medium">{t("common.description")} *</label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe..." rows={2} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium">{t("causal.category")}</label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CAUSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div><label className="text-sm font-medium">{t("causal.parent")}</label><Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder={t("causal.noParent")} /></SelectTrigger><SelectContent><SelectItem value="none">{t("causal.noParent")}</SelectItem>{causeNodes.filter(c => c.id !== editingItem?.data?.id).map(c => <SelectItem key={c.id} value={c.id}>{c.description.substring(0, 30)}...</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="flex items-center gap-2"><input type="checkbox" id="root" checked={form.is_root_cause} onChange={(e) => setForm({ ...form, is_root_cause: e.target.checked })} className="rounded" /><label htmlFor="root" className="text-sm font-medium">{t("causal.markAsRootCause")}</label></div>
          <div><label className="text-sm font-medium">{t("common.evidence")}</label><Textarea value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} placeholder="Supporting evidence..." rows={2} /></div>
          <div><label className="text-sm font-medium">{t("common.comment")}</label><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Add notes or comments..." rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button onClick={onSubmit} disabled={!form.description}>{editingItem?.type === "cause" ? t("common.update") : t("common.add")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ActionDialog = ({ open, onOpenChange, editingItem, form, setForm, onSubmit, causeNodes, users = [] }) => {
  const { t } = useLanguage();
  
  // Prepare options for searchable selects
  const disciplineOptions = [
    { value: "none", label: "No discipline" },
    ...DISCIPLINES.map(d => ({ value: d.value, label: d.label }))
  ];
  
  const userOptions = [
    { value: "none", label: "No owner assigned" },
    ...users.map(user => ({
      value: user.name || user.email,
      label: user.name || user.email,
      badge: user.position || user.role || ""
    }))
  ];
  
  const causeOptions = [
    { value: "none", label: t("causal.noParent") || "No linked cause" },
    ...causeNodes.filter(c => c.is_root_cause).map(c => ({
      value: c.id,
      label: c.description.substring(0, 50) + (c.description.length > 50 ? "..." : "")
    }))
  ];
  
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editingItem?.type === "action" ? t("causal.editAction") : t("causal.addAction")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div><Label className="text-sm font-medium">{t("common.description")} *</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What to do?" rows={2} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">{t("common.type") || "Type"}</Label>
              <Select value={form.action_type || "none"} onValueChange={(v) => setForm({ ...form, action_type: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No type</SelectItem>
                  {ACTION_TYPES.map(at => <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">{t("common.discipline") || "Discipline"}</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={disciplineOptions}
                  value={form.discipline || "none"}
                  onValueChange={(v) => setForm({ ...form, discipline: v === "none" ? "" : v })}
                  placeholder="Select discipline"
                  searchPlaceholder="Search disciplines..."
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">{t("common.owner")}</Label>
              <div className="mt-1">
                {users.length > 0 ? (
                  <SearchableSelect
                    options={userOptions}
                    value={form.owner || "none"}
                    onValueChange={(v) => setForm({ ...form, owner: v === "none" ? "" : v })}
                    placeholder="Select owner"
                    searchPlaceholder="Search users..."
                  />
                ) : (
                  <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Person" />
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">{t("common.priority")}</Label>
              <Select value={form.priority || "medium"} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ACTION_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-sm font-medium">{t("common.dueDate")}</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1" /></div>
            <div>
              <Label className="text-sm font-medium">{t("causal.linkedRootCause")}</Label>
              <div className="mt-1">
                <SearchableSelect
                  options={causeOptions}
                  value={form.linked_cause_id || "none"}
                  onValueChange={(v) => setForm({ ...form, linked_cause_id: v === "none" ? null : v })}
                  placeholder={t("causal.noParent") || "Select root cause"}
                  searchPlaceholder="Search causes..."
                />
              </div>
            </div>
          </div>
          <div><Label className="text-sm font-medium">{t("common.comment")}</Label><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Add notes or comments..." rows={2} className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={!form.description}>{editingItem?.type === "action" ? t("common.update") : t("common.add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
