import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { formatTime, formatDateTime } from "../lib/dateUtils";
import {
  ArrowLeft,
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  RefreshCw,
  AlertTriangle,
  Activity,
  Wifi,
  WifiOff,
  ShieldX,
  Database,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FileWarning,
  Trash2,
  Check,
  Bug,
  Filter,
  Cloud,
  FolderOpen
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { getBackendUrl } from "../lib/apiConfig";

// Get API URL dynamically (supports Vercel + Railway deployment)
const getApiUrl = () => getBackendUrl();

// Helper to build headers with auth and database environment
const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  const dbEnv = localStorage.getItem("database_environment");
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (dbEnv) {
    headers["X-Database-Environment"] = dbEnv;
  }
  return headers;
};

// Helper to format uptime
const formatUptime = (seconds) => {
  if (!seconds) return "N/A";
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(" ");
};

// Helper to get status color based on percentage
const getStatusColor = (percent) => {
  if (percent >= 90) return { bg: "bg-red-500", text: "text-red-600", light: "bg-red-100", status: "critical" };
  if (percent >= 70) return { bg: "bg-orange-500", text: "text-orange-600", light: "bg-orange-100", status: "warning" };
  return { bg: "bg-green-500", text: "text-green-600", light: "bg-green-100", status: "normal" };
};

