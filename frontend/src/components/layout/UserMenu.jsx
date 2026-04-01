/**
 * UserMenu Component
 * User dropdown with profile, settings, and logout
 */
import { User, Settings, LogOut, ChevronDown, Shield } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export const UserMenu = ({ 
  user, 
  onLogout, 
  onSettingsClick,
  onProfileClick,
  t 
}) => {
  const initials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const roleColors = {
    owner: "bg-purple-100 text-purple-700",
    admin: "bg-blue-100 text-blue-700",
    manager: "bg-green-100 text-green-700",
    engineer: "bg-amber-100 text-amber-700",
    technician: "bg-slate-100 text-slate-700",
    viewer: "bg-slate-100 text-slate-500",
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 h-auto py-1.5 px-2" data-testid="user-menu-trigger">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatar_url} alt={user?.name} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:block text-left">
            <p className="text-sm font-medium leading-none">{user?.name || "User"}</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400 hidden md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user?.name}</p>
            <p className="text-xs leading-none text-slate-500">{user?.email}</p>
            {user?.role && (
              <Badge className={`mt-2 text-xs w-fit ${roleColors[user.role] || roleColors.viewer}`}>
                <Shield className="w-3 h-3 mr-1" />
                {user.role}
              </Badge>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onProfileClick && (
          <DropdownMenuItem onClick={onProfileClick}>
            <User className="w-4 h-4 mr-2" />
            {t?.("common.profile") || "Profile"}
          </DropdownMenuItem>
        )}
        {onSettingsClick && (
          <DropdownMenuItem onClick={onSettingsClick}>
            <Settings className="w-4 h-4 mr-2" />
            {t?.("common.settings") || "Settings"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-red-600">
          <LogOut className="w-4 h-4 mr-2" />
          {t?.("common.logout") || "Logout"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
