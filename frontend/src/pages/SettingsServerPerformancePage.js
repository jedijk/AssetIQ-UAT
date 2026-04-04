import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
  WifiOff
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
import { useIsMobile } from "../hooks/useIsMobile";

const API_URL = process.env.REACT_APP_BACKEND_URL;

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
const MetricCard = ({ title, icon: Icon, value, subValue, percent, children, animate = true }) => {
  const color = getStatusColor(percent);
  
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-600">
              <Icon className="w-4 h-4" />
              {title}
            </div>
            {percent !== undefined && (
              <Badge className={`${color.light} ${color.text} border-0`}>
                {color.status === "critical" ? "Critical" : color.status === "warning" ? "Warning" : "Normal"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {children || (
            <div className="space-y-3">
              <div className="text-3xl font-bold text-slate-900">{value}</div>
              {subValue && <p className="text-sm text-slate-500">{subValue}</p>}
              {percent !== undefined && (
                <div className="space-y-1">
                  <Progress 
                    value={percent} 
                    className="h-2"
                    indicatorClassName={color.bg}
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
  const isMobile = useIsMobile();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // History for sparklines (last 12 data points = ~1 minute at 5s intervals)
  const [cpuHistory, setCpuHistory] = useState([]);
  const [ramHistory, setRamHistory] = useState([]);
  
  const fetchMetrics = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/api/system/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
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
      
      // Update history for sparklines
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
      
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
      setError(err.message);
      
      // Use mock data as fallback
      setMetrics({
        cpu_percent: 35.5,
        cpu_count: 4,
        cpu_count_logical: 8,
        ram_used: 4.2,
        ram_total: 8.0,
        ram_percent: 52.5,
        disk_used: 45.0,
        disk_total: 100.0,
        disk_percent: 45.0,
        uptime: 86400,
        mock: true
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);
  
  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchMetrics();
    
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => fetchMetrics(), 5000); // Refresh every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchMetrics, autoRefresh]);
  
  // Show desktop-only message on mobile
  if (isMobile) {
    return <DesktopOnlyMessage title="Server Performance" icon={Server} />;
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/settings")}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                  <Server className="w-5 h-5 text-indigo-600" />
                  Server Performance
                </h1>
                <p className="text-sm text-slate-500">Real-time server metrics and monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Connection Status */}
              <div className="flex items-center gap-2 text-sm">
                {error ? (
                  <WifiOff className="w-4 h-4 text-red-500" />
                ) : (
                  <Wifi className="w-4 h-4 text-green-500" />
                )}
                <span className={error ? "text-red-500" : "text-green-600"}>
                  {error ? "Offline" : "Live"}
                </span>
              </div>
              
              {/* Auto-refresh toggle */}
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="gap-2"
              >
                <Activity className={`w-4 h-4 ${autoRefresh ? "animate-pulse" : ""}`} />
                {autoRefresh ? "Auto" : "Manual"}
              </Button>
              
              {/* Manual refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchMetrics(true)}
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Warning Alert */}
        <AnimatePresence>
          {metrics && (metrics.cpu_percent >= 85 || metrics.ram_percent >= 85 || metrics.disk_percent >= 85) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">High Resource Usage Detected</p>
                <p className="text-sm text-amber-600">
                  {metrics.cpu_percent >= 85 && "CPU usage is above 85%. "}
                  {metrics.ram_percent >= 85 && "RAM usage is above 85%. "}
                  {metrics.disk_percent >= 85 && "Disk usage is above 85%. "}
                  Consider scaling resources or investigating processes.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mock Data Warning */}
        {metrics?.mock && (
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <Activity className="w-4 h-4 text-blue-600" />
            <p className="text-sm text-blue-700">
              Displaying mock data. Actual server metrics unavailable.
            </p>
          </div>
        )}

        {/* Main Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* CPU */}
          <MetricCard title="CPU Usage" icon={Cpu} percent={metrics?.cpu_percent}>
            <div className="flex flex-col items-center">
              <CircularProgress 
                percent={metrics?.cpu_percent || 0} 
                color={cpuColor}
                size={100}
                strokeWidth={8}
              />
              <p className="text-sm text-slate-500 mt-2">
                {metrics?.cpu_count_logical || "-"} Logical Cores
              </p>
              <Sparkline data={cpuHistory} color={cpuColor.text} />
            </div>
          </MetricCard>

          {/* RAM */}
          <MetricCard title="RAM Usage" icon={MemoryStick} percent={metrics?.ram_percent}>
            <div className="space-y-3">
              <div className="text-center">
                <span className="text-3xl font-bold text-slate-900">
                  {metrics?.ram_used?.toFixed(1) || "-"}
                </span>
                <span className="text-lg text-slate-500"> / {metrics?.ram_total?.toFixed(1) || "-"} GB</span>
              </div>
              <Progress 
                value={metrics?.ram_percent || 0} 
                className="h-3"
                indicatorClassName={ramColor.bg}
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>Used: {metrics?.ram_percent?.toFixed(1)}%</span>
                <span>Free: {(100 - (metrics?.ram_percent || 0)).toFixed(1)}%</span>
              </div>
              <Sparkline data={ramHistory} color={ramColor.text} />
            </div>
          </MetricCard>

          {/* Disk */}
          <MetricCard title="Disk Usage" icon={HardDrive} percent={metrics?.disk_percent}>
            <div className="space-y-3">
              <div className="text-center">
                <span className="text-3xl font-bold text-slate-900">
                  {metrics?.disk_used?.toFixed(1) || "-"}
                </span>
                <span className="text-lg text-slate-500"> / {metrics?.disk_total?.toFixed(1) || "-"} GB</span>
              </div>
              <Progress 
                value={metrics?.disk_percent || 0} 
                className="h-3"
                indicatorClassName={diskColor.bg}
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>Used: {metrics?.disk_percent?.toFixed(1)}%</span>
                <span>Free: {(100 - (metrics?.disk_percent || 0)).toFixed(1)}%</span>
              </div>
            </div>
          </MetricCard>

          {/* Uptime */}
          <MetricCard title="Server Uptime" icon={Clock}>
            <div className="space-y-3">
              <div className="text-center">
                <span className="text-3xl font-bold text-slate-900">
                  {formatUptime(metrics?.uptime)}
                </span>
              </div>
              <div className="text-center">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Running
                </Badge>
              </div>
              <p className="text-xs text-slate-400 text-center">
                {metrics?.uptime ? `${Math.floor(metrics.uptime / 86400)} days continuous` : ""}
              </p>
            </div>
          </MetricCard>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* System Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="w-4 h-4" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-500">CPU Cores (Physical)</span>
                  <span className="text-sm font-medium">{metrics?.cpu_count || "-"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-500">CPU Cores (Logical)</span>
                  <span className="text-sm font-medium">{metrics?.cpu_count_logical || "-"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-500">Total RAM</span>
                  <span className="text-sm font-medium">{metrics?.ram_total?.toFixed(2) || "-"} GB</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-500">Total Disk Space</span>
                  <span className="text-sm font-medium">{metrics?.disk_total?.toFixed(2) || "-"} GB</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-slate-500">Data Source</span>
                  <span className="text-sm font-medium">{metrics?.mock ? "Mock Data" : "Live Server"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Status Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* CPU Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${cpuColor.bg}`} />
                    <span className="text-sm">CPU</span>
                  </div>
                  <span className={`text-sm font-medium ${cpuColor.text}`}>
                    {metrics?.cpu_percent?.toFixed(1)}%
                  </span>
                </div>
                
                {/* RAM Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${ramColor.bg}`} />
                    <span className="text-sm">RAM</span>
                  </div>
                  <span className={`text-sm font-medium ${ramColor.text}`}>
                    {metrics?.ram_percent?.toFixed(1)}%
                  </span>
                </div>
                
                {/* Disk Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${diskColor.bg}`} />
                    <span className="text-sm">Disk</span>
                  </div>
                  <span className={`text-sm font-medium ${diskColor.text}`}>
                    {metrics?.disk_percent?.toFixed(1)}%
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Last updated</span>
                    <span>{lastUpdated ? lastUpdated.toLocaleTimeString() : "-"}</span>
                  </div>
                  {autoRefresh && (
                    <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                      <span>Refresh interval</span>
                      <span>5 seconds</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsServerPerformancePage;
