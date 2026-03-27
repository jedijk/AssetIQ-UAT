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

// Premium monochromatic chart colors (Swiss & High-Contrast)
const CHART_COLORS = [
  "#0F172A", // slate-900
  "#334155", // slate-700
  "#475569", // slate-600
  "#64748B", // slate-500
  "#94A3B8", // slate-400
  "#CBD5E1", // slate-300
];

// Premium KPI Card Component
const KpiCard = ({ title, value, subtitle, icon: Icon, trend, trendValue }) => {
  return (
    <div 
      className="bg-white border border-slate-200/80 shadow-sm rounded-xl p-5 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-200 group"
      data-testid="kpi-card"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            {title}
          </p>
          <p className="text-xl font-semibold tracking-tight text-slate-900" data-testid="kpi-value">
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-slate-400">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 text-[11px] font-medium ${
              trend === "up" ? "text-emerald-600" : "text-red-500"
            }`}>
              {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {trendValue}
            </div>
          )}
        </div>
        <div className="h-9 w-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-slate-100 transition-colors">
          <Icon className="h-4 w-4 text-slate-600" />
        </div>
      </div>
    </div>
  );
};

// Premium tooltip for charts
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 shadow-xl rounded-lg p-3">
        <p className="text-xs font-semibold text-slate-800 mb-1.5">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-[11px] text-slate-600">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
            {entry.name}: <span className="font-medium text-slate-800">{entry.value}</span>
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
        <div className="h-14 w-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
          <Users className="h-6 w-6 text-slate-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1 tracking-tight">Access Restricted</h2>
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
        <div className="animate-spin h-8 w-8 border-2 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  const moduleUsage = overview?.module_usage || [];
  const userActivity = overview?.user_activity || [];
  const actionUsage = overview?.action_usage || [];
  const dailyActiveUsers = trends?.daily_active_users || overview?.daily_active_users || [];
  const dailyViews = trends?.daily_views || overview?.daily_views || [];

  // Prepare pie chart data
  const pieData = moduleUsage.slice(0, 6).map((m, idx) => ({
    name: m.module,
    value: m.views,
    color: CHART_COLORS[idx % CHART_COLORS.length]
  }));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto" data-testid="user-statistics-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight" data-testid="page-title">
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
            <SelectTrigger className="w-[140px] h-9 text-xs border-slate-200 hover:border-slate-300 hover:bg-slate-50" data-testid="period-filter">
              <Calendar className="w-3.5 h-3.5 mr-2 text-slate-500" />
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
            className="h-9 px-3 text-xs border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
            onClick={() => refetch()} 
            disabled={isRefetching}
            data-testid="refresh-button"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard
          title="Active Users"
          value={overview?.active_users || 0}
          subtitle="With activity"
          icon={Users}
        />
        <KpiCard
          title="Sessions"
          value={overview?.total_sessions || 0}
          subtitle="Unique sessions"
          icon={Activity}
        />
        <KpiCard
          title="Page Views"
          value={overview?.total_views || 0}
          subtitle="Total loads"
          icon={Eye}
        />
        <KpiCard
          title="Avg Duration"
          value={`${overview?.avg_session_duration || 0}s`}
          subtitle="Per interaction"
          icon={Clock}
        />
        <KpiCard
          title="Top Module"
          value={overview?.most_used_module || "—"}
          subtitle="Most active"
          icon={Zap}
        />
        <KpiCard
          title="Low Usage"
          value={overview?.least_used_module || "—"}
          subtitle="Needs attention"
          icon={Layers}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="inline-flex h-9 items-center justify-start rounded-lg bg-slate-100/60 p-1 text-slate-600">
          <TabsTrigger value="overview" className="text-xs px-3 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="modules" className="text-xs px-3 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm" data-testid="tab-modules">Modules</TabsTrigger>
          <TabsTrigger value="users" className="text-xs px-3 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs px-3 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm" data-testid="tab-actions">Actions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Module Usage Bar Chart */}
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-800">Module Usage</CardTitle>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={true} vertical={false} />
                        <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis 
                          dataKey="module" 
                          type="category" 
                          width={90}
                          tick={{ fill: '#64748B', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="views" fill="#0F172A" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Usage Distribution Pie Chart */}
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-800">Usage Distribution</CardTitle>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Active Users */}
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-800">Daily Active Users</CardTitle>
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
                            <stop offset="5%" stopColor="#0F172A" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#0F172A" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fill: '#94A3B8', fontSize: 9 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#0F172A" 
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
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-800">Daily Views</CardTitle>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fill: '#94A3B8', fontSize: 9 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line 
                          type="monotone" 
                          dataKey="views" 
                          stroke="#334155" 
                          strokeWidth={2}
                          dot={{ fill: '#334155', r: 2, strokeWidth: 0 }}
                          activeDot={{ fill: '#0F172A', r: 4, strokeWidth: 0 }}
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

        {/* Modules Tab */}
        <TabsContent value="modules">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Module Usage Overview</CardTitle>
                  <CardDescription className="text-[11px]">Detailed usage per module</CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-medium border-slate-200 text-slate-500">
                  {moduleUsage.length} modules
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Module</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 text-right">Views</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 text-right">Users</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 text-right">Share</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 text-right">Avg Time</TableHead>
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
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                            />
                            {module.module}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold text-slate-800">{module.views}</TableCell>
                        <TableCell className="text-xs text-right text-slate-600">{module.unique_users}</TableCell>
                        <TableCell className="text-xs text-right">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
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
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">User Activity Overview</CardTitle>
                  <CardDescription className="text-[11px]">User engagement and activity levels</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[110px] h-8 text-[11px] border-slate-200">
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
                    <SelectTrigger className="w-[110px] h-8 text-[11px] border-slate-200">
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
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">User</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Role</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Last Active</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 text-right">Sessions</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 text-right">Actions</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Top Module</TableHead>
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
                              ? "bg-slate-900 text-white" 
                              : "bg-slate-100 text-slate-600"
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
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-600">
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
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Feature Usage</CardTitle>
                  <CardDescription className="text-[11px]">Most used actions and features</CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-medium border-slate-200 text-slate-500">
                  {actionUsage.length} tracked
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Action</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 text-right">Count</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 text-right">Users</TableHead>
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
                            <span className="flex items-center justify-center h-6 w-6 rounded bg-slate-100 text-[10px] font-bold text-slate-500">
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
