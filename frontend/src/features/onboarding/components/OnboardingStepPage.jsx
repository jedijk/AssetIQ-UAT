import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  HelpCircle,
  Lightbulb,
  PlayCircle,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { onboardingAPI } from "../../../lib/apis/onboarding";
import { getPhaseConfig } from "../config/phases";
import { OnboardingDemo } from "./OnboardingDemo";
import { OnboardingProgressSidebar } from "./OnboardingProgressSidebar";
import { OnboardingAICoach } from "./OnboardingAICoach";
import { GoLiveCompletion } from "./GoLiveCompletion";

function ValidationIcon({ status }) {
  if (status === "passed") return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (status === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

export function OnboardingStepPage({
  phaseId,
  phaseDetail,
  onRefresh,
  isRefreshing,
  showGoLiveComplete,
}) {
  const navigate = useNavigate();
  const config = getPhaseConfig(phaseId);
  const validation = phaseDetail?.validation || {};
  const [helpMode, setHelpMode] = useState(null);
  const [showDemo, setShowDemo] = useState(true);

  const validateMutation = useMutation({
    mutationFn: () =>
      phaseId === "go_live" ? onboardingAPI.validateGoLive() : onboardingAPI.validatePhase(phaseId),
    onSuccess: () => onRefresh?.(),
  });

  if (!config) {
    return <p className="p-8 text-slate-500">Unknown onboarding phase.</p>;
  }

  if (showGoLiveComplete && phaseId === "go_live") {
    return (
      <GoLiveCompletion
        readiness={phaseDetail?.readiness}
        validation={validation}
      />
    );
  }

  const helpText = helpMode ? config.help?.[helpMode] : null;

  return (
    <div className="flex flex-col xl:flex-row gap-6 p-4 md:p-6 max-w-[1600px] mx-auto">
      <OnboardingProgressSidebar
        phases={phaseDetail?.phases}
        currentPhaseId={phaseId}
        onNavigate={(id) => navigate(`/settings/onboarding/phases/${id}`)}
      />

      <main className="flex-1 min-w-0 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge variant="outline" className="mb-2">
              Phase · {config.label}
            </Badge>
            <h1 className="text-2xl font-bold text-slate-900">{config.label}</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What is this?</h2>
          <p className="text-slate-800">{config.what}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Why it matters</h2>
          <p className="text-slate-700">{config.why}</p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Show Me</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowDemo((v) => !v)}>
              <PlayCircle className="w-4 h-4 mr-1" />
              {showDemo ? "Hide demo" : "Show demo"}
            </Button>
          </div>
          {showDemo && <OnboardingDemo type={config.demo} />}
        </section>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-800 mb-3">Your Turn</h2>
          {config.ctaPath ? (
            <Button asChild size="lg">
              <Link to={config.ctaPath}>
                {config.ctaLabel}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
            >
              {config.ctaLabel}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Validation results
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
            >
              Run validation
            </Button>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                Score: {validation.score ?? 0}%
                <Badge
                  className={
                    validation.status === "passed"
                      ? "bg-emerald-100 text-emerald-800"
                      : validation.status === "warning"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                  }
                >
                  {validation.status || "pending"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(validation.checks || []).map((check) => (
                <div key={check.code} className="flex items-start gap-2 text-sm">
                  <ValidationIcon status={check.status} />
                  <span className="text-slate-700">{check.message}</span>
                </div>
              ))}
              {!validation.checks?.length && (
                <p className="text-sm text-slate-500">Run validation to check this phase.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Need Help?</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setHelpMode("explainAgain")}>
              <HelpCircle className="w-4 h-4 mr-1" /> Explain Again
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHelpMode("example");
                setShowDemo(true);
              }}
            >
              <PlayCircle className="w-4 h-4 mr-1" /> Show Example
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHelpMode("bestPractice")}>
              <Lightbulb className="w-4 h-4 mr-1" /> Best Practice
            </Button>
            <Button variant="outline" size="sm" onClick={() => document.getElementById("onboarding-ai-coach")?.scrollIntoView({ behavior: "smooth" })}>
              <Sparkles className="w-4 h-4 mr-1" /> Ask AI
            </Button>
          </div>
          {helpText && (
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
              {helpText}
            </p>
          )}
        </section>
      </main>

      <div id="onboarding-ai-coach">
        <OnboardingAICoach phaseId={phaseId} />
      </div>
    </div>
  );
}
