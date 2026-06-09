import React from "react";
import { Crown, Shield, ShieldCheck, ShieldAlert, Eye, Wrench, Settings, Smartphone } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { DropdownMenuItem } from "../../components/ui/dropdown-menu";

// Role icons mapping
const roleIcons = {
  owner: Crown,
  admin: ShieldAlert,
  reliability_engineer: ShieldCheck,
  maintenance: Wrench,
  operations: Settings,
  viewer: Eye,
};

// Role colors
const roleColors = {
  owner: "bg-purple-100 text-purple-800 border-purple-200",
  admin: "bg-red-100 text-red-800 border-red-200",
  reliability_engineer: "bg-blue-100 text-blue-800 border-blue-200",
  maintenance: "bg-amber-100 text-amber-800 border-amber-200",
  operations: "bg-green-100 text-green-800 border-green-200",
  viewer: "bg-slate-100 text-slate-800 border-slate-200",
};

// Helper component for user avatars with proper fallback
const UserAvatar = ({ user, avatarUrl, size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-lg",
    xl: "h-16 w-16 text-xl"
  };
  
  const initials = user?.name?.charAt(0)?.toUpperCase() || "U";
  
  return (
    <Avatar className={`${sizeClasses[size]} border-2 border-white shadow-sm ${className}`}>
      {avatarUrl && (
        <AvatarImage 
          src={avatarUrl} 
          alt={user?.name || "User"} 
          className="object-cover"
        />
      )}
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
};


const SimpleModeUserBadge = ({ enabled, t }) => {
  if (!enabled) return null;
  return (
    <Badge
      variant="outline"
      className="text-[10px] bg-green-50 text-green-700 border-green-200 gap-1 font-medium"
      data-testid="simple-mode-user-badge"
    >
      <Smartphone className="w-3 h-3" />
      {t("simpleMode.title")}
    </Badge>
  );
};

const SimpleModeDropdownItem = ({ user, t, onToggle, isPending }) => {
  const enabled = !!user.default_simple_mode;
  return (
    <DropdownMenuItem
      onSelect={(e) => e.preventDefault()}
      className="flex items-center justify-between gap-3 cursor-default"
      data-testid={`simple-mode-toggle-${user.id}`}
    >
      <span className="flex items-center gap-2 text-sm min-w-0">
        <Smartphone className="w-4 h-4 shrink-0" />
        <span className="truncate">{t("userManagement.defaultSimpleMode")}</span>
      </span>
      <Switch
        checked={enabled}
        disabled={isPending}
        onCheckedChange={(checked) => onToggle(user, checked)}
        aria-label={(enabled
          ? t("userManagement.simpleModeAriaOn")
          : t("userManagement.simpleModeAriaOff")
        ).replace("{name}", user.name || "")}
        data-testid={`simple-mode-switch-${user.id}`}
      />
    </DropdownMenuItem>
  );
};

export { roleIcons, roleColors, UserAvatar, SimpleModeUserBadge, SimpleModeDropdownItem };
