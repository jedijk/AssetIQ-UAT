/**
 * NotificationBell Component
 * Notification indicator with dropdown
 */
import { useState } from "react";
import { Bell, X, CheckCircle2, AlertTriangle, Info, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";

const notificationTypeConfig = {
  success: { icon: CheckCircle2, color: "text-green-600 bg-green-100" },
  warning: { icon: AlertTriangle, color: "text-amber-600 bg-amber-100" },
  error: { icon: AlertTriangle, color: "text-red-600 bg-red-100" },
  info: { icon: Info, color: "text-blue-600 bg-blue-100" },
};

export const NotificationBell = ({ 
  notifications = [], 
  onDismiss, 
  onDismissAll,
  onMarkAsRead,
  t 
}) => {
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notification-bell">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-red-500">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between pb-2 border-b">
            <h4 className="font-semibold">{t?.("common.notifications") || "Notifications"}</h4>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismissAll}
                className="text-xs h-7"
              >
                {t?.("common.clearAll") || "Clear All"}
              </Button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t?.("common.noNotifications") || "No notifications"}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {notifications.map((notification) => {
                const config = notificationTypeConfig[notification.type] || notificationTypeConfig.info;
                const Icon = config.icon;

                return (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-lg border ${notification.read ? "bg-slate-50" : "bg-white"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-full ${config.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${notification.read ? "text-slate-600" : "text-slate-900 font-medium"}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {notification.time || "Just now"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onDismiss(notification.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
