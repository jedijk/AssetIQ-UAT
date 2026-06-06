#!/usr/bin/env python3
"""Fix User Management split views: imports, prop destructuring, Main wiring."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FEAT = ROOT / "src" / "features" / "user-management"

MOBILE_IMPORTS = '''import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  Shield,
  ShieldCheck,
  Eye,
  Edit,
  X,
  Check,
  RefreshCw,
  Camera,
  Trash2,
  AlertCircle,
  UserPlus,
  Bell,
  Factory,
  KeyRound,
  Lock,
  PlayCircle,
  ArrowLeft,
  Smartphone,
  Briefcase,
  Building2,
  Clock,
  MoreVertical,
  UserCog,
  UserX,
  UserCheck,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import ImageEditor from "../../components/ImageEditor";
import { roleIcons, roleColors, UserAvatar } from "./userManagementShared";
'''

DESKTOP_IMPORTS = '''import React from "react";
import {
  Users,
  Search,
  Shield,
  ShieldCheck,
  Eye,
  Edit,
  X,
  Check,
  Filter,
  RefreshCw,
  Camera,
  Trash2,
  AlertCircle,
  UserPlus,
  Bell,
  Factory,
  Crown,
  KeyRound,
  Lock,
  PlayCircle,
  Smartphone,
  Mail,
  MoreVertical,
  UserCog,
  UserX,
  UserCheck,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import ImageEditor from "../../components/ImageEditor";
import SettingsPermissionsPage from "../../pages/SettingsPermissionsPage";
import { roleIcons, roleColors, UserAvatar } from "./userManagementShared";
'''

MOBILE_PROPS = """
  navigate,
  refetch,
  search,
  setSearch,
  roleFilter,
  setRoleFilter,
  simpleModeFilter,
  setSimpleModeFilter,
  simpleModeCount,
  users,
  usersLoading,
  displayUsers,
  pendingData,
  roles,
  roleColors,
  roleIcons,
  isOwner,
  currentUser,
  t,
  formatDate,
  avatarUrls,
  editingUser,
  setEditingUser,
  editForm,
  setEditForm,
  changeRoleUser,
  setChangeRoleUser,
  selectedRole,
  setSelectedRole,
  approvalDialogUser,
  setApprovalDialogUser,
  approvalAction,
  setApprovalAction,
  approvalRole,
  setApprovalRole,
  approvalInstallations,
  setApprovalInstallations,
  rejectionReason,
  setRejectionReason,
  approvalMutation,
  deleteConfirmUser,
  setDeleteConfirmUser,
  deleteUserMutation,
  editorOpen,
  editorImage,
  fileInputRef,
  handleAvatarUpload,
  handleEditProfile,
  handleChangeRole,
  handleConfirmRoleChange,
  handleSaveProfile,
  handleEditorClose,
  handleEditorSave,
  handleFileChange,
  handleOpenSetPassword,
  resetPasswordMutation,
  resetIntroMutation,
  resetConsentMutation,
  updateProfileMutation,
  updateRoleMutation,
  updateStatusMutation,
  installations,
  setPasswordDialog,
"""

DESKTOP_PROPS = MOBILE_PROPS + """
  activeTab,
  setActiveTab,
  showCreateUser,
  setShowCreateUser,
  createUserForm,
  setCreateUserForm,
  createUserMutation,
  installationDialogUser,
  setInstallationDialogUser,
  selectedInstallations,
  setSelectedInstallations,
  updateInstallationsMutation,