// Circular progress component
const CircularProgress = ({ percent, size = 120, strokeWidth = 10, color }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-200"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className={color.text}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            transition: "stroke-dashoffset 0.5s ease-in-out"
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-2xl font-bold ${color.text}`}>{percent.toFixed(1)}%</span>
      </div>
    </div>
  );
};

// Metric Card component
const MetricCard = ({ title, icon: Icon, value, subValue, percent, children, animate = true, compact = false }) => {
  const color = percent !== undefined ? getStatusColor(percent) : null;
  
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="h-full">
        <CardHeader className={compact ? "pb-1 pt-2 px-2 sm:px-4 sm:pt-4 sm:pb-2" : "pb-2"}>
          <CardTitle className="text-xs sm:text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2 text-slate-600">
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="truncate">{title}</span>
            </div>
            {color && (
              <Badge className={`${color.light} ${color.text} border-0 text-[9px] sm:text-xs px-1 sm:px-1.5 py-0`}>
                {color.status === "critical" ? "!" : color.status === "warning" ? "⚠" : "✓"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className={compact ? "px-2 pb-2 pt-0 sm:px-4 sm:pb-4" : ""}>
          {children || (
            <div className="space-y-3">
              <div className="text-3xl font-bold text-slate-900">{value}</div>
              {subValue && <p className="text-sm text-slate-500">{subValue}</p>}
              {percent !== undefined && (
                <div className="space-y-1">
                  <Progress 
                    value={percent} 
                    className="h-2"
                    indicatorClassName={color?.bg}
                  />
                  <p className="text-xs text-slate-400 text-right">{percent.toFixed(1)}%</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

// History sparkline component
const Sparkline = ({ data, color }) => {
  if (!data || data.length < 2) return null;
  
  const max = Math.max(...data, 100);
  const min = 0;
  const range = max - min || 1;
  const width = 100;
  const height = 30;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  
  return (
    <svg width={width} height={height} className="mt-2">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={color}
      />
    </svg>
  );
};

const SettingsServerPerformancePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Database storage state
  const [dbStorage, setDbStorage] = useState(null);
  const [dbStorageLoading, setDbStorageLoading] = useState(true);
  const [dbStorageError, setDbStorageError] = useState(null);
  
  // File storage state
  const [fileStorage, setFileStorage] = useState(null);
  const [fileStorageLoading, setFileStorageLoading] = useState(true);
  const [fileStorageError, setFileStorageError] = useState(null);
  
  // Security check state
  const [security, setSecurity] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [securityError, setSecurityError] = useState(null);
  const [securityRefreshing, setSecurityRefreshing] = useState(false);
  
  // Error logs state
  const [errorLogs, setErrorLogs] = useState(null);
  const [errorLogsLoading, setErrorLogsLoading] = useState(true);
  const [errorLogsError, setErrorLogsError] = useState(null);
  const [errorLogsRefreshing, setErrorLogsRefreshing] = useState(false);
  const [errorFilter, setErrorFilter] = useState("all"); // all, unresolved
  
  // History for sparklines (last 12 data points = ~1 minute at 5s intervals)
  const [cpuHistory, setCpuHistory] = useState([]);
  const [ramHistory, setRamHistory] = useState([]);
  
  // Check if user is owner
  const isOwner = user?.role === "owner";
  
  // Fetch security status
  const fetchSecurity = useCallback(async (showRefreshing = false) => {
    if (!isOwner) return;
    
    if (showRefreshing) setSecurityRefreshing(true);
    
    try {
      const response = await fetch(`${getApiUrl()}/api/system/security`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch security status");
      }
      
      const data = await response.json();
      setSecurity(data);
      setSecurityError(null);
    } catch (err) {
      console.error("Failed to fetch security status:", err);
      setSecurityError(err.message);
    } finally {
      setSecurityLoading(false);
      setSecurityRefreshing(false);
    }
  }, [isOwner]);
  
  // Fetch database storage
  const fetchDbStorage = useCallback(async () => {
    if (!isOwner) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/system/database`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch database storage");
      }
      
      const data = await response.json();
      setDbStorage(data);
      setDbStorageError(null);
    } catch (err) {
      console.error("Failed to fetch database storage:", err);
      setDbStorageError(err.message);
    } finally {
      setDbStorageLoading(false);
    }
  }, [isOwner]);
  
  // Fetch file storage stats
  const fetchFileStorage = useCallback(async () => {
    if (!isOwner) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/system/file-storage`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch file storage stats");
      }
      
      const data = await response.json();
      setFileStorage(data);
      setFileStorageError(null);
    } catch (err) {
      console.error("Failed to fetch file storage stats:", err);
      setFileStorageError(err.message);
    } finally {
      setFileStorageLoading(false);
    }
  }, [isOwner]);
  
  // Fetch error logs
  const fetchErrorLogs = useCallback(async (showRefreshing = false) => {
    if (!isOwner) return;
    
    if (showRefreshing) setErrorLogsRefreshing(true);
    
    try {
      const unresolved = errorFilter === "unresolved";
      const response = await fetch(
        `${getApiUrl()}/api/system/errors?limit=50&unresolved_only=${unresolved}`, 
        {
          headers: getAuthHeaders()
        }
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch error logs");
      }
      
      const data = await response.json();
      setErrorLogs(data);
      setErrorLogsError(null);
    } catch (err) {
      console.error("Failed to fetch error logs:", err);
      setErrorLogsError(err.message);
    } finally {
      setErrorLogsLoading(false);
      setErrorLogsRefreshing(false);
    }
  }, [isOwner, errorFilter]);
  
  // Resolve an error
  const resolveError = async (errorId) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/system/errors/${errorId}/resolve`, {
        method: "POST",
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error("Failed to resolve error");
      }
      
      toast.success("Error marked as resolved");
      fetchErrorLogs();
    } catch (err) {
      toast.error("Failed to resolve error");
    }
  };
  
  // Clear error logs
  const clearErrorLogs = async () => {
    if (!window.confirm("Are you sure you want to clear all error logs?")) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/system/errors`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error("Failed to clear error logs");
      }
      
      toast.success("Error logs cleared");
      fetchErrorLogs();
    } catch (err) {
      toast.error("Failed to clear error logs");
    }
  };
  
  // Create test error (for debugging)
  const createTestError = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/system/errors/test`, {
        method: "POST",
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error("Failed to create test error");
      }
      
      toast.success("Test error created");
      fetchErrorLogs(true);
    } catch (err) {
      toast.error("Failed to create test error");
    }
  };
  
  const fetchMetrics = useCallback(async (showRefreshIndicator = false) => {
    if (!isOwner) return;
    
    if (showRefreshIndicator) setIsRefreshing(true);
    
    try {
      const response = await fetch(`${getApiUrl()}/api/system/metrics`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Access denied. Admin privileges required.");
        }
        throw new Error("Failed to fetch metrics");
      }
      
      const data = await response.json();
      setMetrics(data);
      setLastUpdated(new Date());
      setError(null);
      
      // Only update history if we have real metrics (not serverless)
      if (!data.serverless && data.cpu_percent !== null) {
        setCpuHistory(prev => [...prev.slice(-11), data.cpu_percent]);
        setRamHistory(prev => [...prev.slice(-11), data.ram_percent]);
        
        // Show warning toast if any metric is critical
        if (data.cpu_percent >= 90 || data.ram_percent >= 90 || data.disk_percent >= 90) {
          const criticalMetrics = [];
          if (data.cpu_percent >= 90) criticalMetrics.push("CPU");
          if (data.ram_percent >= 90) criticalMetrics.push("RAM");
          if (data.disk_percent >= 90) criticalMetrics.push("Disk");
          toast.warning(`High usage detected: ${criticalMetrics.join(", ")}`);
        }
      }
      
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
      setError(err.message);
      
      // Set serverless-like fallback when fetch fails
      setMetrics({
        cpu_percent: null,
        ram_percent: null,
        disk_percent: null,
        uptime: null,
        serverless: true,
        environment: "unknown",
        message: "Unable to connect to server metrics. This may indicate a serverless environment or network issue."
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [isOwner]);
  
  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      setDbStorageLoading(false);
      setFileStorageLoading(false);
      setSecurityLoading(false);
      setErrorLogsLoading(false);
      return;
    }
    
    fetchMetrics();
    fetchDbStorage();
    fetchFileStorage();
    fetchSecurity();
    fetchErrorLogs();
    
    let interval;
    let dbInterval;
    let fileInterval;
    let errorInterval;
    if (autoRefresh) {
      interval = setInterval(() => fetchMetrics(), 5000); // Refresh every 5 seconds
      dbInterval = setInterval(() => fetchDbStorage(), 30000); // Refresh DB storage every 30 seconds
      fileInterval = setInterval(() => fetchFileStorage(), 30000); // Refresh file storage every 30 seconds
      errorInterval = setInterval(() => fetchErrorLogs(), 30000); // Refresh errors every 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
      if (dbInterval) clearInterval(dbInterval);
      if (fileInterval) clearInterval(fileInterval);
      if (errorInterval) clearInterval(errorInterval);
    };
  }, [fetchMetrics, fetchDbStorage, fetchFileStorage, fetchSecurity, fetchErrorLogs, autoRefresh, isOwner]);
  
  // Show access denied for non-owners
  if (!isOwner) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <ShieldX className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Access Restricted</h2>
            <p className="text-slate-500 mb-6">
              Server Performance metrics are only available to account owners.
            </p>
            <Button onClick={() => navigate(-1)} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Loading skeleton
  if (loading && !metrics) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-8 bg-slate-200 rounded animate-pulse" />
              <div className="w-48 h-6 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="h-40">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
                    <div className="w-16 h-8 bg-slate-200 rounded animate-pulse" />
                    <div className="w-full h-2 bg-slate-200 rounded animate-pulse" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  const cpuColor = getStatusColor(metrics?.cpu_percent || 0);
  const ramColor = getStatusColor(metrics?.ram_percent || 0);
  const diskColor = getStatusColor(metrics?.disk_percent || 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 sm:pb-6">
      {/* Header - Compact on mobile */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          {/* Mobile: Two rows */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="p-2 sm:px-3"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-base sm:text-xl font-semibold text-slate-900 flex items-center gap-2">
                  <Server className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                  Server Performance
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">Real-time server metrics</p>
              </div>
            </div>
            
            {/* Controls */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              {/* Connection Status */}
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                {error ? (
                  <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                )}
                <span className={`hidden sm:inline ${error ? "text-red-500" : "text-green-600"}`}>
                  {error ? "Offline" : "Live"}
                </span>
              </div>
              
              {/* Auto-refresh toggle */}
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="gap-1 px-2 sm:px-3 text-xs sm:text-sm"
              >
                <Activity className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${autoRefresh ? "animate-pulse" : ""}`} />
                <span className="hidden sm:inline">{autoRefresh ? "Auto" : "Manual"}</span>
              </Button>
              
              {/* Manual refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchMetrics(true)}
                disabled={isRefreshing}
                className="p-2 sm:px-3"
              >
                <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Warning Alert */}
        <AnimatePresence>
          {metrics && (metrics.cpu_percent >= 85 || metrics.ram_percent >= 85 || metrics.disk_percent >= 85) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 sm:mb-6 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 sm:gap-3"
            >
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 text-sm sm:text-base">High Resource Usage</p>
                <p className="text-xs sm:text-sm text-amber-600">
                  {metrics.cpu_percent >= 85 && "CPU "}
                  {metrics.ram_percent >= 85 && "RAM "}
                  {metrics.disk_percent >= 85 && "Disk "}
                  above 85%
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mock Data Warning */}
        {metrics?.mock && (
          <div className="mb-4 sm:mb-6 p-2.5 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 sm:gap-3">
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
            <p className="text-xs sm:text-sm text-blue-700">
              Mock data - actual metrics unavailable
            </p>
          </div>
        )}

        {/* Serverless Environment Notice */}
        {metrics?.serverless && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div className="flex items-start gap-2 sm:gap-3">
              <Server className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-indigo-800 text-sm sm:text-base">
                  Serverless Environment Detected
                  {metrics.environment && (
                    <span className="ml-2 text-xs font-normal px-2 py-0.5 bg-indigo-100 rounded-full">
                      {metrics.environment === 'vercel' ? 'Vercel' : 
                       metrics.environment === 'railway' ? 'Railway' : 
                       metrics.environment === 'aws_lambda' ? 'AWS Lambda' : 
                       metrics.environment}
                    </span>
                  )}
                </p>
                <p className="text-xs sm:text-sm text-indigo-600 mt-1">
                  {metrics.message || "System metrics (CPU, RAM, Disk) are not available in serverless deployments. Database health and error monitoring are still functional below."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Metrics Grid - Show placeholder for serverless */}
        {metrics?.serverless ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
            {/* Serverless placeholder cards */}
            {[
              { title: "CPU", icon: Cpu },
              { title: "RAM", icon: MemoryStick },
              { title: "Disk", icon: HardDrive },
              { title: "Uptime", icon: Clock }
            ].map(({ title, icon: Icon }) => (
              <Card key={title} className="border-slate-200 bg-slate-50/50">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs sm:text-sm font-medium text-slate-400">{title}</span>
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300" />
                  </div>
                  <div className="flex flex-col items-center justify-center h-20 sm:h-24">
                    <Server className="w-6 h-6 sm:w-8 sm:h-8 text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400 text-center">N/A in serverless</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
        /* Main Metrics Grid - 2x2 on mobile, 4 columns on desktop */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          {/* CPU */}
          <MetricCard title="CPU" icon={Cpu} percent={metrics?.cpu_percent} compact>
            <div className="flex flex-col items-center">
              <CircularProgress 
                percent={metrics?.cpu_percent || 0} 
                color={cpuColor}
                size={80}
                strokeWidth={6}
              />
              <p className="text-xs text-slate-500 mt-1.5">
                {metrics?.cpu_count_logical || "-"} Cores
              </p>
              <Sparkline data={cpuHistory} color={cpuColor.text} />
            </div>
          </MetricCard>

          {/* RAM */}
          <MetricCard title="RAM" icon={MemoryStick} percent={metrics?.ram_percent} compact>
            <div className="space-y-2">
              <div className="text-center">
                <span className="text-xl sm:text-2xl font-bold text-slate-900">
                  {metrics?.ram_used?.toFixed(1) || "-"}
                </span>
                <span className="text-xs sm:text-sm text-slate-500">/{metrics?.ram_total?.toFixed(0)}GB</span>
              </div>
              <Progress 
                value={metrics?.ram_percent || 0} 
                className="h-2"
                indicatorClassName={ramColor.bg}
              />
              <p className="text-[10px] sm:text-xs text-slate-400 text-center">
                {metrics?.ram_percent?.toFixed(0)}% used
              </p>
              <Sparkline data={ramHistory} color={ramColor.text} />
            </div>
          </MetricCard>

          {/* Disk */}
          <MetricCard title="Disk" icon={HardDrive} percent={metrics?.disk_percent} compact>
            <div className="space-y-2">
              <div className="text-center">
                <span className="text-xl sm:text-2xl font-bold text-slate-900">
                  {metrics?.disk_used?.toFixed(0) || "-"}
                </span>
                <span className="text-xs sm:text-sm text-slate-500">/{metrics?.disk_total?.toFixed(0)}GB</span>
              </div>
              <Progress 
                value={metrics?.disk_percent || 0} 
                className="h-2"
                indicatorClassName={diskColor.bg}
              />
              <p className="text-[10px] sm:text-xs text-slate-400 text-center">
                {metrics?.disk_percent?.toFixed(0)}% used
              </p>
            </div>
          </MetricCard>

          {/* Uptime */}
          <MetricCard title="Uptime" icon={Clock} compact>
            <div className="space-y-2">
              <div className="text-center">
                <span className="text-lg sm:text-xl font-bold text-slate-900">
                  {formatUptime(metrics?.uptime)}
                </span>
              </div>
              <div className="text-center">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] sm:text-xs px-1.5 py-0.5">
                  Running
                </Badge>
              </div>
              <p className="text-[10px] text-slate-400 text-center">
                {metrics?.uptime ? `${Math.floor(metrics.uptime / 86400)}d uptime` : ""}
              </p>
            </div>
          </MetricCard>
        </div>
        )}

        {/* Database Storage Card - Separate Section */}
        <div className="mb-4 sm:mb-6">
          <Card>
            <CardHeader className="py-2 sm:py-4 px-3 sm:px-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2 text-slate-600">
                  <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Database Storage</span>
                  {dbStorage?.database_name && (
                    <span className="text-[10px] sm:text-xs font-normal text-slate-400 ml-1">
                      ({dbStorage.database_name})
                    </span>
                  )}
                </div>
                {dbStorage && !dbStorageLoading && !dbStorageError && (() => {
                  const usagePercent = Math.round((dbStorage.used / dbStorage.capacity) * 100);
                  const color = getStatusColor(usagePercent);
                  return (
                    <Badge className={`${color.light} ${color.text} border-0 text-[9px] sm:text-xs px-1 sm:px-1.5 py-0`}>
                      {color.status === "critical" ? "!" : color.status === "warning" ? "⚠" : "✓"}
                    </Badge>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6 pt-0">
              {dbStorageLoading ? (
                <div className="flex items-center justify-center py-4">
                  <span className="text-xs sm:text-sm text-slate-400">Loading...</span>
                </div>
              ) : dbStorageError ? (
                <div className="flex items-center justify-center py-4">
                  <span className="text-xs sm:text-sm text-red-500">Unable to load database storage</span>
                </div>
              ) : !dbStorage ? (
                <div className="flex items-center justify-center py-4">
                  <span className="text-xs sm:text-sm text-slate-400">No storage data available</span>
                </div>
              ) : (() => {
                const usagePercent = Math.round((dbStorage.used / dbStorage.capacity) * 100);
                const color = getStatusColor(usagePercent);
                return (
                  <div className="space-y-2 sm:space-y-3">
                    {/* Progress Bar with percentage inside */}
                    <div className="relative">
                      <Progress 
                        value={usagePercent} 
                        className="h-5 sm:h-6"
                        indicatorClassName={color.bg}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs sm:text-sm font-semibold text-white drop-shadow-sm">
                          {usagePercent}%
                        </span>
                      </div>
                    </div>
                    
                    {/* Usage Text */}
                    <p className="text-xs sm:text-sm text-slate-500 text-center">
                      {dbStorage.used} {dbStorage.unit} of {dbStorage.capacity} {dbStorage.unit} used
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* File Storage Card */}
        <div className="mb-4 sm:mb-6">
          <Card>
            <CardHeader className="py-2 sm:py-4 px-3 sm:px-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2 text-slate-600">
                  <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>File Storage</span>
                </div>
                {fileStorage && !fileStorageLoading && !fileStorageError && (
                  <div className="flex items-center gap-1.5">
                    {fileStorage.capacity && (() => {
                      const usagePercent = Math.round((fileStorage.used / fileStorage.capacity) * 100);
                      const color = getStatusColor(usagePercent);
                      return (
                        <Badge className={`${color.light} ${color.text} border-0 text-[9px] sm:text-xs px-1 sm:px-1.5 py-0`}>
                          {color.status === "critical" ? "!" : color.status === "warning" ? "⚠" : "✓"}
                        </Badge>
                      );
                    })()}
                    <Badge className={`${fileStorage.r2_configured ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"} border-0 text-[9px] sm:text-xs px-1.5 sm:px-2 py-0`}>
                      {fileStorage.r2_configured ? "R2 Active" : "MongoDB Only"}
                    </Badge>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6 pt-0">
              {fileStorageLoading ? (
                <div className="flex items-center justify-center py-4">
                  <span className="text-xs sm:text-sm text-slate-400">Loading...</span>
                </div>
              ) : fileStorageError ? (
                <div className="flex items-center justify-center py-4">
                  <span className="text-xs sm:text-sm text-red-500">Unable to load file storage stats</span>
                </div>
              ) : !fileStorage ? (
                <div className="flex items-center justify-center py-4">
                  <span className="text-xs sm:text-sm text-slate-400">No file storage data available</span>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {/* Capacity progress bar */}
                  {fileStorage.capacity && (() => {
                    const usagePercent = Math.min(Math.round((fileStorage.used / fileStorage.capacity) * 100), 100);
                    const color = getStatusColor(usagePercent);
                    return (
                      <div className="space-y-2 sm:space-y-3">
                        <div className="relative">
                          <Progress 
                            value={usagePercent} 
                            className="h-5 sm:h-6"
                            indicatorClassName={color.bg}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs sm:text-sm font-semibold text-white drop-shadow-sm">
                              {usagePercent}%
                            </span>
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-500 text-center">
                          {fileStorage.used} {fileStorage.unit} of {fileStorage.capacity} {fileStorage.unit} used
                          <span className="text-slate-400 ml-1">({fileStorage.total_files} files)</span>
                        </p>
                      </div>
                    );
                  })()}

                  {/* By storage type */}
                  {fileStorage.by_storage_type && Object.keys(fileStorage.by_storage_type).length > 0 && (
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">By Storage Type</p>
                      <div className="space-y-1.5">
                        {Object.entries(fileStorage.by_storage_type).map(([type, info]) => (
                          <div key={type} className="flex items-center justify-between py-1 sm:py-1.5 border-b border-slate-100 last:border-0">
                            <div className="flex items-center gap-1.5">
                              {type === "r2" ? (
                                <Cloud className="w-3 h-3 text-blue-500" />
                              ) : (
                                <Database className="w-3 h-3 text-amber-500" />
                              )}
                              <span className="text-xs sm:text-sm text-slate-600 capitalize">{type === "r2" ? "Cloudflare R2" : "MongoDB (Legacy)"}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs sm:text-sm font-medium text-slate-700">{info.count} files</span>
                              <span className="text-[10px] sm:text-xs text-slate-400 ml-1.5">
                                ({info.size_mb >= 1024 ? `${(info.size_mb / 1024).toFixed(1)} GB` : `${info.size_mb} MB`})
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* By category */}
                  {fileStorage.by_category && Object.keys(fileStorage.by_category).length > 0 && (
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">By Category</p>
                      <div className="space-y-1.5">
                        {Object.entries(fileStorage.by_category).map(([cat, count]) => (
                          <div key={cat} className="flex items-center justify-between py-1 sm:py-1.5 border-b border-slate-100 last:border-0">
                            <div className="flex items-center gap-1.5">
                              <FolderOpen className="w-3 h-3 text-slate-400" />
                              <span className="text-xs sm:text-sm text-slate-600 capitalize">{cat}</span>
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-slate-700">{count} files</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Stats - Collapsible on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
          {/* System Info */}
          <Card>
            <CardHeader className="py-2 sm:py-4 px-3 sm:px-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-2">
                <Server className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                System Info
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6 pt-0">
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex justify-between py-1 sm:py-1.5 border-b border-slate-100">
                  <span className="text-xs sm:text-sm text-slate-500">CPU Cores</span>
                  <span className="text-xs sm:text-sm font-medium">{metrics?.cpu_count_logical || "-"}</span>
                </div>
                <div className="flex justify-between py-1 sm:py-1.5 border-b border-slate-100">
                  <span className="text-xs sm:text-sm text-slate-500">Total RAM</span>
                  <span className="text-xs sm:text-sm font-medium">{metrics?.ram_total?.toFixed(1) || "-"} GB</span>
                </div>
                <div className="flex justify-between py-1 sm:py-1.5 border-b border-slate-100">
                  <span className="text-xs sm:text-sm text-slate-500">Total Disk</span>
                  <span className="text-xs sm:text-sm font-medium">{metrics?.disk_total?.toFixed(0) || "-"} GB</span>
                </div>
                <div className="flex justify-between py-1 sm:py-1.5">
                  <span className="text-xs sm:text-sm text-slate-500">Source</span>
                  <span className="text-xs sm:text-sm font-medium">{metrics?.mock ? "Mock" : "Live"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Overview */}
          <Card>
            <CardHeader className="py-2 sm:py-4 px-3 sm:px-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6 pt-0">
              <div className="space-y-2 sm:space-y-3">
                {/* Status Bars */}
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${cpuColor.bg}`} />
                  <span className="text-xs sm:text-sm flex-1">CPU</span>
                  <span className={`text-xs sm:text-sm font-medium ${cpuColor.text}`}>
                    {metrics?.cpu_percent?.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${ramColor.bg}`} />
                  <span className="text-xs sm:text-sm flex-1">RAM</span>
                  <span className={`text-xs sm:text-sm font-medium ${ramColor.text}`}>
                    {metrics?.ram_percent?.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${diskColor.bg}`} />
                  <span className="text-xs sm:text-sm flex-1">Disk</span>
                  <span className={`text-xs sm:text-sm font-medium ${diskColor.text}`}>
                    {metrics?.disk_percent?.toFixed(0)}%
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-400">
                    <span>Updated</span>
                    <span>{lastUpdated ? formatTime(lastUpdated) : "-"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* App Security Section */}
        <div className="mt-4 sm:mt-6">
          <Card>
            <CardHeader className="py-2 sm:py-4 px-3 sm:px-6">
              <CardTitle className="text-xs sm:text-sm font-medium flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2 text-slate-600">
                  <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>App Security</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Overall Status Badge */}
                  {security && !securityLoading && !securityError && (
                    <Badge className={`${
                      security.status === "secure" 
                        ? "bg-green-100 text-green-700" 
                        : security.status === "warning" 
                          ? "bg-orange-100 text-orange-700" 
                          : "bg-red-100 text-red-700"
                    } border-0 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5`}>
                      {security.status === "secure" && <ShieldCheck className="w-3 h-3 mr-1" />}
                      {security.status === "warning" && <ShieldAlert className="w-3 h-3 mr-1" />}
                      {security.status === "critical" && <ShieldX className="w-3 h-3 mr-1" />}
                      {security.status === "secure" ? "Secure" : security.status === "warning" ? "Warning" : "Critical"}
                    </Badge>
                  )}
                  {/* Refresh Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchSecurity(true)}
                    disabled={securityRefreshing}
                    className="h-6 w-6 sm:h-7 sm:w-7 p-0"
                  >
                    {securityRefreshing ? (
                      <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    )}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6 pt-0">
              {securityLoading ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  <span className="text-xs sm:text-sm text-slate-400">Running security checks...</span>
                </div>
              ) : securityError ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-xs sm:text-sm text-red-500">Unable to load security status</span>
                </div>
              ) : !security ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-xs sm:text-sm text-slate-400">No security data available</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Security Checks List */}
                  <div className="space-y-2">
                    {security.checks?.map((check, index) => (
                      <div 
                        key={index}
                        className={`flex items-start gap-2 p-2 sm:p-2.5 rounded-lg border ${
                          check.status === "pass" 
                            ? "bg-green-50/50 border-green-100" 
                            : check.status === "warning" 
                              ? "bg-orange-50/50 border-orange-100" 
                              : "bg-red-50/50 border-red-100"
                        }`}
                      >
                        {/* Status Icon */}
                        <div className="mt-0.5 flex-shrink-0">
                          {check.status === "pass" && (
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                          )}
                          {check.status === "warning" && (
                            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500" />
                          )}
                          {check.status === "fail" && (
                            <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                          )}
                        </div>
                        
                        {/* Check Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-medium text-slate-700">
                              {check.name}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] sm:text-[10px] px-1 py-0 ${
                                check.status === "pass" 
                                  ? "border-green-200 text-green-600" 
                                  : check.status === "warning" 
                                    ? "border-orange-200 text-orange-600" 
                                    : "border-red-200 text-red-600"
                              }`}
                            >
                              {check.status === "pass" ? "Pass" : check.status === "warning" ? "Warning" : "Fail"}
                            </Badge>
                          </div>
                          <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                            {check.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Security Standards & Baselines */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2 sm:p-3">
                    <div className="text-xs sm:text-sm font-medium text-slate-700">
                      Security standards & baselines
                    </div>
                    <div className="mt-1 text-[10px] sm:text-xs text-slate-600 space-y-1">
                      <div>
                        <span className="font-medium">OWASP ASVS (v4.x)</span> – auth/session, access control,
                        configuration hardening.
                      </div>
                      <div>
                        <span className="font-medium">OWASP Top 10</span> – focuses on misconfiguration, auth failures,
                        broken access control, token leakage.
                      </div>
                      <div>
                        <span className="font-medium">Cookie + CSRF best practices</span> – HttpOnly cookie sessions +
                        double-submit CSRF for unsafe requests.
                      </div>
                      <div>
                        <span className="font-medium">Credentialed CORS best practices</span> – origin allowlist (no
                        wildcard with credentials).
                      </div>
                      <div>
                        <span className="font-medium">Browser hardening</span> – CSP, HSTS (HTTPS only),
                        frame-ancestors/XFO, referrer & permissions policies.
                      </div>
                      <div>
                        <span className="font-medium">Auditability</span> – security events + application transaction
                        audit log coverage.
                      </div>
                    </div>
                  </div>
                  
                  {/* Last Scan Timestamp */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-400">
                      <span>Last checked</span>
                      <span>
                        {security.last_scan 
                          ? formatTime(security.last_scan) 
                          : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Error Logs Section */}
        <div className="mt-6">
          <Card>
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="text-base sm:text-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileWarning className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                  <span>Error Logs</span>
                  {errorLogs?.stats && (
                    <Badge variant={errorLogs.stats.unresolved > 0 ? "destructive" : "secondary"} className="text-[10px] sm:text-xs">
                      {errorLogs.stats.unresolved} unresolved
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Filter Toggle */}
                  <div className="flex items-center gap-1 text-xs">
                    <Button
                      variant={errorFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setErrorFilter("all");
                        setTimeout(() => fetchErrorLogs(true), 100);
                      }}
                      className="h-6 px-2 text-[10px] sm:text-xs"
                    >
                      All
                    </Button>
                    <Button
                      variant={errorFilter === "unresolved" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setErrorFilter("unresolved");
                        setTimeout(() => fetchErrorLogs(true), 100);
                      }}
                      className="h-6 px-2 text-[10px] sm:text-xs"
                    >
                      <Filter className="w-3 h-3 mr-1" />
                      Unresolved
                    </Button>
                  </div>
                  {/* Test Error Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={createTestError}
                    className="h-6 px-2 text-[10px] sm:text-xs text-slate-500"
                    title="Create test error"
                  >
                    <Bug className="w-3 h-3" />
                  </Button>
                  {/* Clear All Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearErrorLogs}
                    className="h-6 px-2 text-[10px] sm:text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                    title="Clear all errors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                  {/* Refresh Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchErrorLogs(true)}
                    disabled={errorLogsRefreshing}
                    className="h-6 w-6 sm:h-7 sm:w-7 p-0"
                  >
                    {errorLogsRefreshing ? (
                      <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    )}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6 pt-0">
              {errorLogsLoading ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  <span className="text-xs sm:text-sm text-slate-400">Loading error logs...</span>
                </div>
              ) : errorLogsError ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-xs sm:text-sm text-red-500">Unable to load error logs</span>
                </div>
              ) : !errorLogs?.errors?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
                  <span className="text-sm font-medium text-slate-600">No errors logged</span>
                  <span className="text-xs text-slate-400 mt-1">Your application is running smoothly</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Error Stats Summary */}
                  {errorLogs.stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                      <div className="bg-slate-50 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-slate-700">{errorLogs.stats.total_errors}</div>
                        <div className="text-[10px] text-slate-500">Total</div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-red-600">{errorLogs.stats.unresolved}</div>
                        <div className="text-[10px] text-red-500">Unresolved</div>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-orange-600">{errorLogs.stats.errors_last_hour}</div>
                        <div className="text-[10px] text-orange-500">Last Hour</div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-blue-600">{errorLogs.stats.errors_last_day}</div>
                        <div className="text-[10px] text-blue-500">Last 24h</div>
                      </div>
                    </div>
                  )}
                  
                  {/* Error List */}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {errorLogs.errors.map((error) => (
                      <div 
                        key={error.id}
                        className={`p-3 rounded-lg border ${
                          error.resolved 
                            ? "bg-slate-50 border-slate-200 opacity-60" 
                            : "bg-red-50/50 border-red-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge 
                                variant="outline"
                                className={`text-[9px] px-1.5 py-0 ${
                                  error.type === "database" ? "border-purple-200 text-purple-600 bg-purple-50" :
                                  error.type === "auth" ? "border-yellow-200 text-yellow-700 bg-yellow-50" :
                                  error.type === "ai" ? "border-blue-200 text-blue-600 bg-blue-50" :
                                  error.type === "timeout" ? "border-orange-200 text-orange-600 bg-orange-50" :
                                  error.type === "test" ? "border-slate-200 text-slate-600 bg-slate-50" :
                                  "border-red-200 text-red-600 bg-red-50"
                                }`}
                              >
                                {error.type}
                              </Badge>
                              <Badge 
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 border-slate-200 text-slate-500"
                              >
                                {error.source}
                              </Badge>
                              {error.resolved && (
                                <Badge className="text-[9px] px-1.5 py-0 bg-green-100 text-green-600 border-0">
                                  Resolved
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-slate-700 break-words">
                              {error.message}
                            </p>
                            {error.details?.path && (
                              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                                {error.details.method} {error.details.path}
                              </p>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">
                              {formatDateTime(error.timestamp)}
                            </p>
                          </div>
                          {!error.resolved && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resolveError(error.id)}
                              className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 flex-shrink-0"
                              title="Mark as resolved"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Logging Since */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-400">
                      <span>Logging since</span>
                      <span>
                        {errorLogs.stats?.logging_since 
                          ? formatDateTime(errorLogs.stats.logging_since) 
                          : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsServerPerformancePage;
