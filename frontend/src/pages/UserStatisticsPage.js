import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import {
  BarChart3,
  Users,
  Eye,
  Clock,
  TrendingUp,
  Activity,
  RefreshCw,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  MousePointer,
  Zap,
  Monitor,
  Smartphone,
  Tablet,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  Area,
  AreaChart,
} from "recharts";

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

// API functions
const userStatsAPI = {
  getOverview: async (period = "30", roleFilter = null) => {
    let url = `${API_BASE_URL}/api/user-stats/overview?period=${period}`;
    if (roleFilter) url += `&role_filter=${roleFilter}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error("Access denied");
      }
      throw new Error("Failed to fetch statistics");
    }
    return response.json();
  },
  getTrends: async (period = "30") => {
    const response = await fetch(`${API_BASE_URL}/api/user-stats/trends?period=${period}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch trends");
    return response.json();
  }
};

// Chart colors matching Observations page (amber/blue/green palette)
const CHART_COLORS = [
  "#f59e0b", // amber-500 (primary)
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#ef4444", // red-500
  "#06b6d4", // cyan-500
];

// KPI Card Component - matching Observations page style
const KpiCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, color = "amber" }) => {
  const colorMap = {
    amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", iconBg: "bg-amber-100" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", iconBg: "bg-blue-100" },
    green: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", iconBg: "bg-emerald-100" },
    purple: { bg: "bg-violet-50", border: "border-violet-200", icon: "text-violet-600", iconBg: "bg-violet-100" },
    red: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-600", iconBg: "bg-red-100" },
    cyan: { bg: "bg-cyan-50", border: "border-cyan-200", icon: "text-cyan-600", iconBg: "bg-cyan-100" },
  };

  const colors = colorMap[color] || colorMap.amber;

  return (
    <div 
      className={`${colors.bg} border ${colors.border} rounded-xl p-4 hover:shadow-sm transition-all duration-200`}
      data-testid="kpi-card"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
            {title}
          </p>
          <p className="text-xl font-bold text-slate-800" data-testid="kpi-value">
            {value}
          </p>
          {subtitle && (
            <p className="text-[10px] text-slate-500">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 text-[10px] font-medium ${
              trend === "up" ? "text-emerald-600" : "text-red-500"
            }`}>
              {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {trendValue}
            </div>
          )}
        </div>
        <div className={`h-9 w-9 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${colors.icon}`} />
        </div>
      </div>
    </div>
  );
};

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 shadow-lg rounded-lg p-3">
        <p className="text-xs font-semibold text-slate-700 mb-1.5">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-[11px] text-slate-600">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
            {entry.name}: <span className="font-semibold text-slate-800">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const UserStatisticsPage = () => {
  const { t } = useLanguage();
  const [timePeriod, setTimePeriod] = useState("30");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch overview data
  const { 
    data: overview, 
    isLoading, 
    error,
    refetch, 
    isRefetching 
  } = useQuery({
    queryKey: ["user-stats-overview", timePeriod, roleFilter],
    queryFn: () => userStatsAPI.getOverview(timePeriod, roleFilter !== "all" ? roleFilter : null),
    refetchInterval: 60000,
  });

  // Fetch trends data
  const { data: trends } = useQuery({
    queryKey: ["user-stats-trends", timePeriod],
    queryFn: () => userStatsAPI.getTrends(timePeriod),
    enabled: activeTab === "overview" || activeTab === "trends",
  });

  // Handle access denied
  if (error?.message === "Access denied") {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center p-6">
        <div className="h-14 w-14 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center mb-4">
          <Users className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-sm">
          You do not have permission to view user statistics. 
          This feature is available for Administrators and Managers only.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const moduleUsage = overview?.module_usage || [];
  const userActivity = overview?.user_activity || [];
  const actionUsage = overview?.action_usage || [];
  const dailyActiveUsers = trends?.daily_active_users || overview?.daily_active_users || [];
  const dailyViews = trends?.daily_views || overview?.daily_views || [];
  const deviceUsage = overview?.device_usage || { breakdown: { desktop: {}, mobile: {}, tablet: {} }, raw: [] };

  // Prepare pie chart data
  const pieData = moduleUsage.slice(0, 6).map((m, idx) => ({
    name: m.module,
    value: m.views,
    color: CHART_COLORS[idx % CHART_COLORS.length]
  }));

  // Prepare device pie chart data
  const devicePieData = [
    { name: "Desktop", value: deviceUsage.breakdown?.desktop?.views || 0, color: "#3b82f6", icon: Monitor },
    { name: "Mobile", value: deviceUsage.breakdown?.mobile?.views || 0, color: "#10b981", icon: Smartphone },
    { name: "Tablet", value: deviceUsage.breakdown?.tablet?.views || 0, color: "#f59e0b", icon: Tablet },
  ].filter(d => d.value > 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto" data-testid="user-statistics-page">
      {/* Header - matching Observations page style */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800" data-testid="page-title">
              {t("settings.statistics") || "User Statistics"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("settings.statisticsDesc") || "System usage and engagement overview"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Time Period Filter */}
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-[140px] h-9 text-xs border-slate-200 bg-white" data-testid="period-filter">
              <Calendar className="w-3.5 h-3.5 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today" className="text-xs">Today</SelectItem>
              <SelectItem value="7" className="text-xs">Last 7 days</SelectItem>
              <SelectItem value="30" className="text-xs">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Refresh Button */}
          <Button 
            variant="outline" 
            size="sm"
            className="h-9 px-3 text-xs border-slate-200 bg-white hover:bg-slate-50"
            onClick={() => refetch()} 
            disabled={isRefetching}
            data-testid="refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Summary - matching Observations page stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          title="Active Users"
          value={overview?.active_users || 0}
          subtitle="With activity"
          icon={Users}
          color="amber"
        />
        <KpiCard
          title="Sessions"
          value={overview?.total_sessions || 0}
          subtitle="Unique sessions"
          icon={Activity}
          color="blue"
        />
        <KpiCard
          title="Page Views"
          value={overview?.total_views || 0}
          subtitle="Total loads"
          icon={Eye}
          color="green"
        />
        <KpiCard
          title="Avg Duration"
          value={`${overview?.avg_session_duration || 0}s`}
          subtitle="Per interaction"
          icon={Clock}
          color="purple"
        />
        <KpiCard
          title="Top Module"
          value={overview?.most_used_module || "—"}
          subtitle="Most active"
          icon={Zap}
          color="cyan"
        />
        <KpiCard
          title="Low Usage"
          value={overview?.least_used_module || "—"}
          subtitle="Needs attention"
          icon={Layers}
          color="red"
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-5 mb-2 sm:mb-4">
            <TabsTrigger value="overview" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="tab-overview">
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="devices" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="tab-devices">
              <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">Devices</span>
            </TabsTrigger>
            <TabsTrigger value="modules" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="tab-modules">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">Modules</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="tab-users">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">Users</span>
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex items-center gap-1 sm:gap-2 whitespace-nowrap px-3 sm:px-4" data-testid="tab-actions">
              <MousePointer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">Actions</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Module Usage Bar Chart */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">Module Usage</CardTitle>
                <CardDescription className="text-[11px]">Views per module</CardDescription>
              </CardHeader>
              <CardContent>
                {moduleUsage.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No usage data yet</p>
                  </div>
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moduleUsage.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={true} vertical={false} />
                        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis 
                          dataKey="module" 
                          type="category" 
                          width={90}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="views" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Usage Distribution Pie Chart */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">Usage Distribution</CardTitle>
                <CardDescription className="text-[11px]">Percentage of total views</CardDescription>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No data available</p>
                  </div>
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend 
                          layout="vertical" 
                          align="right" 
                          verticalAlign="middle"
                          iconType="circle"
                          iconSize={6}
                          formatter={(value) => <span className="text-[11px] text-slate-600 ml-1">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Daily Trends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Active Users */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">Daily Active Users</CardTitle>
                <CardDescription className="text-[11px]">Users with activity per day</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyActiveUsers.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No trend data available</p>
                  </div>
                ) : (
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyActiveUsers}>
                        <defs>
                          <linearGradient id="colorUsersGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fill: '#94a3b8', fontSize: 9 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#f59e0b" 
                          strokeWidth={2}
                          fill="url(#colorUsersGrad)"
                          name="Active Users"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily Views */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">Daily Views</CardTitle>
                <CardDescription className="text-[11px]">Page loads per day</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyViews.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No view data available</p>
                  </div>
                ) : (
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyViews}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fill: '#94a3b8', fontSize: 9 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line 
                          type="monotone" 
                          dataKey="views" 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          dot={{ fill: '#3b82f6', r: 2, strokeWidth: 0 }}
                          activeDot={{ fill: '#3b82f6', r: 4, strokeWidth: 0 }}
                          name="Views"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Devices Tab - Desktop vs Mobile vs Tablet */}
        <TabsContent value="devices" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Desktop Card */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-blue-50 to-white">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center">
                    <Monitor className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                    {deviceUsage.breakdown?.desktop?.percentage || 0}%
                  </Badge>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800">Desktop</h3>
                <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Views</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.desktop?.views || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Users</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.desktop?.unique_users || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Sessions</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.desktop?.sessions || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mobile Card */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-emerald-50 to-white">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center">
                    <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                    {deviceUsage.breakdown?.mobile?.percentage || 0}%
                  </Badge>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800">Mobile</h3>
                <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Views</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.mobile?.views || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Users</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.mobile?.unique_users || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Sessions</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.mobile?.sessions || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tablet Card */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-amber-50 to-white">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center">
                    <Tablet className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
                  </div>
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                    {deviceUsage.breakdown?.tablet?.percentage || 0}%
                  </Badge>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800">Tablet</h3>
                <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Views</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.tablet?.views || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Users</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.tablet?.unique_users || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Sessions</span>
                    <span className="font-semibold text-slate-700">{deviceUsage.breakdown?.tablet?.sessions || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Device Distribution Chart */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Device Distribution</CardTitle>
              <CardDescription className="text-[11px]">Usage breakdown by device type</CardDescription>
            </CardHeader>
            <CardContent>
              {devicePieData.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Monitor className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No device data available yet</p>
                  <p className="text-[10px] mt-1">Device tracking starts with new page views</p>
                </div>
              ) : (
                <div className="h-[280px] sm:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={devicePieData}
                        cx="50%"
                        cy="45%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {devicePieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        layout="horizontal" 
                        align="center" 
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ paddingTop: '10px' }}
                        formatter={(value, entry) => {
                          const item = devicePieData.find(d => d.name === value);
                          return (
                            <span className="text-xs text-slate-600 ml-1">
                              {value} <span className="font-semibold">({item?.value || 0} views)</span>
                            </span>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Modules Tab */}
        <TabsContent value="modules">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-700">Module Usage Overview</CardTitle>
                  <CardDescription className="text-[11px]">Detailed usage per module</CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-medium bg-amber-50 border-amber-200 text-amber-700">
                  {moduleUsage.length} modules
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Module</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 text-right">Views</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 text-right">Users</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 text-right">Share</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 text-right">Avg Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduleUsage.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-400 text-xs">
                        No module usage data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    moduleUsage.map((module, idx) => (
                      <TableRow key={module.module} className="border-slate-100 hover:bg-slate-50/50">
                        <TableCell className="text-xs font-medium text-slate-700">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                            />
                            {module.module}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold text-slate-800">{module.views}</TableCell>
                        <TableCell className="text-xs text-right text-slate-600">{module.unique_users}</TableCell>
                        <TableCell className="text-xs text-right">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium border border-amber-200">
                            {module.percentage}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-right text-slate-500">{module.avg_time_spent}s</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-700">User Activity Overview</CardTitle>
                  <CardDescription className="text-[11px]">User engagement and activity levels</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[110px] h-8 text-[11px] border-slate-200 bg-white">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Roles</SelectItem>
                      <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                      <SelectItem value="manager" className="text-xs">Manager</SelectItem>
                      <SelectItem value="operator" className="text-xs">Operator</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={activityFilter} onValueChange={setActivityFilter}>
                    <SelectTrigger className="w-[110px] h-8 text-[11px] border-slate-200 bg-white">
                      <SelectValue placeholder="Activity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Activity</SelectItem>
                      <SelectItem value="active" className="text-xs">Active</SelectItem>
                      <SelectItem value="low_activity" className="text-xs">Low Activity</SelectItem>
                      <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">User</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Role</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Last Active</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 text-right">Sessions</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 text-right">Actions</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Top Module</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                        No user activity data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    userActivity.map((user) => (
                      <TableRow key={user.user_id} className="border-slate-100 hover:bg-slate-50/50">
                        <TableCell className="text-xs font-medium text-slate-700">{user.user_name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            user.role === "admin" 
                              ? "bg-blue-100 text-blue-700 border border-blue-200" 
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}>
                            {user.role}
                          </span>
                        </TableCell>
                        <TableCell className="text-[11px] text-slate-500">
                          {user.last_active 
                            ? new Date(user.last_active).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : '—'
                          }
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold text-slate-800">{user.sessions}</TableCell>
                        <TableCell className="text-xs text-right text-slate-600">{user.actions}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-700">
                            {user.most_used_module}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-700">Feature Usage</CardTitle>
                  <CardDescription className="text-[11px]">Most used actions and features</CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-medium bg-blue-50 border-blue-200 text-blue-700">
                  {actionUsage.length} tracked
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Action</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 text-right">Count</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 text-right">Users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionUsage.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-12 text-slate-400">
                        <MousePointer className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No action tracking data yet</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    actionUsage.map((action, idx) => (
                      <TableRow key={action.action_name} className="border-slate-100 hover:bg-slate-50/50">
                        <TableCell className="text-xs font-medium text-slate-700">
                          <div className="flex items-center gap-2.5">
                            <span className="flex items-center justify-center h-6 w-6 rounded bg-amber-100 text-[10px] font-bold text-amber-700 border border-amber-200">
                              {idx + 1}
                            </span>
                            {action.action_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold text-slate-800">{action.total_count}</TableCell>
                        <TableCell className="text-xs text-right text-slate-600">{action.unique_users}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserStatisticsPage;