"""


def patch_view(path: Path, fn_name: str, imports: str, props: str) -> None:
    text = path.read_text(encoding="utf-8")
    body = re.sub(r"^import React from \"react\";\n\n", "", text)
    body = re.sub(
        r"export function (\w+)\(props\) \{\n  return \(\n    <>\n",
        "",
        body,
        count=1,
    )
    # Fix broken mobile extraction tail
    body = re.sub(
        r"\n      </div>\n    \);\n  \}\n\n  // Desktop Layout\n    </>\n  \);\n\}\n$",
        "\n      </div>\n    </>\n  );\n}\n",
        body,
    )
    body = re.sub(
        r"\n    </div>\n    </>\n  \);\n\}\n$",
        "\n    </div>\n    </>\n  );\n}\n",
        body,
    )
    props_block = ",\n".join(line.strip() for line in props.strip().splitlines() if line.strip())
    patched = (
        f"{imports}\n"
        f"export function {fn_name}({{\n"
        f"{props_block},\n"
        f"}}) {{\n"
        f"  return (\n    <>\n{body}"
    )
    path.write_text(patched, encoding="utf-8")


def wire_main() -> None:
    main_path = FEAT / "SettingsUserManagementPageMain.jsx"
    text = main_path.read_text(encoding="utf-8")

    if "UserManagementMobileView" not in text:
        text = text.replace(
            'import { roleIcons, roleColors, UserAvatar } from "./userManagementShared";',
            'import { UserManagementMobileView } from "./UserManagementMobileView";\n'
            'import { UserManagementDesktopView } from "./UserManagementDesktopView";',
        )

    view_props = """
  const viewProps = {
    navigate,
    refetch,
    search,
    setSearch,
    roleFilter,
    setRoleFilter,
    simpleModeFilter,
    setSimpleModeFilter,
    simpleModeCount,
    users,
    usersLoading,
    displayUsers,
    pendingData,
    roles,
    roleColors,
    roleIcons,
    isOwner,
    currentUser,
    t,
    formatDate,
    avatarUrls,
    editingUser,
    setEditingUser,
    editForm,
    setEditForm,
    changeRoleUser,
    setChangeRoleUser,
    selectedRole,
    setSelectedRole,
    approvalDialogUser,
    setApprovalDialogUser,
    approvalAction,
    setApprovalAction,
    approvalRole,
    setApprovalRole,
    approvalInstallations,
    setApprovalInstallations,
    rejectionReason,
    setRejectionReason,
    approvalMutation,
    deleteConfirmUser,
    setDeleteConfirmUser,
    deleteUserMutation,
    editorOpen,
    editorImage,
    fileInputRef,
    handleAvatarUpload,
    handleEditProfile,
    handleChangeRole,
    handleConfirmRoleChange,
    handleSaveProfile,
    handleEditorClose,
    handleEditorSave,
    handleFileChange,
    handleOpenSetPassword,
    resetPasswordMutation,
    resetIntroMutation,
    resetConsentMutation,
    updateProfileMutation,
    updateRoleMutation,
    updateStatusMutation,
    installations,
    setPasswordDialog,
    activeTab,
    setActiveTab,
    showCreateUser,
    setShowCreateUser,
    createUserForm,
    setCreateUserForm,
    createUserMutation,
    installationDialogUser,
    setInstallationDialogUser,
    selectedInstallations,
    setSelectedInstallations,
    updateInstallationsMutation,
  };
"""

    replacement = (
        view_props
        + "\n  if (isMobile) {\n"
        + "    return <UserManagementMobileView {...viewProps} />;\n"
        + "  }\n\n"
        + "  return <UserManagementDesktopView {...viewProps} />;\n"
        + "}\n"
    )

    text = re.sub(
        r"\n  // Mobile Layout\n  if \(isMobile\) \{[\s\S]*?\n  \);\n\};\n$",
        "\n" + replacement,
        text,
        count=1,
    )

    # Trim imports only used in extracted views
    text = re.sub(
        r"import ImageEditor from \"\.\./\.\./components/ImageEditor\";\n",
        "",
        text,
    )
    text = re.sub(
        r"import DesktopOnlyMessage from \"\.\./\.\./components/DesktopOnlyMessage\";\n",
        "",
        text,
    )
    text = re.sub(
        r"import \{ Avatar, AvatarImage, AvatarFallback \} from \"\.\./\.\./components/ui/avatar\";\n",
        "",
        text,
    )
    text = re.sub(
        r"import \{ Tabs, TabsContent, TabsList, TabsTrigger \} from \"\.\./\.\./components/ui/tabs\";\n",
        "",
        text,
    )
    text = re.sub(
        r"import SettingsPermissionsPage from \"\.\./\.\./pages/SettingsPermissionsPage\";\n",
        "",
        text,
    )
    text = re.sub(
        r"import \{\n  Users,\n  Search,\n  Shield,\n  ShieldCheck,\n  ShieldAlert,\n  Eye,\n  Wrench,\n  Settings,\n  UserCog,\n  Mail,\n  Phone,\n  Building2,\n  Briefcase,\n  Calendar,\n  Clock,\n  ChevronDown,\n  MoreVertical,\n  UserX,\n  UserCheck,\n  Edit,\n  X,\n  Check,\n  Filter,\n  RefreshCw,\n  Camera,\n  Upload,\n  Trash2,\n  AlertCircle,\n  UserPlus,\n  Bell,\n  Factory,\n  Crown,\n  KeyRound,\n  Lock,\n  PlayCircle,\n  ArrowLeft,\n  Smartphone,\n\} from \"lucide-react\";\n",
        "",
        text,
    )
    text = re.sub(
        r"import \{ Badge \} from \"\.\./\.\./components/ui/badge\";\n",
        "",
        text,
    )
    text = re.sub(
        r"import \{\n  Select,\n  SelectContent,\n  SelectItem,\n  SelectTrigger,\n  SelectValue,\n\} from \"\.\./\.\./components/ui/select\";\n",
        "",
        text,
    )
    text = re.sub(
        r"import \{\n  DropdownMenu,\n  DropdownMenuContent,\n  DropdownMenuItem,\n  DropdownMenuSeparator,\n  DropdownMenuTrigger,\n\} from \"\.\./\.\./components/ui/dropdown-menu\";\n",
        "",
        text,
    )

    main_path.write_text(text, encoding="utf-8")


def main() -> None:
    patch_view(FEAT / "UserManagementMobileView.jsx", "UserManagementMobileView", MOBILE_IMPORTS, MOBILE_PROPS)
    patch_view(FEAT / "UserManagementDesktopView.jsx", "UserManagementDesktopView", DESKTOP_IMPORTS, DESKTOP_PROPS)
    wire_main()
    print("User management views fixed.")


if __name__ == "__main__":
    main()
