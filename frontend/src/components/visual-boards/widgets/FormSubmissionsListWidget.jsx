import React from "react";
import { formatDateTimeCompact } from "../../../lib/dateUtils";
import { getApiUrl } from "../../../lib/apiConfig";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { boardCardClass, boardMutedText, vmbFlexGapClass, vmbStackClass, vmbText, vmbTitleGapClass, vmbWidgetPad, vmbWidgetShell } from "../boardTheme";
import { isWidgetPartEnabled } from "../widgetDisplayParts";

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("complete")) return "bg-green-100 text-green-700";
  if (s.includes("progress")) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function resolveAvatarSrc(photoPath) {
  if (!photoPath || !photoPath.startsWith("/api/")) return null;
  const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer";
  const baseUrl = getApiUrl().replace("/api", "");
  if (AUTH_MODE === "cookie") {
    return `${baseUrl}${photoPath}`;
  }
  const token = localStorage.getItem("token");
  if (!token) return null;
  return `${baseUrl}${photoPath}?token=${token}`;
}

function submitterInitials(name) {
  if (!name || name === "—") return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
}

function SubmitterAvatar({ name, photo, theme }) {
  const avatarSrc = resolveAvatarSrc(photo);
  const initials = submitterInitials(name);
  const fallbackClass =
    theme === "light"
      ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-[0.65em] font-medium"
      : "bg-gradient-to-br from-indigo-600 to-purple-700 text-white text-[0.65em] font-medium";

  return (
    <Avatar className="h-7 w-7 shrink-0">
      {avatarSrc ? (
        <AvatarImage src={avatarSrc} alt={name || "Submitter"} className="object-cover" />
      ) : null}
      <AvatarFallback className={fallbackClass}>{initials}</AvatarFallback>
    </Avatar>
  );
}

export default function FormSubmissionsListWidget({ widget, data, theme = "dark" }) {
  const config = widget?.config || {};
  const payload = data?.widgets?.[widget?.id] || {};
  const items = payload.items || [];
  const title = widget?.title || "Recently Completed Tasks";
  const titleClass = theme === "light" ? "text-slate-700" : "text-slate-200";
  const bodyClass = theme === "light" ? "text-slate-800" : "text-slate-100";
  const dividerClass = theme === "light" ? "border-slate-100" : "border-slate-700/50";

  const showTitle = isWidgetPartEnabled(config, "title");
  const showAvatar = isWidgetPartEnabled(config, "avatar");
  const showFormName = isWidgetPartEnabled(config, "form_name");
  const showTimestamp = isWidgetPartEnabled(config, "timestamp");
  const showStatus = isWidgetPartEnabled(config, "status", false);

  return (
    <div className={`${vmbWidgetShell()} ${vmbWidgetPad()} ${boardCardClass(theme)}`}>
      {showTitle ? (
        <h3 className={`${vmbTitleGapClass()} ${vmbText("title")} ${titleClass}`}>
          {title}
        </h3>
      ) : null}
      <div className={vmbStackClass()}>
        {items.length === 0 ? (
          <p className={`${vmbText("body")} ${boardMutedText(theme)}`}>No recent submissions</p>
        ) : (
          items.map((item) => {
            const formName = item.form_name || item.title || "Form";
            const when = item.submitted_at
              ? formatDateTimeCompact(item.submitted_at)
              : "—";

            return (
              <div
                key={item.id}
                className={`flex items-start ${vmbFlexGapClass("md")} ${vmbText("small")} border-b ${dividerClass} pb-2 last:border-b-0 last:pb-0`}
              >
                {showAvatar ? (
                  <SubmitterAvatar
                    name={item.submitted_by}
                    photo={item.submitted_by_photo}
                    theme={theme}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  {showFormName ? (
                    <div className={`font-medium truncate ${bodyClass}`}>{formName}</div>
                  ) : null}
                  {showTimestamp ? (
                    <div className={`tabular-nums truncate ${boardMutedText(theme)}`}>{when}</div>
                  ) : null}
                </div>
                {showStatus ? (
                  <span className={`shrink-0 px-2 py-0.5 rounded-full ${vmbText("small")} font-medium ${statusClass(item.status)}`}>
                    {item.status || "Completed"}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
