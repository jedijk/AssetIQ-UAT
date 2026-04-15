import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Database,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  FileText,
  ArrowRight,
  Shield,
  Beaker,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import api from "../lib/api";

export default function SettingsDatabasePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [switchConfirm, setSwitchConfirm] = useState(null);
  
  // Fetch available databases
  const { data: databasesData, isLoading, error, refetch } = useQuery({
    queryKey: ["databases"],
    queryFn: async () => {
      const response = await api.get("/system/databases");
      return response.data;
    },
    staleTime: 30000,
  });
  
  // Fetch database status
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["databases-status"],
    queryFn: async () => {
      const response = await api.get("/system/databases/status");
      return response.data;
    },
    staleTime: 60000,
  });
  
  // Switch database mutation
  const switchMutation = useMutation({
    mutationFn: async (environment) => {
      const response = await api.post("/system/databases/switch", { environment });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      // Clear chat history cache immediately before reload
      queryClient.removeQueries({ queryKey: ["chatHistory"] });
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["databases-status"] });
      // Clear all other queries that depend on database
      queryClient.invalidateQueries({ queryKey: ["threats"] });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      // Store the preference in localStorage for the frontend
      localStorage.setItem("database_environment", data.environment);
      // Reload the page to apply the new database context
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to switch database");
    },
  });
  
  // Check if user is owner
  if (user?.role !== "owner") {
    return (
      <div className="p-4 sm:p-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6 flex items-center gap-4">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <div>
              <h3 className="font-semibold text-amber-800">Access Restricted</h3>
              <p className="text-sm text-amber-700">Only owners can access database settings.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const currentEnv = localStorage.getItem("database_environment") || databasesData?.current || "production";
  
  const getEnvIcon = (key) => {
    if (key === "production") return <Shield className="w-5 h-5" />;
    if (key === "uat") return <Beaker className="w-5 h-5" />;
    return <Database className="w-5 h-5" />;
  };
  
  const getEnvColor = (key, isCurrent) => {
    if (key === "production") {
      return isCurrent 
        ? "border-green-500 bg-green-50 ring-2 ring-green-500/20" 
        : "border-green-200 hover:border-green-400";
    }
    if (key === "uat") {
      return isCurrent 
        ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20" 
        : "border-amber-200 hover:border-amber-400";
    }
    return isCurrent ? "border-blue-500 bg-blue-50" : "border-slate-200";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            Database Environment
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Switch between Production and UAT databases
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            refetchStatus();
          }}
          disabled={isLoading || statusLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${(isLoading || statusLoading) ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      
      {/* Current Environment Banner */}
      <Card className={`border-2 ${currentEnv === "production" ? "border-green-500 bg-green-50" : "border-amber-500 bg-amber-50"}`}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentEnv === "production" ? (
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
                <Beaker className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className="font-semibold text-slate-800">
                Currently Connected: {currentEnv === "production" ? "Production" : "UAT"}
              </p>
              <p className="text-sm text-slate-600">
                Database: {currentEnv === "production" ? "assetiq" : "assetiq-UAT"}
              </p>
            </div>
          </div>
          <Badge className={currentEnv === "production" ? "bg-green-500" : "bg-amber-500"}>
            Active
          </Badge>
        </CardContent>
      </Card>
      
      {/* Database Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {databasesData?.available?.map((db) => {
          const isCurrent = db.key === currentEnv;
          const status = statusData?.databases?.find(s => s.key === db.key);
          
          return (
            <Card 
              key={db.key}
              className={`transition-all cursor-pointer ${getEnvColor(db.key, isCurrent)}`}
              onClick={() => !isCurrent && setSwitchConfirm(db)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      db.key === "production" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
                    }`}>
                      {getEnvIcon(db.key)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{db.label}</CardTitle>
                      <p className="text-xs text-slate-500">{db.name}</p>
                    </div>
                  </div>
                  {isCurrent && (
                    <Badge variant="outline" className="border-green-500 text-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Current
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">{db.description}</p>
                
                {/* Database Stats */}
                {status && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      {status.connected ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-xs text-slate-600">
                        {status.connected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                    {status.connected && (
                      <>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="text-xs text-slate-600">
                            {status.collections} collections
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-slate-400" />
                          <span className="text-xs text-slate-600">
                            {status.documents?.toLocaleString()} docs
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-slate-400" />
                          <span className="text-xs text-slate-600">
                            {status.storage_size_mb} MB
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                
                {/* Switch Button */}
                {!isCurrent && (
                  <Button 
                    className="w-full mt-2" 
                    variant={db.key === "production" ? "default" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwitchConfirm(db);
                    }}
                  >
                    Switch to {db.label}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Warning Notice */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Important Notice</p>
            <ul className="text-sm text-amber-700 mt-1 space-y-1 list-disc list-inside">
              <li>Switching databases will reload the application</li>
              <li>All unsaved changes will be lost</li>
              <li>UAT database is for testing purposes only</li>
              <li>Changes in UAT will not affect Production data</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      {/* Switch Confirmation Dialog */}
      <AlertDialog open={!!switchConfirm} onOpenChange={() => setSwitchConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {switchConfirm?.key === "production" ? (
                <Shield className="w-5 h-5 text-green-500" />
              ) : (
                <Beaker className="w-5 h-5 text-amber-500" />
              )}
              Switch to {switchConfirm?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to switch to the <strong>{switchConfirm?.label}</strong> database ({switchConfirm?.name}).
              <br /><br />
              {switchConfirm?.key === "production" ? (
                <span className="text-green-600">This is the live production environment. All changes will affect real data.</span>
              ) : (
                <span className="text-amber-600">This is the UAT environment for testing. Changes here won't affect production.</span>
              )}
              <br /><br />
              The page will reload after switching.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={switchConfirm?.key === "production" ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700"}
              onClick={() => {
                switchMutation.mutate(switchConfirm.key);
                setSwitchConfirm(null);
              }}
              disabled={switchMutation.isPending}
            >
              {switchMutation.isPending ? "Switching..." : `Switch to ${switchConfirm?.label}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
