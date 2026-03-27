import { useState, useEffect, useCallback } from "react";
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
  Filter,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  MousePointer,
  UserCheck,
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
  getModuleUsage: async (period = "30") => {
    const response = await fetch(`${API_BASE_URL}/api/user-stats/modules?period=${period}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch module usage");
    return response.json();
  },
  getUserActivity: async (period = "30", roleFilter = null, activityFilter = null) => {
    let url = `${API_BASE_URL}/api/user-stats/users?period=${period}`;
    if (roleFilter) url += `&role_filter=${roleFilter}`;
    if (activityFilter) url += `&activity_filter=${activityFilter}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch user activity");
    return response.json();
  },
  getActionUsage: async (period = "30") => {
    const response = await fetch(`${API_BASE_URL}/api/user-stats/actions?period=${period}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!response.ok) throw new Error("Failed to fetch action usage");
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

// Chart colors
const CHART_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

// KPI Card Component
const KpiCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, color = "blue" }) => {
  const colorMap = {
    blue: "from-blue-500 to-blue-600",
    green: "from-emerald-500 to-emerald-600",
    purple: "from-violet-500 to-violet-600",
    amber: "from-amber-500 to-amber-600",
    red: "from-red-500 to-red-600",
    cyan: "from-cyan-500 to-cyan-600",
  };

  return (
    <Card className="relative overflow-hidden">
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
                trend === "up" ? "text-emerald-600" : "text-red-600"
              }`}>
                {trend === "up" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {trendValue}
              </div>
            )}
          </div>
          <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3">
        <p className="font-medium text-slate-700 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {entry.value}
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
        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <Users className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Access Restricted</h2>
        <p className="text-slate-500 max-w-md">
          You do not have permission to view user statistics. 
          This feature is available for Administrators and Managers only.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const moduleUsage = overview?.module_usage || [];
  const userActivity = overview?.user_activity || [];
  const actionUsage = overview?.action_usage || [];
  const dailyActiveUsers = trends?.daily_active_users || overview?.daily_active_users || [];
  const dailyViews = trends?.daily_views || overview?.daily_views || [];

  // Calculate max values for bar charts
  const maxModuleViews = Math.max(...moduleUsage.map(m => m.views), 1);

  // Prepare pie chart data
  const pieData = moduleUsage.slice(0, 6).map((m, idx) => ({
    name: m.module,
    value: m.views,
    color: CHART_COLORS[idx % CHART_COLORS.length]
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="user-statistics-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="page-title">
              {t("settings.statistics") || "User Statistics"}
            </h1>
            <p className="text-sm text-slate-500">
              {t("settings.statisticsDesc") || "System usage and engagement overview"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Time Period Filter */}
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-[150px]" data-testid="period-filter">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Refresh Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isRefetching}
            data-testid="refresh-button"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KpiCard
          title="Active Users"
          value={overview?.active_users || 0}
          subtitle="Users with activity"
          icon={Users}
          color="blue"
        />
        <KpiCard
          title="Total Sessions"
          value={overview?.total_sessions || 0}
          subtitle="Unique sessions"
          icon={Activity}
          color="green"
        />
        <KpiCard
          title="Total Views"
          value={overview?.total_views || 0}
          subtitle="Page loads"
          icon={Eye}
          color="purple"
        />
        <KpiCard
          title="Avg. Duration"
          value={`${overview?.avg_session_duration || 0}s`}
          subtitle="Per interaction"
          icon={Clock}
          color="amber"
        />
        <KpiCard
          title="Most Used"
          value={overview?.most_used_module || "N/A"}
          subtitle="Top module"
          icon={Zap}
          color="cyan"
        />
        <KpiCard
          title="Least Used"
          value={overview?.least_used_module || "N/A"}
          subtitle="Needs attention"
          icon={Layers}
          color="red"
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 max-w-lg">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="modules" data-testid="tab-modules">Modules</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="actions" data-testid="tab-actions">Actions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Module Usage Bar Chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Module Usage</CardTitle>
                <CardDescription>Views per module</CardDescription>
              </CardHeader>
              <CardContent>
                {moduleUsage.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No usage data yet</p>
                  </div>
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moduleUsage.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis 
                          dataKey="module" 
                          type="category" 
                          width={100}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="views" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Usage Distribution Pie Chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Usage Distribution</CardTitle>
                <CardDescription>Percentage of total views</CardDescription>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No data available</p>
                  </div>
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
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
                          formatter={(value) => <span className="text-sm text-slate-600">{value}</span>}
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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Daily Active Users</CardTitle>
                <CardDescription>Users with activity per day</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyActiveUsers.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No trend data available</p>
                  </div>
                ) : (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyActiveUsers}>
                        <defs>
                          <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        />
                        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#3b82f6" 
                          fill="url(#colorUsers)"
                          name="Active Users"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily Views */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Daily Views</CardTitle>
                <CardDescription>Page loads per day</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyViews.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Eye className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No view data available</p>
                  </div>
                ) : (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyViews}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        />
                        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line 
                          type="monotone" 
                          dataKey="views" 
                          stroke="#10b981" 
                          strokeWidth={2}
                          dot={{ fill: '#10b981', r: 3 }}
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
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Module Usage Overview</CardTitle>
                  <CardDescription>Detailed usage per module</CardDescription>
                </div>
                <Badge variant="outline">{moduleUsage.length} modules</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Unique Users</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                    <TableHead className="text-right">Avg. Time (s)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduleUsage.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                        No module usage data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    moduleUsage.map((module, idx) => (
                      <TableRow key={module.module} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                            />
                            {module.module}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{module.views}</TableCell>
                        <TableCell className="text-right">{module.unique_users}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{module.percentage}%</Badge>
                        </TableCell>
                        <TableCell className="text-right text-slate-500">{module.avg_time_spent}</TableCell>
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
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="text-lg">User Activity Overview</CardTitle>
                  <CardDescription>User engagement and activity levels</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="operator">Operator</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={activityFilter} onValueChange={setActivityFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Activity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Activity</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="low_activity">Low Activity</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    <TableHead>Most Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                        No user activity data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    userActivity.map((user) => (
                      <TableRow key={user.user_id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">{user.user_name}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {user.last_active 
                            ? new Date(user.last_active).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Never'
                          }
                        </TableCell>
                        <TableCell className="text-right font-semibold">{user.sessions}</TableCell>
                        <TableCell className="text-right">{user.actions}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.most_used_module}</Badge>
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
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Feature Usage (Actions)</CardTitle>
                  <CardDescription>Most used actions and features</CardDescription>
                </div>
                <Badge variant="outline">{actionUsage.length} actions tracked</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Total Count</TableHead>
                    <TableHead className="text-right">Unique Users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionUsage.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-slate-400">
                        <MousePointer className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        No action tracking data yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    actionUsage.map((action, idx) => (
                      <TableRow key={action.action_name} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600">
                              {idx + 1}
                            </div>
                            {action.action_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{action.total_count}</TableCell>
                        <TableCell className="text-right">{action.unique_users}</TableCell>
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
