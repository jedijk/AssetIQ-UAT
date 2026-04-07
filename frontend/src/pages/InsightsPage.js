import { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { getBackendUrl } from "../lib/apiConfig";
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  TrendingUp,
  TrendingDown,
  Users,
  Database,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  BarChart3,
  Target,
  Zap,
  Shield,
  FileWarning,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API_URL = getBackendUrl();

const InsightsPage = ({ embedded = false }) => {
  const { t } = useLanguage();
  
  // State for all data sections
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [actionMetrics, setActionMetrics] = useState(null);
  const [taskMetrics, setTaskMetrics] = useState(null);
  const [disciplinePerformance, setDisciplinePerformance] = useState(null);
  const [dataQuality, setDataQuality] = useState(null);
  const [gaps, setGaps] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [generatingRecommendations, setGeneratingRecommendations] = useState(false);

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [
        summaryRes,
        actionsRes,
        tasksRes,
        disciplinesRes,
        qualityRes,
        gapsRes
      ] = await Promise.all([
        axios.get(`${API_URL}/api/insights/summary`),
        axios.get(`${API_URL}/api/execution/actions`),
        axios.get(`${API_URL}/api/execution/tasks`),
        axios.get(`${API_URL}/api/execution/disciplines`),
        axios.get(`${API_URL}/api/reliability/data-quality`),
        axios.get(`${API_URL}/api/reliability/gaps`)
      ]);
      
      setSummary(summaryRes.data);
      setActionMetrics(actionsRes.data);
      setTaskMetrics(tasksRes.data);
      setDisciplinePerformance(disciplinesRes.data);
      setDataQuality(qualityRes.data);
      setGaps(gapsRes.data);
    } catch (err) {
      console.error("Error fetching insights:", err);
      setError("Unable to load reliability data");
      toast.error("Failed to load insights data");
    } finally {
      setLoading(false);
    }
  };

  const generateRecommendations = async () => {
    setGeneratingRecommendations(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai/recommendations`);
      setRecommendations(res.data);
      toast.success("Recommendations generated successfully");
    } catch (err) {
      console.error("Error generating recommendations:", err);
      toast.error("Failed to generate recommendations");
    } finally {
      setGeneratingRecommendations(false);
    }
  };

  // Helper to get status color
  const getStatusColor = (status) => {
    switch (status) {
      case "good": return "text-green-600 bg-green-50";
      case "warning": return "text-amber-600 bg-amber-50";
      case "critical": return "text-red-600 bg-red-50";
      default: return "text-slate-600 bg-slate-50";
    }
  };

  const getClassificationColor = (classification) => {
    switch (classification) {
      case "good": return "bg-green-100 text-green-700 border-green-200";
      case "average": return "bg-amber-100 text-amber-700 border-amber-200";
      case "bad": return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getImpactBadge = (impact) => {
    switch (impact) {
      case "high": return <Badge className="bg-red-100 text-red-700 border-red-200">High Impact</Badge>;
      case "medium": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Medium Impact</Badge>;
      case "low": return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Low Impact</Badge>;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className={`${embedded ? 'p-4 sm:p-6' : 'p-6'} space-y-6`} data-testid="insights-loading">
        {!embedded && (
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Execution & Reliability Insights</h1>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center text-slate-500 py-8">Loading insights...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${embedded ? 'p-4 sm:p-6' : 'p-6'}`} data-testid="insights-error">
        {!embedded && (
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Execution & Reliability Insights</h1>
          </div>
        )}
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-700 font-medium">{error}</p>
            <Button onClick={fetchAllData} className="mt-4" variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasData = summary?.total_actions > 0 || summary?.total_assets > 0;

  return (
    <div className={`${embedded ? 'p-4 sm:p-6' : 'p-6'} space-y-6`} data-testid="insights-page">
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Execution & Reliability Insights</h1>
          </div>
          <Button onClick={fetchAllData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      )}
      
      {embedded && (
        <div className="flex items-center justify-end">
          <Button onClick={fetchAllData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      )}

      {/* Section 7: Key Insights Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="insights-summary">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Execution Success Rate</p>
                <p className="text-2xl font-bold text-slate-900">{summary?.execution_success_rate || 0}%</p>
              </div>
              <div className={`p-3 rounded-xl ${summary?.execution_success_rate >= 80 ? 'bg-green-100' : summary?.execution_success_rate >= 50 ? 'bg-amber-100' : 'bg-red-100'}`}>
                <CheckCircle2 className={`w-6 h-6 ${summary?.execution_success_rate >= 80 ? 'text-green-600' : summary?.execution_success_rate >= 50 ? 'text-amber-600' : 'text-red-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Data Completeness</p>
                <p className="text-2xl font-bold text-slate-900">{summary?.data_completeness_score || 0}%</p>
              </div>
              <div className={`p-3 rounded-xl ${summary?.data_completeness_score >= 80 ? 'bg-green-100' : summary?.data_completeness_score >= 50 ? 'bg-amber-100' : 'bg-red-100'}`}>
                <Database className={`w-6 h-6 ${summary?.data_completeness_score >= 80 ? 'text-green-600' : summary?.data_completeness_score >= 50 ? 'text-amber-600' : 'text-red-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Underperforming Disciplines</p>
                <p className="text-2xl font-bold text-slate-900">{summary?.bad_actors_count || 0}</p>
              </div>
              <div className={`p-3 rounded-xl ${summary?.bad_actors_count === 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <Users className={`w-6 h-6 ${summary?.bad_actors_count === 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Critical Gaps</p>
                <p className="text-2xl font-bold text-slate-900">{summary?.critical_gaps_count || 0}</p>
              </div>
              <div className={`p-3 rounded-xl ${summary?.critical_gaps_count === 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <AlertTriangle className={`w-6 h-6 ${summary?.critical_gaps_count === 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!hasData ? (
        <Card className="border-slate-200">
          <CardContent className="p-12 text-center">
            <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">No Execution Data Available</h3>
            <p className="text-slate-500">Start creating observations, actions, and tasks to see insights here.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Section 1: Execution Performance */}
          <Card data-testid="execution-performance">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                Execution Performance
              </CardTitle>
              <CardDescription>Evaluate how well actions are executed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-500">Total Actions</p>
                  <p className="text-2xl font-bold text-slate-900">{actionMetrics?.total_actions || 0}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-xl">
                  <p className="text-sm text-green-600">Completed</p>
                  <p className="text-2xl font-bold text-green-700">{actionMetrics?.completed_actions || 0}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-xl">
                  <p className="text-sm text-red-600">Failed</p>
                  <p className="text-2xl font-bold text-red-700">{actionMetrics?.failed_actions || 0}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl">
                  <p className="text-sm text-blue-600">Success Rate</p>
                  <p className="text-2xl font-bold text-blue-700">{actionMetrics?.success_rate || 0}%</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl">
                  <p className="text-sm text-purple-600">Avg. Completion</p>
                  <p className="text-2xl font-bold text-purple-700">{actionMetrics?.avg_completion_time_days || 0}d</p>
                </div>
              </div>
              
              {actionMetrics?.breakdown && (
                <div className="mt-4 pt-4 border-t flex gap-6 text-sm text-slate-500">
                  <span>By Observation: {actionMetrics.breakdown.by_observation_count}</span>
                  <span>By Investigation: {actionMetrics.breakdown.by_investigation_count}</span>
                  <span>By Asset: {actionMetrics.breakdown.by_asset_count}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Task Execution Overview */}
          <Card data-testid="task-execution">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Task Execution Overview
              </CardTitle>
              <CardDescription>Compare recurring vs ad-hoc execution behavior</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recurring Tasks */}
                <div className="p-4 border rounded-xl">
                  <div className="flex items-center gap-2 mb-4">
                    <RefreshCw className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-slate-900">Recurring Tasks</h4>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total</span>
                      <span className="font-medium">{taskMetrics?.recurring?.total || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Completion Rate</span>
                      <span className="font-medium text-green-600">{taskMetrics?.recurring?.completion_rate || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Failure Rate</span>
                      <span className="font-medium text-red-600">{taskMetrics?.recurring?.failure_rate || 0}%</span>
                    </div>
                    <Progress value={taskMetrics?.recurring?.completion_rate || 0} className="h-2" />
                  </div>
                </div>

                {/* Ad-hoc Tasks */}
                <div className="p-4 border rounded-xl">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5 text-amber-600" />
                    <h4 className="font-semibold text-slate-900">Ad-hoc Tasks</h4>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total</span>
                      <span className="font-medium">{taskMetrics?.adhoc?.total || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Completion Rate</span>
                      <span className="font-medium text-green-600">{taskMetrics?.adhoc?.completion_rate || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Failure Rate</span>
                      <span className="font-medium text-red-600">{taskMetrics?.adhoc?.failure_rate || 0}%</span>
                    </div>
                    <Progress value={taskMetrics?.adhoc?.completion_rate || 0} className="h-2" />
                  </div>
                </div>
              </div>

              {/* Insights */}
              {taskMetrics?.insights && (
                <div className="mt-4 p-4 bg-blue-50 rounded-xl flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Insight</p>
                    <p className="text-sm text-blue-700">
                      {taskMetrics.insights.more_efficient === "recurring" 
                        ? "Recurring tasks have better completion rates. Consider converting frequent ad-hoc tasks to scheduled maintenance."
                        : taskMetrics.insights.more_efficient === "adhoc"
                          ? "Ad-hoc tasks currently have better completion rates."
                          : "Recurring and ad-hoc tasks have similar efficiency."}
                      {taskMetrics.insights.reactive_pattern && " You have more ad-hoc than recurring tasks, indicating a reactive maintenance pattern."}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Discipline Performance */}
          <Card data-testid="discipline-performance">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Discipline Performance
              </CardTitle>
              <CardDescription>Performance metrics by discipline based on execution quality</CardDescription>
            </CardHeader>
            <CardContent>
              {disciplinePerformance?.disciplines?.length > 0 ? (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="p-3 bg-green-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-700">{disciplinePerformance.summary?.good_actors || 0}</p>
                      <p className="text-sm text-green-600">Good (&lt;5% failure)</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-amber-700">{disciplinePerformance.summary?.average_actors || 0}</p>
                      <p className="text-sm text-amber-600">Average (5-15%)</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-red-700">{disciplinePerformance.summary?.bad_actors || 0}</p>
                      <p className="text-sm text-red-600">Needs Improvement (&gt;15%)</p>
                    </div>
                  </div>

                  {/* Discipline Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Discipline</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600">Tasks</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600">Completed</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600">Failed</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600">Failure Rate</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600">Avg Time</th>
                          <th className="text-center py-2 px-3 font-medium text-slate-600">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {disciplinePerformance.disciplines.slice(0, 10).map((d) => (
                          <tr key={d.discipline} className="border-b hover:bg-slate-50">
                            <td className="py-2 px-3 font-medium">{d.discipline}</td>
                            <td className="py-2 px-3 text-center">{d.total_tasks}</td>
                            <td className="py-2 px-3 text-center text-green-600">{d.completed}</td>
                            <td className="py-2 px-3 text-center text-red-600">{d.failed}</td>
                            <td className="py-2 px-3 text-center">{d.failure_rate}%</td>
                            <td className="py-2 px-3 text-center">{d.avg_completion_time_days}d</td>
                            <td className="py-2 px-3 text-center">
                              <Badge className={getClassificationColor(d.classification)}>
                                {d.classification === "good" ? "Good" : d.classification === "average" ? "Average" : "Needs Work"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Top and Bottom Performers */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {disciplinePerformance.top_performers?.length > 0 && (
                      <div className="p-4 bg-green-50 rounded-xl">
                        <h4 className="font-semibold text-green-800 flex items-center gap-2 mb-3">
                          <TrendingUp className="w-4 h-4" />
                          Top Performers
                        </h4>
                        <ul className="space-y-2">
                          {disciplinePerformance.top_performers.slice(0, 5).map((d) => (
                            <li key={d.discipline} className="flex justify-between text-sm">
                              <span className="text-green-700">{d.discipline}</span>
                              <span className="text-green-600 font-medium">{d.completion_rate}% completion</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {disciplinePerformance.bottom_performers?.length > 0 && (
                      <div className="p-4 bg-red-50 rounded-xl">
                        <h4 className="font-semibold text-red-800 flex items-center gap-2 mb-3">
                          <TrendingDown className="w-4 h-4" />
                          Needs Improvement
                        </h4>
                        <ul className="space-y-2">
                          {disciplinePerformance.bottom_performers.slice(0, 5).map((d) => (
                            <li key={d.discipline} className="flex justify-between text-sm">
                              <span className="text-red-700">{d.discipline}</span>
                              <span className="text-red-600 font-medium">{d.failure_rate}% failure rate</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  No discipline performance data available yet.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 4: Data Completeness */}
          <Card data-testid="data-completeness">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                Data Completeness
              </CardTitle>
              <CardDescription>Quality and completeness of reliability data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Criticality Coverage */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Criticality Assessment</span>
                    <span className={`font-medium ${dataQuality?.metrics?.criticality_coverage >= 80 ? 'text-green-600' : dataQuality?.metrics?.criticality_coverage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {dataQuality?.metrics?.criticality_coverage || 0}%
                    </span>
                  </div>
                  <Progress 
                    value={dataQuality?.metrics?.criticality_coverage || 0} 
                    className={`h-3 ${dataQuality?.metrics?.criticality_coverage >= 80 ? '[&>div]:bg-green-500' : dataQuality?.metrics?.criticality_coverage >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`}
                  />
                  <p className="text-xs text-slate-500">{dataQuality?.details?.assets_with_criticality || 0} of {dataQuality?.details?.total_assets || 0} assets</p>
                </div>

                {/* FMEA Coverage */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">FMEA Available</span>
                    <span className={`font-medium ${dataQuality?.metrics?.fmea_coverage >= 80 ? 'text-green-600' : dataQuality?.metrics?.fmea_coverage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {dataQuality?.metrics?.fmea_coverage || 0}%
                    </span>
                  </div>
                  <Progress 
                    value={dataQuality?.metrics?.fmea_coverage || 0} 
                    className={`h-3 ${dataQuality?.metrics?.fmea_coverage >= 80 ? '[&>div]:bg-green-500' : dataQuality?.metrics?.fmea_coverage >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`}
                  />
                  <p className="text-xs text-slate-500">{dataQuality?.details?.assets_with_fmea || 0} of {dataQuality?.details?.total_assets || 0} assets</p>
                </div>

                {/* Equipment Type Mapping */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Equipment Type Mapping</span>
                    <span className={`font-medium ${dataQuality?.metrics?.equipment_type_coverage >= 80 ? 'text-green-600' : dataQuality?.metrics?.equipment_type_coverage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {dataQuality?.metrics?.equipment_type_coverage || 0}%
                    </span>
                  </div>
                  <Progress 
                    value={dataQuality?.metrics?.equipment_type_coverage || 0} 
                    className={`h-3 ${dataQuality?.metrics?.equipment_type_coverage >= 80 ? '[&>div]:bg-green-500' : dataQuality?.metrics?.equipment_type_coverage >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`}
                  />
                  <p className="text-xs text-slate-500">{dataQuality?.details?.assets_with_type || 0} of {dataQuality?.details?.total_assets || 0} assets</p>
                </div>
              </div>

              {/* Overall Score */}
              <div className="mt-6 p-4 bg-slate-50 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Overall Completeness Score</p>
                  <p className="text-3xl font-bold text-slate-900">{dataQuality?.overall_score || 0}%</p>
                </div>
                <Badge className={getStatusColor(dataQuality?.status)}>
                  {dataQuality?.status === "good" ? "Good" : dataQuality?.status === "warning" ? "Warning" : "Critical"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Section 5: Reliability Gaps */}
          <Card data-testid="reliability-gaps">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="w-5 h-5 text-blue-600" />
                Reliability Gaps
              </CardTitle>
              <CardDescription>Areas where execution or data is insufficient</CardDescription>
            </CardHeader>
            <CardContent>
              {gaps?.gaps?.length > 0 ? (
                <div className="space-y-4">
                  {gaps.gaps.map((gap) => (
                    <div key={`gap-${gap.title}-${gap.severity}`} className={`p-4 rounded-xl border ${gap.severity === 'high' ? 'border-red-200 bg-red-50' : gap.severity === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className={`font-semibold ${gap.severity === 'high' ? 'text-red-800' : gap.severity === 'medium' ? 'text-amber-800' : 'text-blue-800'}`}>
                            {gap.title}
                          </h4>
                          <p className={`text-sm mt-1 ${gap.severity === 'high' ? 'text-red-600' : gap.severity === 'medium' ? 'text-amber-600' : 'text-blue-600'}`}>
                            {gap.description}
                          </p>
                        </div>
                        <Badge className={gap.severity === 'high' ? 'bg-red-200 text-red-800' : gap.severity === 'medium' ? 'bg-amber-200 text-amber-800' : 'bg-blue-200 text-blue-800'}>
                          {gap.severity}
                        </Badge>
                      </div>
                      {gap.items?.length > 0 && (
                        <div className="mt-3 text-sm">
                          <p className="text-slate-500 mb-1">Examples:</p>
                          <ul className="list-disc list-inside space-y-1">
                          {gap.items.slice(0, 3).map((item) => (
                              <li key={item.id || item.name || item.title} className="text-slate-600">
                                {item.name || item.title || item.id}
                                {item.failure_rate && ` (${item.failure_rate}% failure)`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Shield className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-green-700 font-medium">No critical gaps identified</p>
                  <p className="text-slate-500 text-sm mt-1">Your reliability data looks complete!</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 6: AI Recommendations */}
          <Card data-testid="ai-recommendations">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    AI Recommendations
                  </CardTitle>
                  <CardDescription>Actionable improvements based on current data</CardDescription>
                </div>
                <Button 
                  onClick={generateRecommendations} 
                  disabled={generatingRecommendations}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  {generatingRecommendations ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recommendations?.recommendations ? (
                <div className="space-y-4">
                  {recommendations.recommendations.map((rec, i) => (
                    <div key={i} className="p-4 border rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                            {rec.impact === 'high' ? <ArrowUpRight className="w-4 h-4 text-red-500" /> : 
                             rec.impact === 'medium' ? <Minus className="w-4 h-4 text-amber-500" /> : 
                             <ArrowDownRight className="w-4 h-4 text-blue-500" />}
                            {rec.title}
                          </h4>
                          <p className="text-sm text-slate-600 mt-1">{rec.description}</p>
                        </div>
                        {getImpactBadge(rec.impact)}
                      </div>
                    </div>
                  ))}
                  {recommendations.generated_at && (
                    <p className="text-xs text-slate-400 text-right mt-4">
                      Generated: {new Date(recommendations.generated_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">Click "Generate" to get AI-powered recommendations</p>
                  <p className="text-slate-400 text-sm mt-1">Based on your execution and reliability data</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default InsightsPage;
