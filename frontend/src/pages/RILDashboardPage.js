/**
 * Reliability Intelligence Dashboard Page
 * Main page for the Reliability Intelligence Layer (RIL)
 * 
 * Features:
 * - Executive KPIs (Reliability Score, Risk Exposure, Open Cases)
 * - Emerging risks and alerts
 * - Recent correlations
 * - Equipment at risk
 * - Copilot quick access
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  ChevronRight,
  Clock,
  FileText,
  Gauge,
  Heart,
  Layers,
  Link2,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { rilDashboardAPI, rilCasesAPI, rilPredictionsAPI } from "../lib/apis/rilAPI";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import RILCopilot from "../components/ril/RILCopilot";

// Priority badge colors
const priorityColors = {
  P1: "bg-red-500 text-white",
  P2: "bg-orange-500 text-white",
  P3: "bg-yellow-500 text-black",
  P4: "bg-blue-500 text-white",
};

// Status badge colors
const statusColors = {
  open: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  under_investigation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

// KPI Card component
const KPICard = ({ title, value, subtitle, icon: Icon, trend, trendDirection, color = "blue", "data-testid": testId }) => {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-green-600",
    red: "from-red-500 to-red-600",
    orange: "from-orange-500 to-orange-600",
    purple: "from-purple-500 to-purple-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5 hover:shadow-md transition-shadow"
      data-testid={testId}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
          <p className="text-3xl font-bold mt-1 text-zinc-900 dark:text-white">{value}</p>
          {subtitle && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${
              trendDirection === "up" ? "text-green-600" : trendDirection === "down" ? "text-red-600" : "text-zinc-500"
            }`}>
              {trendDirection === "up" ? <TrendingUp className="w-4 h-4" /> : 
               trendDirection === "down" ? <TrendingDown className="w-4 h-4" /> : null}
              <span>{trend}</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </motion.div>
  );
};

// Health Score Gauge
const HealthScoreGauge = ({ score }) => {
  const getColor = (s) => {
    if (s >= 80) return "#22c55e";
    if (s >= 60) return "#eab308";
    if (s >= 40) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="64"
          cy="64"
          r="56"
          stroke="currentColor"
          strokeWidth="12"
          fill="none"
          className="text-zinc-200 dark:text-zinc-700"
        />
        <circle
          cx="64"
          cy="64"
          r="56"
          stroke={getColor(score)}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 351.86} 351.86`}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-zinc-900 dark:text-white">{Math.round(score)}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Score</span>
      </div>
    </div>
  );
};

export default function RILDashboardPage() {
  const navigate = useNavigate();
  const [copilotOpen, setCopilotOpen] = useState(false);

  // Fetch executive dashboard data
  const { data: executiveData, isLoading: execLoading, refetch: refetchExec } = useQuery({
    queryKey: ["ril-executive"],
    queryFn: () => rilDashboardAPI.getExecutive(),
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch intelligence dashboard data
  const { data: intelligenceData, isLoading: intelLoading } = useQuery({
    queryKey: ["ril-intelligence"],
    queryFn: () => rilDashboardAPI.getIntelligence(),
    refetchInterval: 60000,
  });

  // Fetch recent cases
  const { data: casesData, isLoading: casesLoading } = useQuery({
    queryKey: ["ril-cases-recent"],
    queryFn: () => rilCasesAPI.list({ limit: 5 }),
  });

  // Fetch equipment at risk
  const { data: atRiskData, isLoading: atRiskLoading } = useQuery({
    queryKey: ["ril-at-risk"],
    queryFn: () => rilPredictionsAPI.getAtRisk({ health_threshold: 70, limit: 5 }),
  });

  const exec = executiveData || {};
  const intel = intelligenceData || {};
  const cases = casesData?.cases || [];
  const atRisk = atRiskData?.at_risk || [];

  const isLoading = execLoading || intelLoading;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" data-testid="ril-dashboard">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1
                className="text-2xl font-bold text-zinc-900 dark:text-white"
                data-testid="ril-dashboard-title"
              >
                Reliability Intelligence
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Predictive insights and reliability management
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchExec()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setCopilotOpen(true)}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Ask Copilot
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Executive KPIs */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"
          data-testid="ril-executive-kpis"
        >
          <KPICard
            title="Reliability Score"
            value={exec.reliability_score?.toFixed(1) || "—"}
            subtitle="Overall health"
            icon={Shield}
            color="green"
          />
          <KPICard
            title="Open Cases"
            value={exec.open_cases || 0}
            subtitle={`P1: ${exec.p1_cases || 0} | P2: ${exec.p2_cases || 0}`}
            icon={FileText}
            color="blue"
          />
          <KPICard
            title="Risk Exposure"
            value={exec.risk_exposure || 0}
            subtitle="Equipment at risk"
            icon={AlertTriangle}
            color="red"
          />
          <KPICard
            title="Open Threats"
            value={exec.open_threats ?? 0}
            subtitle="Active observations"
            icon={Target}
            color="orange"
          />
          <KPICard
            title="Overdue PM"
            value={exec.overdue_pm?.total ?? 0}
            subtitle={`Scheduled: ${exec.overdue_pm?.scheduled_tasks ?? 0} | Instances: ${exec.overdue_pm?.task_instances ?? 0}`}
            icon={Clock}
            color="red"
            data-testid="ril-kpi-overdue-pm"
          />
          <KPICard
            title="MTBF Proxy"
            value={exec.mtbf_proxy?.fleet_mean_days != null ? `${exec.mtbf_proxy.fleet_mean_days}d` : "—"}
            subtitle={`${exec.mtbf_proxy?.sample_equipment_count ?? 0} assets · ${exec.mtbf_proxy?.window_days ?? 90}d window`}
            icon={TrendingUp}
            color="green"
            data-testid="ril-kpi-mtbf-proxy"
          />
          <KPICard
            title="High-Risk Threats"
            value={exec.high_risk_threats ?? 0}
            subtitle="Critical / high risk level"
            icon={AlertTriangle}
            color="orange"
          />
          <KPICard
            title="Strategy Coverage"
            value={exec.strategy_coverage_pct != null ? `${exec.strategy_coverage_pct}%` : "—"}
            subtitle="Equipment with maintenance strategy"
            icon={Layers}
            color="purple"
          />
          <KPICard
            title="Predicted Failures"
            value={exec.predicted_failures || 0}
            subtitle="Low health score"
            icon={Zap}
            color="orange"
          />
          <KPICard
            title="Knowledge Graph"
            value={exec.reliability_edges_total ?? "—"}
            subtitle="Reliability graph edges"
            icon={Link2}
            color="blue"
            data-testid="ril-kpi-reliability-edges"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Reliability Score & Cases */}
          <div className="lg:col-span-2 space-y-6">
            {/* Reliability Score Card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Heart className="w-5 h-5 text-red-500" />
                    Reliability Health
                  </CardTitle>
                  <Badge variant="outline" className="font-normal">
                    Updated {new Date().toLocaleTimeString()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-8">
                  <HealthScoreGauge score={exec.reliability_score || 85} />
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">Cases Resolved (30d)</span>
                        <span className="text-sm font-medium">{exec.cases_resolved_30d || 0}</span>
                      </div>
                      <Progress value={Math.min((exec.cases_resolved_30d || 0) / 10 * 100, 100)} className="h-2" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">P1/P2 Cases Open</span>
                        <span className="text-sm font-medium">{(exec.p1_cases || 0) + (exec.p2_cases || 0)}</span>
                      </div>
                      <Progress 
                        value={100 - Math.min(((exec.p1_cases || 0) + (exec.p2_cases || 0)) * 10, 100)} 
                        className="h-2"
                      />
                    </div>
                    {exec.trends && (
                      <div className="flex gap-4 pt-2">
                        <div className={`flex items-center gap-1 text-sm ${
                          exec.trends.observations?.direction === "down" ? "text-green-600" : "text-orange-600"
                        }`}>
                          {exec.trends.observations?.direction === "up" ? 
                            <TrendingUp className="w-4 h-4" /> : 
                            <TrendingDown className="w-4 h-4" />}
                          <span>Observations: {exec.trends.observations?.current || 0}</span>
                        </div>
                        <div className={`flex items-center gap-1 text-sm ${
                          exec.trends.alerts?.direction === "down" ? "text-green-600" : "text-orange-600"
                        }`}>
                          {exec.trends.alerts?.direction === "up" ? 
                            <TrendingUp className="w-4 h-4" /> : 
                            <TrendingDown className="w-4 h-4" />}
                          <span>Alerts: {exec.trends.alerts?.current || 0}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Cases */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    Recent Reliability Cases
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/reliability/cases")}
                  >
                    View All
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {casesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : cases.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No reliability cases yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => navigate("/reliability/cases")}
                    >
                      Create First Case
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cases.map((c) => (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                        onClick={() => navigate(`/reliability/cases/${c.id}`)}
                      >
                        <div className={`px-2 py-1 rounded text-xs font-bold ${priorityColors[c.priority] || priorityColors.P3}`}>
                          {c.priority}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-zinc-500">{c.case_number}</span>
                            <Badge variant="secondary" className={`text-xs ${statusColors[c.status] || ""}`}>
                              {c.status?.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="font-medium text-sm truncate">{c.title}</p>
                          {c.equipment_name && (
                            <p className="text-xs text-zinc-500 truncate">{c.equipment_name}</p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-400" />
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Alerts & Equipment at Risk */}
          <div className="space-y-6">
            {/* Emerging Risks */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  Emerging Risks
                </CardTitle>
                <CardDescription>High-severity observations this week</CardDescription>
              </CardHeader>
              <CardContent>
                {intelLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : (intel.emerging_risks || []).length === 0 ? (
                  <div className="text-center py-6 text-zinc-500">
                    <Shield className="w-10 h-10 mx-auto mb-2 opacity-50 text-green-500" />
                    <p className="text-sm">No emerging risks detected</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(intel.emerging_risks || []).slice(0, 5).map((risk, i) => (
                      <div
                        key={risk.id || i}
                        className="flex items-center gap-3 p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                      >
                        <Zap className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{risk.title}</p>
                          <p className="text-xs text-zinc-500">{risk.equipment_name || "Unknown equipment"}</p>
                        </div>
                        <Badge variant="destructive" className="text-xs">{risk.severity}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Equipment at Risk */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-red-500" />
                  Equipment at Risk
                </CardTitle>
                <CardDescription>Health score below 70%</CardDescription>
              </CardHeader>
              <CardContent>
                {atRiskLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : atRisk.length === 0 ? (
                  <div className="text-center py-6 text-zinc-500">
                    <Shield className="w-10 h-10 mx-auto mb-2 opacity-50 text-green-500" />
                    <p className="text-sm">All equipment healthy</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {atRisk.map((eq, i) => (
                      <div
                        key={eq.equipment_id || i}
                        className="flex items-center gap-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                      >
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">
                            {Math.round(eq.overall_health_score || eq.latest?.overall_health_score || 0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {eq.equipment_name || eq.latest?.equipment_name || "Unknown"}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {eq.equipment_tag || eq.latest?.equipment_tag || "—"}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Correlations */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-purple-500" />
                  Active Correlations
                </CardTitle>
                <CardDescription>Related events detected</CardDescription>
              </CardHeader>
              <CardContent>
                {intelLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : (intel.correlations || []).length === 0 ? (
                  <div className="text-center py-6 text-zinc-500">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No active correlations</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(intel.correlations || []).slice(0, 3).map((corr, i) => (
                      <div
                        key={corr.id || i}
                        className="flex items-center gap-3 p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
                      >
                        <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                          <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                            {(corr.observation_ids?.length || 0) + (corr.alert_ids?.length || 0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {corr.observation_ids?.length || 0} obs + {corr.alert_ids?.length || 0} alerts
                          </p>
                          <p className="text-xs text-zinc-500">
                            Score: {((corr.correlation_result?.correlation_score || 0) * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => navigate("/reliability/cases")}
          >
            <FileText className="w-4 h-4 mr-2" />
            View All Cases
          </Button>
          <Button
            variant="outline"
            onClick={() => setCopilotOpen(true)}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Chat with Copilot
          </Button>
        </div>
      </div>

      {/* Copilot Sidebar */}
      <RILCopilot open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}
