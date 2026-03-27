import { useLanguage } from "../../contexts/LanguageContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
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
import { Zap, FileText } from "lucide-react";

export const TemplateDialog = ({
  open,
  onOpenChange,
  editingTemplate,
  templateForm,
  setTemplateForm,
  formTemplates = [],
  onSubmit,
  isPending,
  onClose,
}) => {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingTemplate ? t("taskScheduler.editTemplate") : t("taskScheduler.createTemplate")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          <div>
            <Label>{t("common.name")} *</Label>
            <Input
              value={templateForm.name}
              onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
              placeholder="e.g., Bearing Inspection"
              data-testid="template-name-input"
            />
          </div>
          <div>
            <Label>{t("common.description")}</Label>
            <Textarea
              value={templateForm.description}
              onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
              placeholder="Describe the task..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("library.discipline")} *</Label>
              <Select 
                value={templateForm.discipline} 
                onValueChange={(v) => setTemplateForm({ ...templateForm, discipline: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operations">{t("taskScheduler.operations")}</SelectItem>
                  <SelectItem value="maintenance">{t("taskScheduler.maintenance")}</SelectItem>
                  <SelectItem value="laboratory">{t("taskScheduler.laboratory")}</SelectItem>
                  <SelectItem value="inspection">{t("taskScheduler.inspection")}</SelectItem>
                  <SelectItem value="engineering">{t("taskScheduler.engineering")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("taskScheduler.strategy")}</Label>
              <Select 
                value={templateForm.mitigation_strategy} 
                onValueChange={(v) => setTemplateForm({ ...templateForm, mitigation_strategy: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventive">{t("taskScheduler.preventive")}</SelectItem>
                  <SelectItem value="predictive">{t("taskScheduler.predictive")}</SelectItem>
                  <SelectItem value="detective">{t("taskScheduler.detective")}</SelectItem>
                  <SelectItem value="corrective">{t("taskScheduler.corrective")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Ad-hoc Toggle */}
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600" />
              <div>
                <Label className="text-sm font-medium">{t("taskScheduler.adhocOnly")}</Label>
                <p className="text-xs text-slate-500">{t("taskScheduler.adhocOnlyDesc")}</p>
              </div>
            </div>
            <Switch
              checked={templateForm.is_adhoc || false}
              onCheckedChange={(checked) => setTemplateForm({ 
                ...templateForm, 
                is_adhoc: checked,
                // Reset interval if switching to adhoc
                default_interval: checked ? 0 : (templateForm.default_interval || 30),
                default_unit: checked ? null : (templateForm.default_unit || "days")
              })}
              data-testid="adhoc-toggle"
            />
          </div>

          {/* Linked Form Selection */}
          <div>
            <Label className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              {t("taskScheduler.linkedForm")}
            </Label>
            <Select 
              value={templateForm.form_template_id || "none"} 
              onValueChange={(v) => setTemplateForm({ ...templateForm, form_template_id: v === "none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("taskScheduler.selectForm")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("taskScheduler.noForm")}</SelectItem>
                {formTemplates.map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    {form.name} {form.version > 1 && `(v${form.version})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">{t("taskScheduler.linkFormDesc")}</p>
          </div>

          {/* Interval fields - hidden when ad-hoc */}
          {!templateForm.is_adhoc && (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label>{t("taskScheduler.defaultInterval")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={templateForm.default_interval}
                    onChange={(e) => setTemplateForm({ ...templateForm, default_interval: parseInt(e.target.value) || 1 })}
                    min={1}
                  />
                  <Select 
                    value={templateForm.default_unit} 
                    onValueChange={(v) => setTemplateForm({ ...templateForm, default_unit: v })}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">{t("taskScheduler.days")}</SelectItem>
                      <SelectItem value="weeks">{t("taskScheduler.weeks")}</SelectItem>
                      <SelectItem value="months">{t("taskScheduler.months")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t("taskScheduler.durationMin")}</Label>
                <Input
                  type="number"
                  value={templateForm.estimated_duration_minutes}
                  onChange={(e) => setTemplateForm({ ...templateForm, estimated_duration_minutes: parseInt(e.target.value) || 0 })}
                  min={0}
                />
              </div>
            </div>
          )}

          {/* Duration field when ad-hoc (still useful) */}
          {templateForm.is_adhoc && (
            <div className="w-1/3">
              <Label>{t("taskScheduler.durationMin")}</Label>
              <Input
                type="number"
                value={templateForm.estimated_duration_minutes}
                onChange={(e) => setTemplateForm({ ...templateForm, estimated_duration_minutes: parseInt(e.target.value) || 0 })}
                min={0}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button 
            onClick={onSubmit} 
            disabled={!templateForm.name || isPending}
            data-testid="template-submit-btn"
          >
            {isPending 
              ? (editingTemplate ? t("taskScheduler.saving") : t("common.creating")) 
              : (editingTemplate ? t("taskScheduler.saveChanges") : t("taskScheduler.createTemplate"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
