import { WifiOff, Cloud, RefreshCw } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

export function MyTasksOfflineBanner({ offlineStatus, isSyncing, onSync }) {
  return (
    <>
      {!offlineStatus.isOnline && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4" />
            <span>You&apos;re offline. Tasks will sync when connected.</span>
          </div>
          {offlineStatus.pendingCount > 0 && (
            <Badge variant="secondary" className="bg-amber-600 text-white">
              {offlineStatus.pendingCount} pending
            </Badge>
          )}
        </div>
      )}

      {offlineStatus.isOnline && offlineStatus.pendingCount > 0 && (
        <div className="bg-blue-500 text-white px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            <span>{offlineStatus.pendingCount} task(s) completed offline, ready to sync</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-white text-blue-600 hover:bg-blue-50"
            onClick={onSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 mr-1" />
                Sync Now
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}
