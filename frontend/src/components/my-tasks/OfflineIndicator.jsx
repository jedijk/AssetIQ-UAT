/**
 * OfflineIndicator Component
 * Shows offline/online status with sync functionality
 */
import { Wifi, WifiOff, Cloud, CloudOff, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export const OfflineIndicator = ({ 
  isOnline, 
  pendingCount = 0, 
  onSync, 
  isSyncing,
  t 
}) => {
  if (isOnline && pendingCount === 0) {
    return null; // Don't show when online and nothing pending
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
      isOnline ? "bg-blue-50 border border-blue-200" : "bg-amber-50 border border-amber-200"
    }`}>
      {isOnline ? (
        <>
          <Cloud className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-blue-700">
            {pendingCount > 0 
              ? `${pendingCount} ${t?.("tasks.pendingSync") || "pending sync"}`
              : t?.("common.online") || "Online"
            }
          </span>
          {pendingCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={isSyncing}
              className="h-7 px-2"
            >
              {isSyncing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
            </Button>
          )}
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-700">
            {t?.("common.offline") || "Offline"}
            {pendingCount > 0 && ` • ${pendingCount} ${t?.("tasks.saved") || "saved"}`}
          </span>
          <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
            <CloudOff className="w-3 h-3 mr-1" />
            {t?.("tasks.workingOffline") || "Working offline"}
          </Badge>
        </>
      )}
    </div>
  );
};

export default OfflineIndicator;
