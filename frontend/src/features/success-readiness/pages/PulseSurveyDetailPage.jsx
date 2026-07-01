import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SUCCESS_READINESS_BASE } from "../config/nav";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { PulseStatusBadge } from "../components/SuccessReadinessShared";
import { usePermissions } from "../../../contexts/PermissionsContext";

function AnalyticsBlock({ analytics }) {
  if (!analytics || analytics.response_count === 0) {
    return <p className="text-sm text-slate-500">No responses yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded border border-slate-200 p-3">
          <p className="text-slate-500 text-xs">Responses</p>
          <p className="text-xl font-semibold">{analytics.response_count}</p>
        </div>
        <div className="rounded border border-slate-200 p-3">
          <p className="text-slate-500 text-xs">Average rating</p>
          <p className="text-xl font-semibold">{analytics.average_rating ?? "—"}/5</p>
        </div>
      </div>

      {Object.keys(analytics.average_by_question || {}).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">By question</h4>
          <div className="space-y-1 text-sm">
            {Object.entries(analytics.average_by_question).map(([qid, avg]) => (
              <div key={qid} className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">{qid}</span>
                <span className="font-medium tabular-nums">{avg}/5</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analytics.comments?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">Comments</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {analytics.comments.map((comment, idx) => (
              <div key={idx} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                {comment}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PulseSurveyDetailPage() {
  const { surveyId } = useParams();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("success_readiness", "write");

  const { data: survey, isLoading, error, refetch } = useQuery({
    queryKey: ["success-readiness", "pulse-surveys", surveyId],
    queryFn: () => successReadinessAPI.getPulseSurvey(surveyId),
    enabled: Boolean(surveyId),
  });

  const closeMutation = useMutation({
    mutationFn: () => successReadinessAPI.closePulseSurvey(surveyId),
    onSuccess: () => {
      toast.success("Survey closed");
      queryClient.invalidateQueries({ queryKey: ["success-readiness", "pulse-surveys"] });
      refetch();
    },
    onError: (err) => toast.error(err?.response?.data?.detail || "Failed to close survey"),
  });

  const publishMutation = useMutation({
    mutationFn: () => successReadinessAPI.publishPulseSurvey(surveyId),
    onSuccess: () => {
      toast.success("Survey published");
      queryClient.invalidateQueries({ queryKey: ["success-readiness", "pulse-surveys"] });
      refetch();
    },
    onError: (err) => toast.error(err?.response?.data?.detail || "Failed to publish survey"),
  });

  if (isLoading) return <SuccessReadinessLoading />;

  if (error || !survey) {
    return (
      <div className="p-6 text-center text-red-600">
        Survey not found.{" "}
        <Button asChild variant="link">
          <Link to={`${SUCCESS_READINESS_BASE}/pulse-surveys`}>Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const stats = survey.stats || {};

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to={`${SUCCESS_READINESS_BASE}/pulse-surveys`}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              All surveys
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{survey.title}</h2>
            <PulseStatusBadge status={survey.status} />
          </div>
          <p className="text-sm text-slate-500 mt-1">{survey.description}</p>
        </div>
        <div className="flex gap-2">
          {canWrite && survey.status === "draft" && (
            <Button size="sm" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              Publish
            </Button>
          )}
          {canWrite && survey.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
            >
              <Lock className="w-4 h-4 mr-1" />
              Close survey
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Recipients</p>
          <p className="text-lg font-semibold">{stats.sent ?? survey.recipient_count ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Responses</p>
          <p className="text-lg font-semibold">{stats.completed ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Response rate</p>
          <p className="text-lg font-semibold">{stats.response_rate != null ? `${stats.response_rate}%` : "—"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Avg score</p>
          <p className="text-lg font-semibold">{stats.average_score != null ? `${stats.average_score}/5` : "—"}</p>
        </div>
      </div>

      {survey.ai_summary?.summary && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-900 mb-1">
            <Sparkles className="w-4 h-4" />
            Summary
          </div>
          <p className="text-sm text-indigo-800">{survey.ai_summary.summary}</p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Questions</h3>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700">
          {(survey.questions || []).map((q) => (
            <li key={q.id}>{q.label}</li>
          ))}
        </ol>
        {survey.comment_prompt && (
          <p className="text-xs text-slate-500 mt-3">Comment: {survey.comment_prompt}</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Analytics</h3>
        <AnalyticsBlock analytics={survey.analytics} />
      </div>
    </div>
  );
}
