import { useLanguage } from "../../contexts/LanguageContext";
import { format } from "date-fns";
import { Calendar as CalendarIcon, FileText, Zap } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Calendar } from "../ui/calendar";
import { Badge } from "../ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export const PlanDialog = ({
  open,
  onOpenChange,
  planForm,
  setPlanForm,
  templates,
  equipmentData,
  formTemplatesData,
  inheritedInterval,
  onTemplateSelect,
  onSubmit,
  isPending,
}) => {
  const { t } = useLanguage();
  
  // Find selected template to check if it's ad-hoc
  const selectedTemplate = templates.find(tmpl => tmpl.id === planForm.task_template_id);
  const isAdhocTemplate = selectedTemplate?.is_adhoc || false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("taskScheduler.createPlan")}</DialogTitle>
          <DialogDescription>{t("taskScheduler.createPlanDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>{t("taskScheduler.executionTemplate")} *</Label>
            <Select 
              value={planForm.task_template_id} 
              onValueChange={onTemplateSelect}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("taskScheduler.selectTemplate")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tmpl) => (
                  <SelectItem key={tmpl.id} value={tmpl.id}>
                    <div className="flex items-center gap-2">
                      {tmpl.name}
                      {tmpl.is_adhoc && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                          <Zap className="w-3 h-3 mr-1" />
                          {t("taskScheduler.adhocLabel")}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdhocTemplate && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {t("taskScheduler.adhocPlanDesc")}
              </p>
            )}
          </div>
          <div>
            <Label>{t("taskScheduler.equipment")} *</Label>
            <Select 
              value={planForm.equipment_id} 
              onValueChange={(v) => setPlanForm({ ...planForm, equipment_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("taskScheduler.selectEquipment")} />
              </SelectTrigger>
              <SelectContent>
                {(equipmentData?.nodes || []).map((eq) => (
                  <SelectItem key={eq.id} value={eq.id}>{eq.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="flex items-center justify-between">
              <span>
                {isAdhocTemplate ? t("taskScheduler.intervalOptional") : t("taskScheduler.interval")}
              </span>
              {!isAdhocTemplate && planForm.task_template_id && (planForm.interval_value === null) && (
                <span className="text-xs text-slate-400 font-normal">{t("taskScheduler.inheritedFromTemplate")}</span>
              )}
            </Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={planForm.interval_value ?? (isAdhocTemplate ? '' : inheritedInterval.value)}
                onChange={(e) => setPlanForm({ ...planForm, interval_value: e.target.value ? parseInt(e.target.value) : null })}
                min={1}
                className={`w-20 ${planForm.interval_value === null ? 'text-slate-400 bg-slate-50' : ''}`}
                placeholder={isAdhocTemplate ? "-" : inheritedInterval.value.toString()}
              />
              <Select 
                value={planForm.interval_unit ?? (isAdhocTemplate ? "days" : inheritedInterval.unit)} 
                onValueChange={(v) => setPlanForm({ ...planForm, interval_unit: v })}
                disabled={isAdhocTemplate && !planForm.interval_value}
              >
                <SelectTrigger className={`w-[100px] ${(planForm.interval_unit === null || (isAdhocTemplate && !planForm.interval_value)) ? 'text-slate-400 bg-slate-50' : ''}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">{t("taskScheduler.days")}</SelectItem>
                  <SelectItem value="weeks">{t("taskScheduler.weeks")}</SelectItem>
                  <SelectItem value="months">{t("taskScheduler.months")}</SelectItem>
                </SelectContent>
              </Select>
              {(planForm.interval_value !== null || planForm.interval_unit !== null) && !isAdhocTemplate && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setPlanForm({ ...planForm, interval_value: null, interval_unit: null })}
                  className="text-xs text-slate-500"
                >
                  {t("taskScheduler.reset")}
                </Button>
              )}
            </div>
            {!isAdhocTemplate && planForm.task_template_id && planForm.interval_value === null && (
              <p className="text-xs text-slate-400 mt-1">
                {t("taskScheduler.templateDefault")}: {inheritedInterval.value} {inheritedInterval.unit}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DatePickerField
              label={t("taskScheduler.beginDate")}
              value={planForm.effective_from}
              onChange={(date) => setPlanForm({ ...planForm, effective_from: date })}
              hint={t("taskScheduler.whenToStart")}
              t={t}
            />
            <DatePickerField
              label={t("taskScheduler.endDateOptional")}
              value={planForm.effective_until}
              onChange={(date) => setPlanForm({ ...planForm, effective_until: date })}
              hint={t("taskScheduler.whenToStop")}
              disabledFn={(date) => planForm.effective_from && date < planForm.effective_from}
              t={t}
            />
          </div>
          <div>
            <Label>{t("taskScheduler.linkedFormOptional")}</Label>
            <Select 
              value={planForm.form_template_id} 
              onValueChange={(v) => setPlanForm({ ...planForm, form_template_id: v === "none" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("taskScheduler.selectFormTemplate")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("taskScheduler.noForm")}</SelectItem>
                {(formTemplatesData?.templates || []).map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      {form.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">{t("taskScheduler.linkFormDesc")}</p>
          </div>
          <div>
            <Label>{t("causal.notes")}</Label>
            <Textarea 
              value={planForm.notes}
              onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
              placeholder={t("taskScheduler.optionalNotes")}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button 
            onClick={onSubmit}
            disabled={!planForm.task_template_id || !planForm.equipment_id || isPending}
          >
            {isPending ? t("common.creating") : t("taskScheduler.createPlan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DatePickerField = ({ label, value, onChange, hint, disabledFn, t }) => (
  <div>
    <Label>{label}</Label>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-start text-left font-normal ${!value ? "text-muted-foreground" : ""}`}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : t("taskScheduler.selectDate")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          disabled={disabledFn}
        />
        <div className="p-3 border-t border-slate-200 flex justify-between">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => onChange(new Date())}
          >
            {t("taskScheduler.today")}
          </Button>
          {value && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onChange(null)}
              className="text-red-500"
            >
              {t("taskScheduler.clear")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
    <p className="text-xs text-slate-400 mt-1">{hint}</p>
  </div>
);
