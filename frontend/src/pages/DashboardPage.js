import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { statsAPI, actionsAPI, investigationAPI, equipmentHierarchyAPI, threatsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  GitBranch,
  Wrench,
  FileText,
  BarChart3,
  PieChart,
  Layers,
  AlertOctagon,
  Zap,
  Shield,
  Calendar,
  Users,
  Gauge,
} from "lucide-react";
import { Progress } from "../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import ReliabilityPerformancePage from "./ReliabilityPerformancePage";

// Mini chart component for trends
const MiniBarChart = ({ data, maxValue }) => {
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((value, idx) => (
        <div
          key={idx}
          className="flex-1 bg-indigo-400 rounded-t transition-all hover:bg-indigo-500"
          style={{ height: `${(value / maxValue) * 100}%`, minHeight: value > 0 ? '4px' : '0' }}
        />
      ))}
    </div>
  );
};

// Stat card component
const StatCard = ({ label, value, icon: Icon, color, bg, subtitle, trend, trendUp }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
      <div className={`p-2.5 rounded-xl ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
    {trend !== undefined && (
      <div className={`flex items-center gap-1 mt-2 text-xs ${trendUp ? 'text-red-500' : 'text-green-500'}`}>
        {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span>{trend}% vs last week</span>
      </div>
    )}
  </motion.div>
);

// Progress card for completion metrics
const ProgressCard = ({ title, completed, total, icon: Icon, color }) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">{title}</p>
          <p className="text-xs text-slate-400">{completed} of {total} completed</p>
        </div>
      </div>
      <Progress value={percentage} className="h-2" />
      <p className="text-right text-xs text-slate-500 mt-1">{percentage}%</p>
    </div>
  );
};

// Distribution card
const DistributionCard = ({ title, data, colors }) => {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-medium text-slate-700 mb-3">{title}</h3>
      <div className="space-y-2">
        {Object.entries(data).map(([key, value], idx) => {
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${colors[idx % colors.length]}`} />
              <span className="text-xs text-slate-600 flex-1 capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="text-xs font-medium text-slate-700">{value}</span>
              <span className="text-xs text-slate-400">({percentage}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Recent item card
const RecentItemCard = ({ items, title, icon: Icon, emptyMessage, renderItem }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-slate-500" />
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
    </div>
    {items.length > 0 ? (
      <div className="space-y-2">
        {items.slice(0, 5).map((item, idx) => renderItem(item, idx))}
      </div>
    ) : (
      <p className="text-xs text-slate-400 text-center py-4">{emptyMessage}</p>
    )}
  </div>
);

export default function DashboardPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("operational");

  // Fetch all data
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: statsAPI.get,
  });

  const { data: threatsData = [] } = useQuery({
    queryKey: ["threats"],
    queryFn: threatsAPI.getAll,
  });
  const threats = Array.isArray(threatsData) ? threatsData : [];

  const { data: actionsData = [] } = useQuery({
    queryKey: ["actions"],
    queryFn: actionsAPI.getAll,
  });
  const actions = Array.isArray(actionsData) ? actionsData : [];

  const { data: investigationsData = [] } = useQuery({
    queryKey: ["investigations"],
    queryFn: investigationAPI.getAll,
  });
  const investigations = Array.isArray(investigationsData) ? investigationsData : [];

  const { data: equipmentData = [] } = useQuery({
    queryKey: ["equipment"],
    queryFn: equipmentHierarchyAPI.getAll,
  });
  const equipment = Array.isArray(equipmentData) ? equipmentData : [];

  // Calculate metrics
  const threatsByStatus = threats.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  const threatsByRisk = threats.reduce((acc, t) => {
    acc[t.risk_level] = (acc[t.risk_level] || 0) + 1;
    return acc;
  }, {});

  const threatsByType = threats.reduce((acc, t) => {
    const type = t.equipment_type || "Unknown";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const actionsByStatus = actions.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  const actionsByPriority = actions.reduce((acc, a) => {
    acc[a.priority] = (acc[a.priority] || 0) + 1;
    return acc;
  }, {});

  const investigationsByStatus = investigations.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  // Calculate completion rates
  const closedThreats = (threatsByStatus["Closed"] || 0) + (threatsByStatus["Mitigated"] || 0);
  const completedActions = actionsByStatus["completed"] || 0;
  const completedInvestigations = investigationsByStatus["completed"] || 0;

  // Overall health score (simple calculation)
  const openThreats = threatsByStatus["Open"] || 0;
  const criticalThreats = (threatsByRisk["Critical"] || 0) + (threatsByRisk["High"] || 0);
  const overdueActions = actions.filter(a => {
    if (!a.due_date || a.status === "completed") return false;
    return new Date(a.due_date) < new Date();
  }).length;

  const healthScore = Math.max(0, Math.min(100, 
    100 - (criticalThreats * 10) - (openThreats * 2) - (overdueActions * 5)
  ));

  const getHealthColor = (score) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getHealthLabel = (score) => {
    if (score >= 80) return t("dashboard.excellent") || "Excellent";
    if (score >= 60) return t("dashboard.good") || "Good";
    if (score >= 40) return t("dashboard.needsAttention") || "Needs Attention";
    return t("dashboard.critical") || "Critical";
  };

  return (
    <div className={`${activeTab === 'reliability' ? 'p-0' : 'p-6 max-w-7xl mx-auto'}`} data-testid="dashboard-page">
      {/* Header with Tabs - Only show in operational view */}
      {activeTab === 'operational' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t("dashboard.title") || "Dashboard"}</h1>
              <p className="text-slate-500">{t("dashboard.subtitle") || "Overview of your risk management status"}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full max-w-md grid-cols-2 ${activeTab === 'reliability' ? 'fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800/90 backdrop-blur-sm border border-slate-700' : ''}`}>
          <TabsTrigger value="operational" className={`flex items-center gap-2 ${activeTab === 'reliability' ? 'text-slate-300 data-[state=active]:text-white data-[state=active]:bg-slate-700' : ''}`} data-testid="operational-tab">
            <Activity className="w-4 h-4" />
            {t("dashboard.operational") || "Operational"}
          </TabsTrigger>
          <TabsTrigger value="reliability" className={`flex items-center gap-2 ${activeTab === 'reliability' ? 'text-slate-300 data-[state=active]:text-white data-[state=active]:bg-slate-700' : ''}`} data-testid="reliability-tab">
            <Gauge className="w-4 h-4" />
            {t("dashboard.reliabilityPerformance") || "Reliability Performance"}
          </TabsTrigger>
        </TabsList>
        
        {/* Operational Dashboard Tab */}
        <TabsContent value="operational" className="mt-6">
          {/* Health Score Banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 mb-6 text-white"
          >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm mb-1">{t("dashboard.overallHealth") || "Overall System Health"}</p>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-5xl font-bold ${getHealthColor(healthScore)}`}>{healthScore}</span>
                    <span className="text-slate-400">/100</span>
                    <span className={`text-lg font-medium ${getHealthColor(healthScore)}`}>
                      {getHealthLabel(healthScore)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold">{openThreats}</p>
                    <p className="text-xs text-slate-400">{t("dashboard.openThreats") || "Open Threats"}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-red-400">{criticalThreats}</p>
                    <p className="text-xs text-slate-400">{t("dashboard.criticalHighRisk") || "Critical/High Risk"}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-amber-400">{overdueActions}</p>
                    <p className="text-xs text-slate-400">{t("dashboard.overdueActions") || "Overdue Actions"}</p>
                  </div>
                </div>
              </div>
            </motion.div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t("dashboard.totalThreats") || "Total Threats"}
          value={threats.length}
          icon={AlertTriangle}
          color="text-amber-600"
          bg="bg-amber-50"
          subtitle={`${openThreats} ${t("common.open") || "open"}`}
        />
        <StatCard
          label={t("dashboard.totalActions") || "Total Actions"}
          value={actions.length}
          icon={CheckCircle2}
          color="text-blue-600"
          bg="bg-blue-50"
          subtitle={`${completedActions} ${t("actionsPage.completed") || "completed"}`}
        />
        <StatCard
          label={t("dashboard.investigations") || "Investigations"}
          value={investigations.length}
          icon={GitBranch}
          color="text-purple-600"
          bg="bg-purple-50"
          subtitle={`${completedInvestigations} ${t("actionsPage.completed") || "completed"}`}
        />
        <StatCard
          label={t("dashboard.equipment") || "Equipment"}
          value={equipment.length}
          icon={Layers}
          color="text-green-600"
          bg="bg-green-50"
          subtitle={t("dashboard.totalAssets") || "total assets"}
        />
      </div>

      {/* Progress Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <ProgressCard
          title={t("dashboard.threatResolution") || "Threat Resolution"}
          completed={closedThreats}
          total={threats.length}
          icon={Shield}
          color="bg-amber-500"
        />
        <ProgressCard
          title={t("dashboard.actionCompletion") || "Action Completion"}
          completed={completedActions}
          total={actions.length}
          icon={Target}
          color="bg-blue-500"
        />
        <ProgressCard
          title={t("dashboard.investigationProgress") || "Investigation Progress"}
          completed={completedInvestigations}
          total={investigations.length}
          icon={GitBranch}
          color="bg-purple-500"
        />
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DistributionCard
          title={t("dashboard.threatsByStatus") || "Threats by Status"}
          data={threatsByStatus}
          colors={["bg-blue-400", "bg-amber-400", "bg-green-400", "bg-slate-400"]}
        />
        <DistributionCard
          title={t("dashboard.threatsByRisk") || "Threats by Risk Level"}
          data={threatsByRisk}
          colors={["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"]}
        />
        <DistributionCard
          title={t("dashboard.actionsByStatus") || "Actions by Status"}
          data={actionsByStatus}
          colors={["bg-blue-400", "bg-amber-400", "bg-green-400"]}
        />
        <DistributionCard
          title={t("dashboard.actionsByPriority") || "Actions by Priority"}
          data={actionsByPriority}
          colors={["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"]}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <RecentItemCard
          title={t("dashboard.recentThreats") || "Recent Threats"}
          icon={AlertTriangle}
          items={threats.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noThreats") || "No threats recorded"}
          renderItem={(item, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50">
              <div className={`w-2 h-2 rounded-full ${
                item.risk_level === "Critical" ? "bg-red-500" :
                item.risk_level === "High" ? "bg-orange-500" :
                item.risk_level === "Medium" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.asset}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                item.status === "Open" ? "bg-blue-100 text-blue-700" :
                item.status === "Mitigated" ? "bg-green-100 text-green-700" :
                "bg-slate-100 text-slate-700"
              }`}>{item.status}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentActions") || "Recent Actions"}
          icon={CheckCircle2}
          items={actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noActions") || "No actions recorded"}
          renderItem={(item, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50">
              <div className={`w-2 h-2 rounded-full ${
                item.priority === "critical" ? "bg-red-500" :
                item.priority === "high" ? "bg-orange-500" :
                item.priority === "medium" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.source_name || "Manual"}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                item.status === "completed" ? "bg-green-100 text-green-700" :
                item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status?.replace("_", " ")}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentInvestigations") || "Recent Investigations"}
          icon={GitBranch}
          items={investigations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noInvestigations") || "No investigations started"}
          renderItem={(item, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50">
              <div className={`w-2 h-2 rounded-full ${
                item.status === "completed" ? "bg-green-500" :
                item.status === "in_progress" ? "bg-amber-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.asset_name || "No asset"}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                item.status === "completed" ? "bg-green-100 text-green-700" :
                item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status?.replace("_", " ")}</span>
            </div>
          )}
        />
      </div>

      {/* Equipment by Type */}
      {Object.keys(threatsByType).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 bg-white rounded-xl border border-slate-200 p-4"
        >
          <h3 className="text-sm font-medium text-slate-700 mb-4">{t("dashboard.threatsByEquipment") || "Threats by Equipment Type"}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(threatsByType).map(([type, count], idx) => (
              <div key={type} className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-700">{count}</p>
                <p className="text-xs text-slate-500 truncate" title={type}>{type}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
          </TabsContent>
          
          {/* Reliability Performance Tab */}
          <TabsContent value="reliability" className="mt-0">
            <ReliabilityPerformancePage />
          </TabsContent>
        </Tabs>
    </div>
  );
}
