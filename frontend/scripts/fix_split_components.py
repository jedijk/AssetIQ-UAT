#!/usr/bin/env python3
"""Fix extracted components: add imports, destructuring; restore safe mains."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
PAGES = SRC / "pages"


def bump_imports(content: str) -> str:
    def repl_from(m: re.Match) -> str:
        quote = m.group(1)
        path = m.group(2)
        if path.startswith("../"):
            return f"from {quote}../{path[3:]}{quote}"
        return m.group(0)

    def repl_import(m: re.Match) -> str:
        quote = m.group(1)
        path = m.group(2)
        if path.startswith("../"):
            return f"import {quote}../{path[3:]}{quote}"
        return m.group(0)

    content = re.sub(r'from (["\'])(\.\./[^"\']+)\1', repl_from, content)
    content = re.sub(r'import (["\'])(\.\./[^"\']+)\1', repl_import, content)
    return content


def git_original(page: str) -> str:
    r = subprocess.run(
        ["git", "show", f"HEAD:frontend/src/pages/{page}"],
        capture_output=True,
        text=True,
        cwd=ROOT.parent,
    )
    if r.returncode != 0:
        raise RuntimeError(f"git show failed for {page}")
    return r.stdout


def patch_component(path: Path, imports: str, destructure: str) -> None:
    text = path.read_text(encoding="utf-8")
    text = re.sub(
        r"import React from \"react\";\n\nexport function (\w+)\(props\) \{\n  return \(\n    <>\n",
        f"{imports}\nexport function \\1({{\n  {destructure}\n}}) {{\n  return (\n    <>\n",
        text,
        count=1,
    )
    path.write_text(text, encoding="utf-8")


def fix_production() -> None:
    feat = SRC / "features" / "production" / "dashboard"
    patch_component(
        feat / "ProductionDashboardHeader.jsx",
        '''import React from "react";
import {
  ChevronLeft, ChevronRight, RefreshCw, Settings, Sparkles, Search, Download,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { PRODUCTION_SHIFT_OPTIONS } from "./productionDashboardShared";''',
        """isMobile, period, setPeriod, fromDate, setFromDate, toDate, setToDate,
  showCustomDate, setShowCustomDate, handlePeriod, fromStr, toStr, selectedShifts,
  toggleProductionShift, isFetching, handleManualRefresh, runPairingRepair,
  downloadPairingDebugReport, exportToExcel, displayDate, PERIOD_OPTIONS,
  prevDay, nextDay, stepPeriod, data,""",
    )
    # Add data prop to main
    main = (feat / "ProductionDashboardPageMain.jsx").read_text(encoding="utf-8")
    main = main.replace("        user={user}\n      />", "        user={user}\n        data={data}\n      />")
    (feat / "ProductionDashboardPageMain.jsx").write_text(main, encoding="utf-8")

    patch_component(
        feat / "ProductionDashboardKPIs.jsx",
        '''import React from "react";
import { Package, Trash2, TrendingUp, FlaskConical, Sigma, Clock } from "lucide-react";
import { KPICard, formatHoursMinutes } from "./productionDashboardShared";''',
        "kpis",
    )

    patch_component(
        feat / "MooneyViscosityChart.jsx",
        '''import React from "react";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, ReferenceArea,
  XAxis, YAxis, Tooltip, Legend, Line,
} from "recharts";
import { ChartSeriesToggles, ViscosityTooltip } from "./productionDashboardShared";''',
        "caps, chartSeries, setChartSeries, combinedSeries, selectedTime, setSelectedTime",
    )

    patch_component(
        feat / "ProductionShiftPanels.jsx",
        '''import React from "react";
import { Plus, Pencil, Trash2, MessageCircle, Pin, PinOff } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import {
  Tooltip as RadixTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "../../../components/ui/tooltip";
import { formatDateTimeCompact } from "../../../lib/dateUtils";
import { toast } from "sonner";
import {
  WasteReportingPanel,
  PRODUCTION_DASH_ACTION_EDIT,
  PRODUCTION_DASH_ACTION_DELETE,
  PRODUCTION_DASH_INFO_ACTION_EDIT,
  PRODUCTION_DASH_INFO_ACTION_DELETE,
} from "./productionDashboardShared";''',
        """data, isMobile, formTemplates, line90Equipment, setFormExec, setDeleteConfirm,
  wasteWeightThresholdKg, expandedEosNotes, setExpandedEosNotes, editBigBag, setEditBigBag,
  sortedInformationEntries, toggleInformationPin, setInformationPinMutation""",
    )

    patch_component(
        feat / "ProductionLogTable.jsx",
        '''import React from "react";
import { Plus, Search, Pencil, Printer, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { toast } from "sonner";''',
        """isMobile, logSearch, setLogSearch, filteredLog, data, getTimeKey, viscosityByTime,
  isAnomalyRow, selectedTime, setEditEntry, handleProductionLogReprint,
  printingLogSubmissionId, formTemplates, line90Equipment, setFormExec""",
    )

    patch_component(
        feat / "ProductionDashboardModals.jsx",
        '''import React from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../../../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { FormExecutionDialog } from "./productionDashboardShared";
import { productionAPI } from "../../../lib/api";
import { toast } from "sonner";''',
        """showAddEvent, setShowAddEvent, newEvent, setNewEvent, createEventMutation, fromStr,
  editEntry, setEditEntry, updateSubmissionMutation, invalidateDashboard,
  editBigBag, setEditBigBag, formExec, setFormExec, queryClient,
  deleteConfirm, setDeleteConfirm, deleteSubmissionMutation""",
    )


def restore_main(page: str, feat_rel: str, fn_transform=None) -> None:
    content = git_original(page)
    if fn_transform:
        content = fn_transform(content)
    content = bump_imports(content)
    out = SRC / feat_rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(content, encoding="utf-8")


def fix_causal() -> None:
    def transform(c: str) -> str:
        c = c.replace(
            "export default function CausalEnginePage()",
            "export default function CausalEnginePageMain()",
        )
        return c

    restore_main("CausalEnginePage.js", "features/causal-engine/CausalEnginePageMain.jsx", transform)
    (PAGES / "CausalEnginePage.js").write_text(
        'export { default } from "../features/causal-engine/CausalEnginePageMain";\n',
        encoding="utf-8",
    )


def fix_forms() -> None:
    def transform(c: str) -> str:
        c = re.sub(r"import \{ getBackendUrl \} from [\"'][^\"']+[\"'];\n", "", c)
        c = re.sub(
            r"// Get base URL without /api suffix\nconst API_BASE_URL = getBackendUrl\(\);\n\n",
            "",
            c,
        )
        c = c.replace(
            "const FormsPage = ({ embedded = false }) => {",
            "export default function FormsPage({ embedded = false }) {",
        )
        c = c.replace("export default FormsPage;\n", "")
        return c

    restore_main("FormsPage.js", "features/forms/FormsPageMain.jsx", transform)
    (PAGES / "FormsPage.js").write_text(
        'export { default } from "../features/forms/FormsPageMain";\n',
        encoding="utf-8",
    )


def fix_dashboard() -> None:
    raw = git_original("DashboardPage.js")
    helpers = "\n".join(raw.splitlines()[66:508])
    helper_imports = bump_imports("\n".join(raw.splitlines()[:66]))
    widgets = (
        helper_imports
        + "\n"
        + helpers
        + "\nexport {\n  AuthenticatedLightbox,\n  ImageWithFallback,\n  UserAvatar,\n  MiniBarChart,\n  StatCard,\n  ProgressCard,\n  DistributionCard,\n  RecentItemCard,\n};\n"
    )
    (SRC / "features" / "dashboard" / "dashboardWidgets.jsx").write_text(widgets, encoding="utf-8")

    main = bump_imports(raw)
    main = main.replace("\n".join(raw.splitlines()[66:508]) + "\n", "")
    main = main.replace(
        'const ProductionDashboardPage = lazy(() => import("./ProductionDashboardPage"));',
        'const ProductionDashboardPage = lazy(() => import("../../pages/ProductionDashboardPage"));',
    )
    main = main.replace(
        'import("../features/dashboardBuilder/SmartDashboardBuilderPanel")',
        'import("../dashboardBuilder/SmartDashboardBuilderPanel")',
    )
    main = main.replace(
        'import OperatorLandingPage from "./OperatorLandingPage";',
        'import OperatorLandingPage from "../../pages/OperatorLandingPage";',
    )
    main = main.replace(
        'import InsightsPage from "./InsightsPage";',
        'import InsightsPage from "../../pages/InsightsPage";',
    )
    main = main.replace(
        "export default function DashboardPage({ initialTab })",
        "export default function DashboardPageMain({ initialTab })",
    )
    idx = main.index("import { DISCIPLINES }")
    line_end = main.index("\n", idx) + 1
    widget_import = (
        'import {\n  AuthenticatedLightbox,\n  ImageWithFallback,\n  UserAvatar,\n  MiniBarChart,\n  StatCard,\n  ProgressCard,\n  DistributionCard,\n  RecentItemCard,\n} from "./dashboardWidgets";\n'
    )
    main = main[:line_end] + widget_import + main[line_end:]
    (SRC / "features" / "dashboard" / "DashboardPageMain.jsx").write_text(main, encoding="utf-8")
    (PAGES / "DashboardPage.js").write_text(
        'export { default } from "../features/dashboard/DashboardPageMain";\n',
        encoding="utf-8",
    )


def fix_user_mgmt() -> None:
    def transform(c: str) -> str:
        c = re.sub(
            r"import \{ getBackendUrl, getAuthHeaders \} from ['\"][^'\"]+['\"];\n",
            "",
            c,
        )
        c = c.replace(
            "const SettingsUserManagementPage = () => {",
            "export default function SettingsUserManagementPage() {",
        )
        c = c.replace("export default SettingsUserManagementPage;\n", "")
        c = c.replace(
            'import SettingsPermissionsPage from "./SettingsPermissionsPage";',
            'import SettingsPermissionsPage from "../../pages/SettingsPermissionsPage";',
        )
        # Use shared UserAvatar
        shared_block = c.split("// Role icons mapping")[0]
        rest = "// Role icons mapping" + c.split("// Role icons mapping", 1)[1]
        rest = rest.split("const SettingsUserManagementPage")[0]
        rest = rest.split("const UserAvatar = ")[1]
        rest = rest.split("};\n\n", 1)[1]  # drop UserAvatar component
        c = (
            shared_block
            + 'import { roleIcons, roleColors, UserAvatar } from "./userManagementShared";\n\n'
            + "export default function SettingsUserManagementPage() {"
            + rest.split("export default function SettingsUserManagementPage() {", 1)[-1]
        )
        return c

    raw = git_original("SettingsUserManagementPage.js")
    raw = re.sub(
        r"import \{ getBackendUrl, getAuthHeaders \} from ['\"][^'\"]+['\"];\n",
        "",
        raw,
    )
    raw = raw.replace(
        'import SettingsPermissionsPage from "./SettingsPermissionsPage";',
        'import SettingsPermissionsPage from "../../pages/SettingsPermissionsPage";',
    )
    # Extract shared
    shared = raw.split("// Role icons mapping")[1].split("const SettingsUserManagementPage")[0]
    shared_path = SRC / "features" / "user-management" / "userManagementShared.jsx"
    shared_path.write_text(
        bump_imports(
            'import React from "react";\n'
            'import { Crown, Shield, ShieldCheck, ShieldAlert, Eye, Wrench, Settings } from "lucide-react";\n'
            'import { Avatar, AvatarImage, AvatarFallback } from "../../components/ui/avatar";\n\n'
            "// Role icons mapping"
            + shared
            + "\nexport { roleIcons, roleColors, UserAvatar };\n"
        ),
        encoding="utf-8",
    )
    main = bump_imports(raw)
    main = re.sub(
        r"// Role icons mapping[\s\S]*?const SettingsUserManagementPage = \(\) => \{",
        'import { roleIcons, roleColors, UserAvatar } from "./userManagementShared";\n\nexport default function SettingsUserManagementPage() {',
        main,
        count=1,
    )
    main = main.replace("export default SettingsUserManagementPage;\n", "")
    (SRC / "features" / "user-management" / "SettingsUserManagementPageMain.jsx").write_text(
        main, encoding="utf-8"
    )
    (PAGES / "SettingsUserManagementPage.js").write_text(
        'export { default } from "../features/user-management/SettingsUserManagementPageMain";\n',
        encoding="utf-8",
    )


if __name__ == "__main__":
    fix_production()
    fix_causal()
    fix_forms()
    fix_dashboard()
    fix_user_mgmt()
    print("Fixed.")
