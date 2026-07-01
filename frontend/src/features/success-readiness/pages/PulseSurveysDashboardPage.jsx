import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareHeart, Plus, Sparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SUCCESS_READINESS_BASE } from "../config/nav";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { PulseStatusBadge, ScoreDisplay } from "../components/SuccessReadinessShared";
import { usePermissions } from "../../../contexts/PermissionsContext";

function StatCard({ label, value, suffix = "" }) {
  const display = value == null ? "—" : `${value}${suffix}`;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{display}</p>
    </div>
  );
}

function SurveyCard({ survey }) {
  const stats = survey.stats || {};
  return (
    <Link
      to={`${SUCCESS_READINESS_BASE}/pulse-surveys/${survey.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-slate-900">{survey.title}</h3>
          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{survey.description}</p>
        </div>
        <PulseStatusBadge status={survey.status} />
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-600">
        <span>{stats.completed ?? 0}/{stats.sent ?? survey.recipient_count ?? 0} responses</span>
        {stats.response_rate != null && <span>{stats.response_rate}% rate</span>}
        {stats.average_score != null && <span>Avg {stats.average_score}/5</span>}
        {survey.due_date && (
          <span>Due {new Date(survey.due_date).toLocaleDateString()}</span>
        )}
      </div>
    </Link>
  );
}

function SurveySection({ title, surveys }) {
  if (!surveys?.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{title} ({surveys.length})</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {surveys.map((survey) => (
          <SurveyCard key={survey.id} survey={survey} />
        ))}
      </div>
    </div>
  );
}

export default function PulseSurveysDashboardPage() {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("success_readiness", "write");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["success-readiness", "pulse-surveys", "dashboard"],
    queryFn: successReadinessAPI.getPulseDashboard,
  });

  const { data: pending = [] } = useQuery({
    queryKey: ["success-readiness", "pulse-surveys", "pending"],
    queryFn: successReadinessAPI.getMyPendingPulseSurveys,
  });

  if (isLoading) return <SuccessReadinessLoading />;

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        Failed to load pulse surveys.{" "}
        <Button variant="link" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const surveys = data?.surveys || [];
  const byStatus = {
    active: surveys.filter((s) => s.status === "active"),
    draft: surveys.filter((s) => s.status === "draft" || s.status === "scheduled"),
    closed: surveys.filter((s) => s.status === "closed"),
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareHeart className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">Pulse Surveys</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Short satisfaction pulses that feed change readiness evidence.
          </p>
        </div>
        {canWrite && (
          <Button asChild size="sm">
            <Link to={`${SUCCESS_READINESS_BASE}/pulse-surveys/new`}>
              <Plus className="w-4 h-4 mr-1" />
              New survey
            </Link>
          </Button>
        )}
      </div>

      {pending.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            You have {pending.length} survey{pending.length === 1 ? "" : "s"} waiting for your response.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pending.map((survey) => (
              <Button key={survey.id} asChild variant="outline" size="sm">
                <Link to={`${SUCCESS_READINESS_BASE}/pulse-surveys/${survey.id}/respond`}>
                  Respond: {survey.title}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total surveys" value={data?.total_surveys} />
        <StatCard label="Open" value={data?.open_surveys} />
        <StatCard label="Avg response rate" value={data?.average_response_rate} suffix="%" />
        <StatCard label="Avg satisfaction" value={data?.average_satisfaction_score} suffix="/5" />
      </div>

      {data?.latest_ai_summary && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-900 mb-1">
            <Sparkles className="w-4 h-4" />
            Latest summary
          </div>
          <p className="text-sm text-indigo-800">{data.latest_ai_summary}</p>
        </div>
      )}

      <div className="space-y-6">
        <SurveySection title="Active" surveys={byStatus.active} />
        <SurveySection title="Draft & scheduled" surveys={byStatus.draft} />
        <SurveySection title="Closed" surveys={byStatus.closed} />
      </div>

      {data?.recent_comments?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent comments</h3>
          <div className="space-y-2">
            {data.recent_comments.map((item, idx) => (
              <div key={idx} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <p>{item.comment}</p>
                {item.submitted_at && (
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(item.submitted_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!surveys.length && (
        <div className="text-center py-12 text-slate-500">
          <ScoreDisplay score={null} label="No surveys yet" />
          {canWrite && (
            <Button asChild className="mt-4" variant="outline">
              <Link to={`${SUCCESS_READINESS_BASE}/pulse-surveys/new`}>Create your first pulse survey</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
