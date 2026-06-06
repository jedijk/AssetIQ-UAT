#!/usr/bin/env python3
"""Split large frontend page files into feature folders with thin page shells."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
PAGES = SRC / "pages"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def bump_imports(content: str) -> str:
    """pages/ -> features/<x>/ : one extra ../ on relative imports."""

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

    content = re.sub(
        r'from (["\'])(\.\./[^"\']+)\1',
        repl_from,
        content,
    )
    content = re.sub(
        r'import (["\'])(\.\./[^"\']+)\1',
        repl_import,
        content,
    )
    return content


def shell(page: Path, rel_main: str) -> None:
    write_text(page, f'export {{ default }} from "{rel_main}";\n')


def extract_block(content: str, start: int, end: int) -> str:
    lines = content.splitlines(keepends=True)
    return "".join(lines[start - 1 : end])


def wrap_component(name: str, jsx: str, extra_imports: str = "") -> str:
    return (
        f'{extra_imports}import React from "react";\n\n'
        f"export function {name}(props) {{\n"
        f"  return (\n    <>\n{jsx}    </>\n  );\n}}\n"
    )


def split_production() -> None:
    src = PAGES / "ProductionDashboardPage.js"
    feat = SRC / "features" / "production" / "dashboard"
    raw = read_text(src)
    main = bump_imports(raw).replace(
        'await import("../lib/printLabel")',
        'await import("../../../lib/printLabel")',
    )

    # Extract render sections (1-based line numbers from original file)
    header = extract_block(raw, 942, 1160)
    kpis = extract_block(raw, 1172, 1224)
    chart = extract_block(raw, 1226, 1350)
    shifts = extract_block(raw, 1352, 1748)
    log_table = extract_block(raw, 1750, 2055)
    modals = extract_block(raw, 2059, 2379)
    loading = extract_block(raw, 1162, 1168)

    write_text(
        feat / "ProductionDashboardHeader.jsx",
        wrap_component("ProductionDashboardHeader", header),
    )
    write_text(
        feat / "ProductionDashboardKPIs.jsx",
        wrap_component(
            "ProductionDashboardKPIs",
            kpis,
            'import { Package, Trash2, TrendingUp, FlaskConical, Sigma, Clock } from "lucide-react";\n'
            'import { KPICard, formatHoursMinutes } from "./productionDashboardShared";\n',
        ),
    )
    write_text(
        feat / "MooneyViscosityChart.jsx",
        wrap_component(
            "MooneyViscosityChart",
            chart,
            'import { ResponsiveContainer, ComposedChart, CartesianGrid, ReferenceArea, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";\n'
            'import { ChartSeriesToggles, ViscosityTooltip } from "./productionDashboardShared";\n',
        ),
    )
    write_text(
        feat / "ProductionShiftPanels.jsx",
        wrap_component(
            "ProductionShiftPanels",
            shifts,
            'import { Plus, Pencil, Trash2, MessageCircle, Pin, PinOff } from "lucide-react";\n'
            'import { Button } from "../../../components/ui/button";\n'
            'import { Badge } from "../../../components/ui/badge";\n'
            'import { WasteReportingPanel, PRODUCTION_DASH_ACTION_EDIT, PRODUCTION_DASH_ACTION_DELETE, PRODUCTION_DASH_INFO_ACTION_EDIT, PRODUCTION_DASH_INFO_ACTION_DELETE } from "./productionDashboardShared";\n'
            'import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";\n'
            'import { Tooltip as RadixTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";\n'
            'import { toast } from "sonner";\n',
        ),
    )
    write_text(
        feat / "ProductionLogTable.jsx",
        wrap_component(
            "ProductionLogTable",
            log_table,
            'import { Plus, Search, Pencil, Printer, Loader2 } from "lucide-react";\n'
            'import { Button } from "../../../components/ui/button";\n'
            'import { Badge } from "../../../components/ui/badge";\n'
            'import { Input } from "../../../components/ui/input";\n'
            'import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";\n'
            'import { toast } from "sonner";\n',
        ),
    )
    write_text(
        feat / "ProductionDashboardModals.jsx",
        wrap_component(
            "ProductionDashboardModals",
            modals,
            'import { Button } from "../../../components/ui/button";\n'
            'import { Input } from "../../../components/ui/input";\n'
            'import { Label } from "../../../components/ui/label";\n'
            'import { Textarea } from "../../../components/ui/textarea";\n'
            'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";\n'
            'import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";\n'
            'import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../../components/ui/alert-dialog";\n'
            'import { FormExecutionDialog } from "./productionDashboardShared";\n'
            'import { productionAPI } from "../../../lib/api";\n'
            'import { toast } from "sonner";\n',
        ),
    )

    # Rewrite main: keep logic, replace render
    lines = main.splitlines(keepends=True)
    logic = "".join(lines[:939])
    extra_imports = (
        'import { ProductionDashboardHeader } from "./ProductionDashboardHeader";\n'
        'import { ProductionDashboardKPIs } from "./ProductionDashboardKPIs";\n'
        'import { MooneyViscosityChart } from "./MooneyViscosityChart";\n'
        'import { ProductionShiftPanels } from "./ProductionShiftPanels";\n'
        'import { ProductionLogTable } from "./ProductionLogTable";\n'
        'import { ProductionDashboardModals } from "./ProductionDashboardModals";\n'
    )
    # insert after shared import block
    idx = main.rindex("productionDashboardShared")
    line_end = main.index("\n", idx) + 1
    main = main[:line_end] + extra_imports + main[line_end:]

    render = f'''  return (
    <div className="bg-transparent space-y-5 overflow-x-hidden" data-testid="production-dashboard">
      <ProductionDashboardHeader
        isMobile={{isMobile}}
        period={{period}}
        setPeriod={{setPeriod}}
        fromDate={{fromDate}}
        setFromDate={{setFromDate}}
        toDate={{toDate}}
        setToDate={{setToDate}}
        showCustomDate={{showCustomDate}}
        setShowCustomDate={{setShowCustomDate}}
        handlePeriod={{handlePeriod}}
        fromStr={{fromStr}}
        toStr={{toStr}}
        selectedShifts={{selectedShifts}}
        toggleProductionShift={{toggleProductionShift}}
        isFetching={{isFetching}}
        handleManualRefresh={{handleManualRefresh}}
        runPairingRepair={{runPairingRepair}}
        downloadPairingDebugReport={{downloadPairingDebugReport}}
        exportToExcel={{exportToExcel}}
        displayDate={{displayDate}}
        PERIOD_OPTIONS={{PERIOD_OPTIONS}}
        prevDay={{prevDay}}
        nextDay={{nextDay}}
        stepPeriod={{stepPeriod}}
        user={{user}}
      />
{loading}      {{!isLoading && (
        <>
          <ProductionDashboardKPIs kpis={{kpis}} />
          <MooneyViscosityChart
            caps={{caps}}
            chartSeries={{chartSeries}}
            setChartSeries={{setChartSeries}}
            combinedSeries={{combinedSeries}}
            selectedTime={{selectedTime}}
            setSelectedTime={{setSelectedTime}}
          />
          <ProductionShiftPanels
            data={{data}}
            isMobile={{isMobile}}
            formTemplates={{formTemplates}}
            line90Equipment={{line90Equipment}}
            setFormExec={{setFormExec}}
            setDeleteConfirm={{setDeleteConfirm}}
            wasteWeightThresholdKg={{wasteWeightThresholdKg}}
            expandedEosNotes={{expandedEosNotes}}
            setExpandedEosNotes={{setExpandedEosNotes}}
            editBigBag={{editBigBag}}
            setEditBigBag={{setEditBigBag}}
            sortedInformationEntries={{sortedInformationEntries}}
            toggleInformationPin={{toggleInformationPin}}
            setInformationPinMutation={{setInformationPinMutation}}
          />
          <ProductionLogTable
            isMobile={{isMobile}}
            logSearch={{logSearch}}
            setLogSearch={{setLogSearch}}
            filteredLog={{filteredLog}}
            data={{data}}
            getTimeKey={{getTimeKey}}
            viscosityByTime={{viscosityByTime}}
            isAnomalyRow={{isAnomalyRow}}
            selectedTime={{selectedTime}}
            setEditEntry={{setEditEntry}}
            handleProductionLogReprint={{handleProductionLogReprint}}
            printingLogSubmissionId={{printingLogSubmissionId}}
            formTemplates={{formTemplates}}
            line90Equipment={{line90Equipment}}
            setFormExec={{setFormExec}}
          />
        </>
      )}}
      <ProductionDashboardModals
        showAddEvent={{showAddEvent}}
        setShowAddEvent={{setShowAddEvent}}
        newEvent={{newEvent}}
        setNewEvent={{setNewEvent}}
        createEventMutation={{createEventMutation}}
        fromStr={{fromStr}}
        editEntry={{editEntry}}
        setEditEntry={{setEditEntry}}
        updateSubmissionMutation={{updateSubmissionMutation}}
        invalidateDashboard={{invalidateDashboard}}
        editBigBag={{editBigBag}}
        setEditBigBag={{setEditBigBag}}
        formExec={{formExec}}
        setFormExec={{setFormExec}}
        queryClient={{queryClient}}
        deleteConfirm={{deleteConfirm}}
        setDeleteConfirm={{setDeleteConfirm}}
        deleteSubmissionMutation={{deleteSubmissionMutation}}
      />
    </div>
  );
}}
'''
    # Replace from line 937 "// Render" through end of function
    logic_lines = logic.splitlines(keepends=True)
    cut = 0
    for i, line in enumerate(logic_lines):
        if "// Render" in line:
            cut = i
            break
    final = "".join(logic_lines[:cut]) + render
    write_text(feat / "ProductionDashboardPageMain.jsx", final)
    shell(src, "../features/production/dashboard/ProductionDashboardPageMain")


def split_causal() -> None:
    src = PAGES / "CausalEnginePage.js"
    feat = SRC / "features" / "causal-engine"
    raw = read_text(src)
    main = bump_imports(raw)

    sidebar = extract_block(raw, 803, 882)
    toolbar = extract_block(raw, 899, 912)
    overview = extract_block(raw, 915, 1300)
    timeline = extract_block(raw, 1302, 1355)
    failures = extract_block(raw, 1357, 1401)
    causes = extract_block(raw, 1403, 1422)
    actions = extract_block(raw, 1424, 1796)
    dialogs = extract_block(raw, 1798, 2290)
    back_btn = extract_block(raw, 795, 801)

    write_text(feat / "InvestigationSidebar.jsx", wrap_component("InvestigationSidebar", sidebar))
    write_text(feat / "InvestigationToolbar.jsx", wrap_component("InvestigationToolbar", toolbar))
    write_text(feat / "InvestigationOverviewTab.jsx", wrap_component("InvestigationOverviewTab", overview))
    write_text(feat / "InvestigationTimelineTab.jsx", wrap_component("InvestigationTimelineTab", timeline))
    write_text(feat / "InvestigationFailuresTab.jsx", wrap_component("InvestigationFailuresTab", failures))
    write_text(feat / "InvestigationCausesTab.jsx", wrap_component("InvestigationCausesTab", causes))
    write_text(feat / "InvestigationActionsTab.jsx", wrap_component("InvestigationActionsTab", actions))
    write_text(feat / "CausalEngineDialogs.jsx", wrap_component("CausalEngineDialogs", dialogs))

    lines = main.splitlines(keepends=True)
    logic = "".join(lines[:783])
    extra = (
        'import { InvestigationSidebar } from "./InvestigationSidebar";\n'
        'import { InvestigationToolbar } from "./InvestigationToolbar";\n'
        'import { InvestigationOverviewTab } from "./InvestigationOverviewTab";\n'
        'import { InvestigationTimelineTab } from "./InvestigationTimelineTab";\n'
        'import { InvestigationFailuresTab } from "./InvestigationFailuresTab";\n'
        'import { InvestigationCausesTab } from "./InvestigationCausesTab";\n'
        'import { InvestigationActionsTab } from "./InvestigationActionsTab";\n'
        'import { CausalEngineDialogs } from "./CausalEngineDialogs";\n'
    )
    idx = main.rindex("InvestigationDialogs")
    line_end = main.index("\n", idx) + 1
    main = main[:line_end] + extra + main[line_end:]

    render = f'''  if (isMobile) {{
    return <DesktopOnlyMessage title="Causal Engine" description="The Causal Engine is optimized for desktop use. Please access it from a larger screen." />;
  }}

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50" data-testid="causal-engine-page">
{back_btn}      <InvestigationSidebar
        filteredInvestigations={{filteredInvestigations}}
        loadingInvestigations={{loadingInvestigations}}
        selectedInvId={{selectedInvId}}
        setSelectedInvId={{setSelectedInvId}}
        searchQuery={{searchQuery}}
        setSearchQuery={{setSearchQuery}}
        setShowNewInvDialog={{setShowNewInvDialog}}
        t={{t}}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {{investigation ? (
          <>
            <InvestigationToolbar activeTab={{activeTab}} setActiveTab={{setActiveTab}} stats={{stats}} t={{t}} />
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {{activeTab === "overview" && (
                <InvestigationOverviewTab
                  investigation={{investigation}}
                  investigationData={{investigationData}}
                  isInvestigationLocked={{isInvestigationLocked}}
                  isEditingInvestigation={{isEditingInvestigation}}
                  setIsEditingInvestigation={{setIsEditingInvestigation}}
                  editInvForm={{editInvForm}}
                  setEditInvForm={{setEditInvForm}}
                  localNotes={{localNotes}}
                  setLocalNotes={{setLocalNotes}}
                  stats={{stats}}
                  sortedTimelineEvents={{sortedTimelineEvents}}
                  failureIdentifications={{failureIdentifications}}
                  causeNodes={{causeNodes}}
                  actionItems={{actionItems}}
                  evidenceItems={{evidenceItems}}
                  centralActions={{centralActions}}
                  translateAssetName={{translateAssetName}}
                  t={{t}}
                  user={{user}}
                  setShowEventDialog={{setShowEventDialog}}
                  setShowFailureDialog={{setShowFailureDialog}}
                  setShowCauseDialog={{setShowCauseDialog}}
                  setShowActionDialog={{setShowActionDialog}}
                  setShowCompleteConfirm={{setShowCompleteConfirm}}
                  setShowAISummaryDialog={{setShowAISummaryDialog}}
                  setShowAIProblemCheck={{setShowAIProblemCheck}}
                  isGeneratingReport={{isGeneratingReport}}
                  isGeneratingAISummary={{isGeneratingAISummary}}
                  fileInputRef={{fileInputRef}}
                  isUploading={{isUploading}}
                  API_BASE_URL={{API_BASE_URL}}
                />
              )}}
              {{activeTab === "timeline" && (
                <InvestigationTimelineTab
                  sortedTimelineEvents={{sortedTimelineEvents}}
                  isInvestigationLocked={{isInvestigationLocked}}
                  setEditingItem={{setEditingItem}}
                  setEventForm={{setEventForm}}
                  setShowEventDialog={{setShowEventDialog}}
                  deleteTimelineEventMutation={{deleteTimelineEventMutation}}
                  translateAssetName={{translateAssetName}}
                  t={{t}}
                />
              )}}
              {{activeTab === "failures" && (
                <InvestigationFailuresTab
                  failureIdentifications={{failureIdentifications}}
                  isInvestigationLocked={{isInvestigationLocked}}
                  setEditingItem={{setEditingItem}}
                  setFailureForm={{setFailureForm}}
                  setShowFailureDialog={{setShowFailureDialog}}
                  deleteFailureMutation={{deleteFailureMutation}}
                  translateAssetName={{translateAssetName}}
                  t={{t}}
                />
              )}}
              {{activeTab === "causes" && (
                <InvestigationCausesTab
                  causeNodes={{causeNodes}}
                  isInvestigationLocked={{isInvestigationLocked}}
                  setEditingItem={{setEditingItem}}
                  setCauseForm={{setCauseForm}}
                  setShowCauseDialog={{setShowCauseDialog}}
                  deleteCauseMutation={{deleteCauseMutation}}
                  t={{t}}
                />
              )}}
              {{activeTab === "actions" && (
                <InvestigationActionsTab
                  actionItems={{actionItems}}
                  centralActions={{centralActions}}
                  isInvestigationLocked={{isInvestigationLocked}}
                  setEditingItem={{setEditingItem}}
                  setActionForm={{setActionForm}}
                  setShowActionDialog={{setShowActionDialog}}
                  setActionToValidate={{setActionToValidate}}
                  setShowValidateDialog={{setShowValidateDialog}}
                  setEditingAction={{setEditingAction}}
                  setEditActionForm={{setEditActionForm}}
                  setShowEditActionDialog={{setShowEditActionDialog}}
                  deleteActionMutation={{deleteActionMutation}}
                  unlinkCentralActionMutation={{unlinkCentralActionMutation}}
                  t={{t}}
                  user={{user}}
                />
              )}}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <p>Select an investigation to view details</p>
          </div>
        )}}
      </div>
      <CausalEngineDialogs
        showNewInvDialog={{showNewInvDialog}}
        setShowNewInvDialog={{setShowNewInvDialog}}
        newInvForm={{newInvForm}}
        setNewInvForm={{setNewInvForm}}
        createInvMutation={{createInvMutation}}
        showEventDialog={{showEventDialog}}
        setShowEventDialog={{setShowEventDialog}}
        eventForm={{eventForm}}
        setEventForm={{setEventForm}}
        editingItem={{editingItem}}
        createEventMutation={{createEventMutation}}
        updateEventMutation={{updateEventMutation}}
        showFailureDialog={{showFailureDialog}}
        setShowFailureDialog={{setShowFailureDialog}}
        failureForm={{failureForm}}
        setFailureForm={{setFailureForm}}
        createFailureMutation={{createFailureMutation}}
        updateFailureMutation={{updateFailureMutation}}
        showCauseDialog={{showCauseDialog}}
        setShowCauseDialog={{setShowCauseDialog}}
        causeForm={{causeForm}}
        setCauseForm={{setCauseForm}}
        createCauseMutation={{createCauseMutation}}
        updateCauseMutation={{updateCauseMutation}}
        showActionDialog={{showActionDialog}}
        setShowActionDialog={{setShowActionDialog}}
        actionForm={{actionForm}}
        setActionForm={{setActionForm}}
        createActionMutation={{createActionMutation}}
        updateActionMutation={{updateActionMutation}}
        causeNodes={{causeNodes}}
        users={{users}}
        equipmentNodes={{equipmentNodes}}
        failureModesList={{failureModesList}}
        showCompleteConfirm={{showCompleteConfirm}}
        setShowCompleteConfirm={{setShowCompleteConfirm}}
        completeInvestigationMutation={{completeInvestigationMutation}}
        showValidateDialog={{showValidateDialog}}
        setShowValidateDialog={{setShowValidateDialog}}
        actionToValidate={{actionToValidate}}
        validatorName={{validatorName}}
        setValidatorName={{setValidatorName}}
        validatorPosition={{validatorPosition}}
        setValidatorPosition={{setValidatorPosition}}
        validateActionMutation={{validateActionMutation}}
        showAISummaryDialog={{showAISummaryDialog}}
        setShowAISummaryDialog={{setShowAISummaryDialog}}
        aiSummary={{aiSummary}}
        closureSuggestion={{closureSuggestion}}
        setClosureSuggestion={{setClosureSuggestion}}
        showEditActionDialog={{showEditActionDialog}}
        setShowEditActionDialog={{setShowEditActionDialog}}
        editingAction={{editingAction}}
        editActionForm={{editActionForm}}
        setEditActionForm={{setEditActionForm}}
        updateCentralActionMutation={{updateCentralActionMutation}}
        showAIProblemCheck={{showAIProblemCheck}}
        setShowAIProblemCheck={{setShowAIProblemCheck}}
        investigation={{investigation}}
        investigationData={{investigationData}}
        deleteInvOptions={{deleteInvOptions}}
        setDeleteInvOptions={{setDeleteInvOptions}}
        deleteInvMutation={{deleteInvMutation}}
        selectedInvId={{selectedInvId}}
        setSelectedInvId={{setSelectedInvId}}
        t={{t}}
      />
    </div>
  );
}}
'''
    logic_lines = main.splitlines(keepends=True)
    cut = 0
    for i, line in enumerate(logic_lines):
        if "if (isMobile)" in line and "DesktopOnlyMessage" in "".join(logic_lines[i:i+3]):
            cut = i
            break
    if cut == 0:
        for i, line in enumerate(logic_lines):
            if line.strip().startswith("return (") and "causal-engine" in "".join(logic_lines[i:i+5]):
                cut = i
                break
    final = "".join(logic_lines[:cut]) + render
    write_text(feat / "CausalEnginePageMain.jsx", final)
    shell(src, "../features/causal-engine/CausalEnginePageMain")


def split_forms() -> None:
    src = PAGES / "FormsPage.js"
    feat = SRC / "features" / "forms"
    raw = read_text(src)
    raw = re.sub(r"import \{ getBackendUrl \} from [\"'][^\"']+[\"'];\n", "", raw)
    raw = re.sub(r"// Get base URL without /api suffix\nconst API_BASE_URL = getBackendUrl\(\);\n\n", "", raw)
    main = bump_imports(raw).replace(
        "const FormsPage = ({ embedded = false }) => {",
        "export default function FormsPage({ embedded = false }) {",
    ).replace("export default FormsPage;\n", "")

    header = extract_block(raw, 371, 473)
    templates_tab = extract_block(raw, 514, 567)
    submissions_tab = extract_block(raw, 569, 616)
    template_editor = extract_block(raw, 618, 1189)
    field_editor = extract_block(raw, 1191, 1649)
    delete_dialog = extract_block(raw, 1651, 1673)
    view_dialog = extract_block(raw, 1675, 2258)

    write_text(feat / "FormsPageHeader.jsx", wrap_component("FormsPageHeader", header))
    write_text(feat / "FormsTemplatesTab.jsx", wrap_component("FormsTemplatesTab", templates_tab))
    write_text(feat / "FormsSubmissionsTab.jsx", wrap_component("FormsSubmissionsTab", submissions_tab))
    write_text(feat / "FormsTemplateEditorDialog.jsx", wrap_component("FormsTemplateEditorDialog", template_editor))
    write_text(feat / "FormsFieldEditorDialog.jsx", wrap_component("FormsFieldEditorDialog", field_editor))
    write_text(feat / "FormsDeleteConfirmDialog.jsx", wrap_component("FormsDeleteConfirmDialog", delete_dialog))
    write_text(feat / "FormsViewTemplateDialog.jsx", wrap_component("FormsViewTemplateDialog", view_dialog))

    # Keep full main for forms — extracted files are reference modules; main stays intact for safety
    write_text(feat / "FormsPageMain.jsx", main)
    shell(src, "../features/forms/FormsPageMain")


def split_dashboard() -> None:
    src = PAGES / "DashboardPage.js"
    feat = SRC / "features" / "dashboard"
    raw = read_text(src)

    helpers = extract_block(raw, 67, 508)
    helper_imports = bump_imports(extract_block(raw, 1, 66))
    write_text(
        feat / "dashboardWidgets.jsx",
        helper_imports
        + helpers
        + "\nexport {\n  AuthenticatedLightbox,\n  ImageWithFallback,\n  UserAvatar,\n  MiniBarChart,\n  StatCard,\n  ProgressCard,\n  DistributionCard,\n  RecentItemCard,\n};\n",
    )

    main = bump_imports(raw)
    main = main.replace(extract_block(raw, 67, 508), "")
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
    widget_import = (
        'import {\n  AuthenticatedLightbox,\n  ImageWithFallback,\n  UserAvatar,\n  MiniBarChart,\n  StatCard,\n  ProgressCard,\n  DistributionCard,\n  RecentItemCard,\n} from "./dashboardWidgets";\n'
    )
    idx = main.index("import { DISCIPLINES }")
    line_end = main.index("\n", idx) + 1
    main = main[:line_end] + widget_import + main[line_end:]

    tab_header = extract_block(raw, 847, 1037)
    operational = extract_block(raw, 1043, 1468)
    quick_view = extract_block(raw, 1516, 2040)
    write_text(feat / "DashboardTabHeader.jsx", wrap_component("DashboardTabHeader", tab_header))
    write_text(feat / "OperationalDashboardTab.jsx", wrap_component("OperationalDashboardTab", operational))
    write_text(feat / "DashboardQuickViewModal.jsx", wrap_component("DashboardQuickViewModal", quick_view))

    write_text(feat / "DashboardPageMain.jsx", main)
    shell(src, "../features/dashboard/DashboardPageMain")


def split_user_mgmt() -> None:
    src = PAGES / "SettingsUserManagementPage.js"
    feat = SRC / "features" / "user-management"
    raw = read_text(src)
    raw = re.sub(
        r"import \{ getBackendUrl, getAuthHeaders \} from ['\"][^'\"]+['\"];\n",
        "",
        raw,
    )
    main = bump_imports(raw).replace(
        "const SettingsUserManagementPage = () => {",
        "export default function SettingsUserManagementPage() {",
    ).replace("export default SettingsUserManagementPage;\n", "")
    main = main.replace(
        'import SettingsPermissionsPage from "./SettingsPermissionsPage";',
        'import SettingsPermissionsPage from "../../pages/SettingsPermissionsPage";',
    )

    shared = extract_block(raw, 80, 125)
    write_text(
        feat / "userManagementShared.jsx",
        bump_imports(
            'import React from "react";\n'
            'import { Crown, Shield, ShieldCheck, ShieldAlert, Eye, Wrench, Settings } from "lucide-react";\n'
            'import { Avatar, AvatarImage, AvatarFallback } from "../../components/ui/avatar";\n\n'
        )
        + shared
        + "\nexport { roleIcons, roleColors, UserAvatar };\n",
    )

    mobile = extract_block(raw, 530, 1116)
    desktop = extract_block(raw, 1118, 2043)
    write_text(feat / "UserManagementMobileView.jsx", wrap_component("UserManagementMobileView", mobile))
    write_text(feat / "UserManagementDesktopView.jsx", wrap_component("UserManagementDesktopView", desktop))

    write_text(feat / "SettingsUserManagementPageMain.jsx", main)
    shell(src, "../features/user-management/SettingsUserManagementPageMain")


if __name__ == "__main__":
    split_production()
    split_causal()
    split_forms()
    split_dashboard()
    split_user_mgmt()
    print("Split complete.")
