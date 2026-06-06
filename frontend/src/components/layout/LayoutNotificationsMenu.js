import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bell, MessageSquare, ChevronRight, Clock } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { useCapabilities } from "../../core/performance";
import { actionsAPI, feedbackAPI } from "../../lib/api";
import { springPresets } from "../animations/constants";
import {
  notify,
  getNotificationSettings,
  isNotificationSupported,
  getPermissionStatus,
} from "../../services/notificationService";

export default function LayoutNotificationsMenu({
  open,
  onOpenChange,
  dismissedNotifications,
  setDismissedNotifications,
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const caps = useCapabilities();

  const bellPollMs = caps.realtimeUpdates ? 60_000 : 120_000;
  const bellStaleMs = caps.realtimeUpdates ? 30_000 : 90_000;

  const { data: overdueData } = useQuery({
    queryKey: ["overdue-actions"],
    queryFn: actionsAPI.getOverdue,
    refetchInterval: bellPollMs,
    staleTime: bellStaleMs,
  });

  const overdueActions = overdueData?.overdue_actions || [];
  const overdueCount = overdueData?.count || 0;

  const canViewAllFeedback = ["owner", "admin", "manager"].includes(user?.role);
  const { data: unreadFeedbackData } = useQuery({
    queryKey: ["unread-feedback-count"],
    queryFn: feedbackAPI.getUnreadCount,
    refetchInterval: bellPollMs,
    staleTime: bellStaleMs,
    enabled: canViewAllFeedback,
  });

  const { data: unreadResponsesData } = useQuery({
    queryKey: ["unread-responses-count"],
    queryFn: feedbackAPI.getUnreadResponsesCount,
    refetchInterval: bellPollMs,
    staleTime: bellStaleMs,
    enabled: !canViewAllFeedback && !!user,
  });

  const unreadFeedbackCount = unreadFeedbackData?.unread_count || 0;
  const unreadResponsesCount = unreadResponsesData?.unread_count || 0;
  const totalNotificationCount =
    overdueCount + (canViewAllFeedback ? unreadFeedbackCount : unreadResponsesCount);

  const lastUnreadFeedbackRef = useRef(0);
  useEffect(() => {
    if (!canViewAllFeedback) return;
    const prev = lastUnreadFeedbackRef.current || 0;
    lastUnreadFeedbackRef.current = unreadFeedbackCount;
    if (unreadFeedbackCount <= prev) return;
    try {
      const settings = getNotificationSettings();
      const canNotify =
        settings.enabled &&
        isNotificationSupported() &&
        getPermissionStatus() === "granted";
      if (!canNotify) return;
    } catch (_e) {
      return;
    }
    const delta = unreadFeedbackCount - prev;
    notify.system(
      "New feedback submitted",
      `${delta} new feedback ${delta === 1 ? "item" : "items"} received`,
      "/feedback"
    );
  }, [canViewAllFeedback, unreadFeedbackCount]);

  const lastUnreadResponsesRef = useRef(0);
  useEffect(() => {
    if (canViewAllFeedback) return;
    const prev = lastUnreadResponsesRef.current || 0;
    lastUnreadResponsesRef.current = unreadResponsesCount;
    if (unreadResponsesCount <= prev) return;
    try {
      const settings = getNotificationSettings();
      const canNotify =
        settings.enabled &&
        isNotificationSupported() &&
        getPermissionStatus() === "granted";
      if (!canNotify) return;
    } catch (_e) {
      return;
    }
    const delta = unreadResponsesCount - prev;
    notify.system(
      "New feedback response",
      `${delta} new ${delta === 1 ? "response" : "responses"} to your feedback`,
      "/feedback"
    );
  }, [canViewAllFeedback, unreadResponsesCount]);

  const handleMarkFeedbackRead = async (e) => {
    e.stopPropagation();
    try {
      await feedbackAPI.markAllRead();
      queryClient.invalidateQueries({ queryKey: ["unread-feedback-count"] });
    } catch (error) {
      console.error("Failed to mark feedback as read:", error);
    }
  };

  const handleMarkResponsesSeen = async (e) => {
    e.stopPropagation();
    try {
      await feedbackAPI.markResponsesSeen();
      queryClient.invalidateQueries({ queryKey: ["unread-responses-count"] });
    } catch (error) {
      console.error("Failed to mark responses as seen:", error);
    }
  };

  const formatOverdue = (dueDate) => {
    if (!dueDate) return "";
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t("notifications.dueToday");
    if (diffDays === 1) return t("notifications.overdueBy1Day");
    return t("notifications.overdueByDays").replace("{days}", diffDays);
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8 text-slate-600 hover:text-slate-900 relative transition-transform hover:scale-105 active:scale-95"
          data-testid="notifications-button"
        >
          <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          {totalNotificationCount > 0 && !dismissedNotifications && (
            <motion.span
              className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full min-w-[14px] sm:min-w-[16px] h-[14px] sm:h-[16px] flex items-center justify-center px-0.5"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={springPresets.bouncy}
            >
              {totalNotificationCount > 9 ? "9+" : totalNotificationCount}
            </motion.span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {canViewAllFeedback && unreadFeedbackCount > 0 && !dismissedNotifications && (
          <>
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                New Feedback
              </span>
              <div className="flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                  {unreadFeedbackCount}
                </span>
                <button
                  onClick={handleMarkFeedbackRead}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                  data-testid="clear-feedback-notifications-btn"
                >
                  Clear
                </button>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer py-2" onClick={() => navigate("/feedback")}>
              <div className="flex items-center justify-between w-full">
                <span className="text-sm text-slate-700">
                  {unreadFeedbackCount} new feedback {unreadFeedbackCount === 1 ? "item" : "items"}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {!canViewAllFeedback && unreadResponsesCount > 0 && !dismissedNotifications && (
          <>
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-500" />
                Feedback Responses
              </span>
              <div className="flex items-center gap-2">
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                  {unreadResponsesCount}
                </span>
                <button
                  onClick={handleMarkResponsesSeen}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                  data-testid="clear-responses-notifications-btn"
                >
                  Clear
                </button>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer py-2" onClick={() => navigate("/feedback")}>
              <div className="flex items-center justify-between w-full">
                <span className="text-sm text-slate-700">
                  {unreadResponsesCount} new {unreadResponsesCount === 1 ? "response" : "responses"} to your feedback
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("notifications.overdueActions")}</span>
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                {overdueCount}
              </span>
            )}
            {totalNotificationCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDismissedNotifications(true);
                }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
                data-testid="clear-notifications-btn"
              >
                {t("notifications.clearAll") || "Clear"}
              </button>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(overdueCount === 0 &&
          (!canViewAllFeedback || unreadFeedbackCount === 0) &&
          (canViewAllFeedback || unreadResponsesCount === 0)) ||
        dismissedNotifications ? (
          <div className="px-3 py-6 text-center text-slate-400 text-sm">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {dismissedNotifications
              ? t("notifications.cleared") || "Notifications cleared"
              : t("notifications.noOverdueActions")}
            {dismissedNotifications && totalNotificationCount > 0 && (
              <button
                onClick={() => setDismissedNotifications(false)}
                className="block mx-auto mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
              >
                {t("notifications.showAgain") || "Show notifications"}
              </button>
            )}
          </div>
        ) : overdueCount > 0 ? (
          <>
            <div className="max-h-64 overflow-y-auto">
              {overdueActions.slice(0, 5).map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  className="cursor-pointer flex flex-col items-start gap-1 py-2"
                  onClick={() => navigate("/actions")}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium text-slate-800 truncate max-w-[200px]">
                      {action.title}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        action.priority === "critical"
                          ? "bg-red-100 text-red-700"
                          : action.priority === "high"
                            ? "bg-orange-100 text-orange-700"
                            : action.priority === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {action.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <Clock className="w-3 h-3" />
                    {formatOverdue(action.due_date)}
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
            {overdueCount > 5 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer justify-center text-blue-600 font-medium"
                  onClick={() => navigate("/actions")}
                >
                  {t("notifications.viewAll")} ({overdueCount})
                  <ChevronRight className="w-4 h-4 ml-1" />
                </DropdownMenuItem>
              </>
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
