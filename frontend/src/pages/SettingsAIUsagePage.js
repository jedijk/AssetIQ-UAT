import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { getBackendUrl } from "../lib/apiConfig";
import { toast } from "sonner";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import BackButton from "../components/BackButton";
import {
  Brain,
  Zap,
  Building2,
  Calendar,
  TrendingUp,
  BarChart3,
  Lock,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Download,
  Filter,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

// API helper
const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem("token");
  const response = await fetch(`${getBackendUrl()}${url}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.json();
};

export default function SettingsAIUsagePage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [isMobile] = useState(window.innerWidth < 768);
  const [dateRange, setDateRange] = useState("30");
  const [installationFilter, setInstallationFilter] = useState("all");

  // Calculate date range
  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(dateRange));
    return {
      start_date: start.toISOString().split("T")[0],
      end_date: end.toISOString().split("T")[0],
    };
  };

  const { start_date, end_date } = getDateRange();

  // Fetch AI usage data
  const { data: usageData, isLoading, error, refetch } = useQuery({
    queryKey: ["ai-usage", dateRange, installationFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        start_date,
        end_date,
      });
      if (installationFilter !== "all") {
        params.append("installation_id", installationFilter);
      }
      return fetchWithAuth(`/api/admin/ai-usage?${params}`);
    },
    retry: 1,
  });

  // Fetch installations for filter
  const { data: installationsData } = useQuery({
    queryKey: ["installations"],
    queryFn: () => fetchWithAuth("/api/admin/installations"),
    retry: 1,
  });

  // Mobile check
  if (isMobile) {
    return <DesktopOnlyMessage title="AI Usage" icon={Brain} />;
  }

  // Auth check
  if (user?.role !== "admin" && user?.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Lock className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-600 mb-2">Access Restricted</h2>
        <p className="text-slate-500">Only admins and owners can view AI usage data.</p>
        <BackButton className="mt-4" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-slate-600 mb-2">Error Loading Data</h2>
        <p className="text-slate-500">{error.message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const { installations = [], summary = {} } = usageData || {};
  const availableInstallations = installationsData?.installations || [];

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toString() || "0";
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton />
              <div>
                <div className="flex items-center gap-2">
                  <Brain className="w-6 h-6 text-purple-600" />
                  <h1 className="text-xl font-bold text-slate-900">{t("nav.aiUsage") || "AI Usage"}</h1>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">Token consumption per installation</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[150px]">
                  <Calendar className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
              <Select value={installationFilter} onValueChange={setInstallationFilter}>
                <SelectTrigger className="w-[180px]">
                  <Building2 className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All installations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All installations</SelectItem>
                  {availableInstallations.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Tokens</p>
                  <p className="text-2xl font-bold text-slate-900">{formatNumber(summary.total_tokens)}</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Zap className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Prompt Tokens</p>
                  <p className="text-2xl font-bold text-slate-900">{formatNumber(summary.prompt_tokens)}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Completion Tokens</p>
                  <p className="text-2xl font-bold text-slate-900">{formatNumber(summary.completion_tokens)}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">API Requests</p>
                  <p className="text-2xl font-bold text-slate-900">{formatNumber(summary.request_count)}</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Brain className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Table */}
        <Card>
          <CardHeader>
            <CardTitle>Usage by Installation</CardTitle>
            <CardDescription>
              Token consumption breakdown for each installation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {installations.length === 0 ? (
              <div className="text-center py-12">
                <Brain className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500">No AI usage data for this period</p>
                <p className="text-sm text-slate-400 mt-1">AI features will log usage here when used</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Installation</TableHead>
                    <TableHead className="text-right">Total Tokens</TableHead>
                    <TableHead className="text-right">Prompt</TableHead>
                    <TableHead className="text-right">Completion</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead>Models</TableHead>
                    <TableHead>Features</TableHead>
                    <TableHead>Last Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installations.map((inst) => (
                    <TableRow key={inst.installation_id} data-testid={`usage-row-${inst.installation_id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">{inst.installation_name || "Unknown"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(inst.total_tokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-500">
                        {formatNumber(inst.prompt_tokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-500">
                        {formatNumber(inst.completion_tokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {inst.request_count}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inst.models_used?.map((model) => (
                            <Badge key={model} variant="outline" className="text-xs">
                              {model}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inst.features_used?.map((feature) => (
                            <Badge key={feature} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {inst.last_used ? new Date(inst.last_used).toLocaleDateString() : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-blue-900">About AI Usage Tracking</h3>
              <p className="text-sm text-blue-700 mt-1">
                Token usage is tracked for AI-powered features including image analysis, risk analysis, 
                maintenance strategy generation, and voice transcription. Each installation's usage 
                is aggregated to help monitor costs and optimize AI feature usage.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
