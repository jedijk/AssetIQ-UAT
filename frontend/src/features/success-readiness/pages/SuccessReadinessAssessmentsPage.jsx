import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Textarea } from "../../../components/ui/textarea";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { KpiStatusBadge, ScoreDisplay } from "../components/SuccessReadinessShared";

function FieldIntentInfo({ field }) {
  if (!field?.intent) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-slate-400 hover:text-blue-600"
          aria-label={`Why we ask: ${field.label}`}
          data-testid={`assessment-field-intent-${field.id}`}
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-sm">
        <p className="font-medium text-slate-900">{field.label}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{field.intent}</p>
      </PopoverContent>
    </Popover>
  );
}

function FieldLabel({ field }) {
  return (
    <div className="mb-1 flex items-center gap-0.5">
      <Label className="text-xs">{field.label}</Label>
      <FieldIntentInfo field={field} />
    </div>
  );
}

function AssessmentField({ field, value, onChange }) {
  if (field.type === "yes_no") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 shrink-0"
        />
        <span className="text-sm text-slate-700">{field.label}</span>
        <FieldIntentInfo field={field} />
      </div>
    );
  }

  if (field.type === "comment") {
    return (
      <div>
        <FieldLabel field={field} />
        <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  return (
    <div>
      <FieldLabel field={field} />
      <Input
        type={field.type === "number" || field.type === "percentage" ? "number" : "text"}
        min={field.type === "percentage" ? 0 : undefined}
        max={field.type === "percentage" ? 100 : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9"
      />
    </div>
  );
}

function AssessmentCard({ assessment, onSubmitted }) {
  const [answers, setAnswers] = useState(assessment.answers || {});
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload) => successReadinessAPI.submitAssessment(assessment.id, payload),
    onSuccess: () => {
      toast.success("Assessment submitted");
      queryClient.invalidateQueries({ queryKey: ["success-readiness"] });
      onSubmitted();
    },
    onError: () => toast.error("Failed to submit assessment"),
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-900">{assessment.title}</h3>
          <p className="text-sm text-slate-500 mt-1">{assessment.description}</p>
          <p className="text-xs text-slate-400 mt-1 capitalize">{assessment.frequency} · KPIs: {(assessment.kpi_ids || []).join(", ")}</p>
        </div>
        <KpiStatusBadge status={assessment.status === "completed" ? "on_track" : "not_started"} />
      </div>

      {assessment.score != null && (
        <div className="flex items-center gap-3 text-sm">
          <ScoreDisplay score={assessment.score} className="!text-lg" />
          {assessment.completed_at && (
            <span className="text-slate-500">Completed {new Date(assessment.completed_at).toLocaleDateString()}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(assessment.fields || []).map((field) => (
          <div key={field.id} className={field.type === "comment" ? "md:col-span-2" : ""}>
            <AssessmentField
              field={field}
              value={answers[field.id]}
              onChange={(value) => setAnswers((prev) => ({ ...prev, [field.id]: value }))}
            />
          </div>
        ))}
      </div>

      <Button
        size="sm"
        onClick={() => mutation.mutate({ answers })}
        disabled={mutation.isPending}
      >
        <CheckCircle2 className="w-4 h-4 mr-1" />
        Submit assessment
      </Button>
    </div>
  );
}

export default function SuccessReadinessAssessmentsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["success-readiness", "assessments"],
    queryFn: successReadinessAPI.getAssessments,
  });

  if (isLoading) return <SuccessReadinessLoading />;

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Assessments</h2>
        <p className="text-sm text-slate-500 mt-1">
          Complete lightweight reviews for infrastructure, governance, training, and change readiness.
        </p>
      </div>
      <div className="space-y-4">
        {(data || []).map((assessment) => (
          <AssessmentCard key={assessment.id} assessment={assessment} onSubmitted={refetch} />
        ))}
      </div>
    </div>
  );
}
