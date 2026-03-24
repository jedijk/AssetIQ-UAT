import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Activity,
  Layers,
  FileText,
  RefreshCw,
  ArrowRight,
  ChevronDown,
  Filter,
  Download,
  Calendar,
  Zap,
  Shield,
  AlertCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

// Get base URL without /api suffix
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

// API functions
const analyticsAPI = {
  getFullDashboard: async () => {
    const response = await fetch(`${API_BASE_URL}/api/analytics/dashboard`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch analytics");
    return response.json();
  },
  getTopRisks: async (limit = 10) => {
    const response = await fetch(`${API_BASE_URL}/api/analytics/top-risks?limit=${limit}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch top risks");
    return response.json();
  },
  getFailureModePareto: async () => {
    const response = await fetch(`${API_BASE_URL}/api/analytics/failure-mode-pareto`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch pareto");
    return response.json();
  }
};

// Risk level badge component
const RiskBadge = ({ rpn }) => {
  const level = rpn >= 200 ? "critical" : rpn >= 150 ? "high" : rpn >= 100 ? "medium" : "low";
  const colors = {
    critical: "bg-red-100 text-red-800 border-red-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    low: "bg-green-100 text-green-800 border-green-200"
  };
  return (
    <Badge className={colors[level]}>
      RPN: {rpn}
    </Badge>
  );
};

// Simple bar chart component
const SimpleBarChart = ({ data, maxValue, label }) => {
  return (
    <div className="space-y-2">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <div className="w-32 text-sm text-slate-600 truncate" title={item.name}>
            {item.name}
          </div>
          <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${Math.min((item.value / maxValue) * 100, 100)}%` }}
            />
          </div>
          <div className="w-12 text-sm font-medium text-slate-700 text-right">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
};

// Stat card component
const StatCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, color = "blue", onClick }) => {
  const colors = {
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-green-600",
    amber: "from-amber-500 to-amber-600",
    red: "from-red-500 to-red-600",
    purple: "from-purple-500 to-purple-600",
  };
  
  return (
    <Card 
      className={`relative overflow-hidden ${onClick ? "cursor-pointer hover:shadow-lg transition-shadow" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
            {subtitle && (
              <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className={`flex items-center gap-1 mt-2 text-sm ${
                trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-slate-500"
              }`}>
                {trend === "up" ? <TrendingUp className="w-4 h-4" /> : 
                 trend === "down" ? <TrendingDown className="w-4 h-4" /> : null}
                {trendValue}
              </div>
            )}
          </div>
          <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const AnalyticsDashboardPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [timePeriod, setTimePeriod] = useState("30");

  // Fetch analytics data
  const { data: dashboard, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: analyticsAPI.getFullDashboard,
    refetchInterval: 60000 // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const riskOverview = dashboard?.risk_overview || {};
  const taskCompliance = dashboard?.task_compliance || {};
  const topRisks = dashboard?.top_risks || [];
  const failureModePareto = dashboard?.failure_mode_pareto || {};
  const taskWorkload = dashboard?.task_workload || [];
  const detectionEffectiveness = dashboard?.detection_effectiveness || {};
  const equipmentRiskRanking = dashboard?.equipment_risk_ranking || [];
  const formSummary = dashboard?.form_summary || {};

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="analytics-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
            <p className="text-sm text-slate-500">Real-time reliability intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Risk Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Threats"
          value={riskOverview?.threats?.total || 0}
          subtitle={`Avg Risk: ${riskOverview?.threats?.avg_risk_score || 0}`}
          icon={AlertTriangle}
          color="amber"
          onClick={() => navigate("/threats")}
        />
        <StatCard
          title="Critical Risks"
          value={(riskOverview?.threats?.by_level?.critical || 0) + (riskOverview?.threats?.by_level?.high || 0)}
          subtitle="Critical + High"
          icon={AlertCircle}
          color="red"
        />
        <StatCard
          title="High Risk EFMs"
          value={riskOverview?.efms?.high_risk || 0}
          subtitle={`of ${riskOverview?.efms?.total || 0} total`}
          icon={Shield}
          color="purple"
        />
        <StatCard
          title="Avg RPN"
          value={riskOverview?.efms?.avg_rpn || 0}
          subtitle="Equipment Failure Modes"
          icon={Activity}
          color="blue"
        />
      </div>

      {/* Task Compliance Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Task Compliance"
          value={`${taskCompliance?.compliance_rate || 100}%`}
          subtitle={`${taskCompliance?.total_tasks || 0} tasks`}
          icon={CheckCircle2}
          color="green"
          trend={taskCompliance?.compliance_rate >= 90 ? "up" : "down"}
          trendValue={taskCompliance?.compliance_rate >= 90 ? "On track" : "Below target"}
        />
        <StatCard
          title="Overdue Tasks"
          value={taskCompliance?.by_status?.overdue || 0}
          subtitle={`${taskCompliance?.overdue_rate || 0}% overdue rate`}
          icon={Clock}
          color={taskCompliance?.overdue_rate > 10 ? "red" : "amber"}
        />
        <StatCard
          title="Issues Found Rate"
          value={`${taskCompliance?.issues_found_rate || 0}%`}
          subtitle="During task execution"
          icon={Target}
          color="blue"
        />
        <StatCard
          title="Form Submissions"
          value={formSummary?.total_submissions || 0}
          subtitle={`${formSummary?.critical_rate || 0}% critical`}
          icon={FileText}
          color={formSummary?.critical_rate > 5 ? "red" : "green"}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Risks */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Top Risks by RPN</CardTitle>
                <CardDescription>Equipment Failure Modes with highest risk</CardDescription>
              </div>
              <Badge variant="outline" className="gap-1">
                <Zap className="w-3 h-3" /> Top 10
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {topRisks.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No risk data available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topRisks.slice(0, 5).map((risk, idx) => (
                  <div 
                    key={risk.id} 
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      idx === 0 ? "bg-red-500 text-white" :
                      idx === 1 ? "bg-orange-500 text-white" :
                      idx === 2 ? "bg-amber-500 text-white" :
                      "bg-slate-200 text-slate-700"
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {risk.equipment_name}
                      </div>
                      <div className="text-sm text-slate-500 truncate">
                        {risk.failure_mode}
                      </div>
                    </div>
                    <RiskBadge rpn={risk.rpn} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Failure Mode Pareto */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Failure Mode Pareto</CardTitle>
                <CardDescription>Most observed failure modes</CardDescription>
              </div>
              <Badge variant="outline">
                {failureModePareto?.total_observations || 0} observations
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {(failureModePareto?.failure_modes || []).length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No observation data</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(failureModePareto?.failure_modes || []).slice(0, 5).map((fm, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-40 text-sm text-slate-700 truncate font-medium" title={fm.failure_mode}>
                      {fm.failure_mode}
                    </div>
                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                        style={{ width: `${fm.cumulative_percentage}%` }}
                      />
                    </div>
                    <div className="w-20 text-right">
                      <span className="text-sm font-semibold text-slate-700">{fm.count}</span>
                      <span className="text-xs text-slate-400 ml-1">({fm.percentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Equipment Risk Ranking & Detection Effectiveness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Equipment Risk Ranking */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Equipment Risk Ranking</CardTitle>
            <CardDescription>Equipment by aggregated failure mode risk</CardDescription>
          </CardHeader>
          <CardContent>
            {equipmentRiskRanking.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No equipment data</p>
              </div>
            ) : (
              <SimpleBarChart
                data={equipmentRiskRanking.slice(0, 6).map(eq => ({
                  name: eq.equipment_name,
                  value: eq.max_rpn
                }))}
                maxValue={Math.max(...equipmentRiskRanking.map(eq => eq.max_rpn), 1)}
                label="Max RPN"
              />
            )}
          </CardContent>
        </Card>

        {/* Detection Effectiveness */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Detection Effectiveness</CardTitle>
            <CardDescription>Task templates by issue detection rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Effective Tasks (≥20% detection)
                </h4>
                {(detectionEffectiveness?.effective_tasks || []).length === 0 ? (
                  <p className="text-sm text-slate-400">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {(detectionEffectiveness?.effective_tasks || []).slice(0, 3).map((task, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 bg-green-50 rounded">
                        <span className="truncate">{task.template_name}</span>
                        <Badge className="bg-green-100 text-green-700">{task.detection_rate}%</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Ineffective Tasks (&lt;20% detection)
                </h4>
                {(detectionEffectiveness?.ineffective_tasks || []).length === 0 ? (
                  <p className="text-sm text-slate-400">No concerns</p>
                ) : (
                  <div className="space-y-2">
                    {(detectionEffectiveness?.ineffective_tasks || []).slice(0, 3).map((task, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 bg-amber-50 rounded">
                        <span className="truncate">{task.template_name}</span>
                        <Badge className="bg-amber-100 text-amber-700">{task.detection_rate}%</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Workload Calendar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Task Workload</CardTitle>
              <CardDescription>Upcoming 7-day task distribution</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {taskWorkload.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No scheduled tasks</p>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {taskWorkload.map((day, idx) => {
                const date = new Date(day.date);
                const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
                const dayNum = date.getDate();
                const isToday = new Date().toDateString() === date.toDateString();
                
                return (
                  <div 
                    key={idx}
                    className={`text-center p-3 rounded-lg ${
                      isToday ? "bg-blue-100 border-2 border-blue-500" : "bg-slate-50"
                    }`}
                  >
                    <div className={`text-xs font-medium ${isToday ? "text-blue-700" : "text-slate-500"}`}>
                      {dayName}
                    </div>
                    <div className={`text-lg font-bold ${isToday ? "text-blue-700" : "text-slate-700"}`}>
                      {dayNum}
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="text-xs">
                        <span className="font-semibold text-slate-700">{day.total}</span>
                        <span className="text-slate-400"> tasks</span>
                      </div>
                      {day.overdue > 0 && (
                        <Badge className="bg-red-100 text-red-700 text-xs">
                          {day.overdue} overdue
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsDashboardPage;
