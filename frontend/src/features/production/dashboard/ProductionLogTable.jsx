import React from "react";
import { Plus, Search, Pencil, Printer, Loader2, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatDateOnlyCompact } from "../../../lib/dateUtils";
import {
  PRODUCTION_DASH_ACTION_EDIT,
  PRODUCTION_DASH_ACTION_DELETE,
} from "./productionDashboardShared";
export function ProductionLogTable({
  isMobile, logSearch, setLogSearch, filteredLog, data, getTimeKey, viscosityByTime,
  isAnomalyRow, selectedTime, setEditEntry, handleProductionLogReprint,
  printingLogSubmissionId, formTemplates, line90Equipment, setFormExec, setDeleteConfirm,
}) {
  return (
    <>
          {/* ── Production Log Table ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="production-log">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Production Log</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    placeholder="Search..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-8 h-8 w-32 sm:w-44 text-sm"
                    data-testid="log-search"
                  />
                </div>
                {/* Hide Add button on mobile (view only) */}
                {!isMobile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" data-testid="log-add-btn">
                        <Plus className="w-3 h-3" /> <span className="hidden xs:inline">Add</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          if (formTemplates?.extruder) setFormExec({ templateId: formTemplates.extruder.id, templateName: "Extruder Settings", equipmentId: line90Equipment?.id });
                          else toast.error("Extruder template not found");
                        }}
                        data-testid="add-extruder-option"
                      >
                        Extruder Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (formTemplates?.viscosity) setFormExec({ templateId: formTemplates.viscosity.id, templateName: "Viscosity Sample", equipmentId: line90Equipment?.id });
                          else toast.error("Viscosity template not found");
                        }}
                        data-testid="add-viscosity-option"
                      >
                        Viscosity Sample
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Mobile Card View */}
            {isMobile ? (
              <div className="space-y-2">
                {filteredLog.length > 0 ? (
                  filteredLog.map((entry, i) => {
                    const anomaly = isAnomalyRow(entry);
                    const isViscOnly = entry._viscosity_only;
                    const timeKey = getTimeKey(entry);
                    const timeLabel = timeKey || "—";
                    const viscValue = isViscOnly
                      ? entry._viscosity_value
                      : timeKey ? viscosityByTime[timeKey]?.value : undefined;
                    const viscSubId = isViscOnly
                      ? entry._viscosity_submission_id
                      : timeKey ? viscosityByTime[timeKey]?.submission_id : undefined;
                    const openEdit = () => {
                      if (isViscOnly) {
                        setEditEntry({ ...entry, _index: i, viscosity: entry._viscosity_value ?? "", _viscosity_submission_id: entry._viscosity_submission_id || "", _viscosity_only: true });
                      } else {
                        const viscData = timeKey ? viscosityByTime[timeKey] : undefined;
                        setEditEntry({ ...entry, _index: i, viscosity: viscData?.value ?? "", _viscosity_submission_id: viscData?.submission_id || "" });
                      }
                    };
                    return (
                      <div
                        key={`${timeKey || "no-time"}-${i}`}
                        className={`p-3 rounded-lg border ${isViscOnly ? "bg-blue-50/40 border-blue-100" : anomaly ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}
                        data-testid={`mobile-log-${timeKey || i}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-slate-900">{timeLabel}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs">
                              {entry.submitted_by || "—"}
                            </Badge>
                            <button
                              type="button"
                              onClick={openEdit}
                              className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-500 active:bg-slate-100"
                              data-testid={`mobile-edit-${timeKey || i}`}
                              aria-label="Edit entry"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleProductionLogReprint(entry, isViscOnly, e)}
                              disabled={
                                printingLogSubmissionId &&
                                printingLogSubmissionId === (isViscOnly ? entry._viscosity_submission_id : entry.submission_id)
                              }
                              className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 active:bg-slate-100 disabled:opacity-60"
                              data-testid={`mobile-reprint-${timeKey || i}`}
                              aria-label="Reprint label"
                              title="Reprint label"
                            >
                              {printingLogSubmissionId &&
                              printingLogSubmissionId === (isViscOnly ? entry._viscosity_submission_id : entry.submission_id) ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Printer className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                        {isViscOnly ? (
                          <button
                            type="button"
                            onClick={openEdit}
                            className="w-full text-left text-sm text-slate-600"
                            data-testid={`mobile-visc-edit-${timeKey || i}`}
                          >
                            <span className="font-medium">Viscosity:</span> {viscValue ?? "—"}
                          </button>
                        ) : (
                          <div className="text-xs">
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              <span><span className="text-slate-500">RPM:</span> <span className="font-medium">{entry.rpm}</span></span>
                              <span><span className="text-slate-500">Feed:</span> <span className="font-medium">{entry.feed}</span></span>
                              <span><span className="text-slate-500">MP4:</span> <span className="font-medium">{entry.mp4}</span></span>
                              <span><span className="text-slate-500">T Product IR:</span> <span className="font-medium">{entry.t_product_ir}</span></span>
                            </div>
                            <div className="mt-1">
                              <span className="text-slate-500">Visc:</span>{" "}
                              <button
                                type="button"
                                onClick={openEdit}
                                className="font-medium underline underline-offset-2 decoration-dotted decoration-slate-300"
                                data-testid={`mobile-visc-edit-${timeKey || i}`}
                              >
                                {viscValue ?? <span className="text-amber-500">TBD</span>}
                              </button>
                            </div>
                          </div>
                        )}
                        {entry.remarks && !isViscOnly && (
                          <p className="mt-2 text-xs text-slate-500 truncate" title={entry.remarks}>
                            {entry.remarks}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    {data?.production_log?.length === 0
                      ? "No production data for this date/shift."
                      : "No matching results"}
                  </div>
                )}
              </div>
            ) : (
              /* Desktop Table View */
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="production-log-table">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {["#", "Date", "Time", "RPM", "Feed", "M%", "Energy", "MT1", "MT2", "MT3", "MP1", "MP2", "MP3", "MP4", "CO2 Feed/P", "T Product IR", "Viscosity", "Remarks", "By", ""].map((h) => {
                        const secondary = "text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider py-2 px-2 whitespace-nowrap";
                        const primary = "text-left text-[11px] font-semibold text-slate-700 tracking-wide py-2 px-2 whitespace-nowrap";
                        const isPrimary = h === "Remarks";
                        if (h === "") {
                          return <th key="actions" className="w-14 p-0" aria-label="Actions" />;
                        }
                        return (
                          <th key={h} className={isPrimary ? primary : secondary}>
                            {h}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                <tbody>
                  {filteredLog.length > 0 ? (
                    filteredLog.map((entry, i) => {
                      const anomaly = isAnomalyRow(entry);
                      const timeKey = getTimeKey(entry);
                      const timeLabel = timeKey || "—";
                      const isHighlighted = selectedTime && timeKey && timeKey === selectedTime;
                      const isViscOnly = entry._viscosity_only;
                      const viscValue = isViscOnly
                        ? entry._viscosity_value
                        : timeKey ? viscosityByTime[timeKey]?.value : undefined;
                      const viscSubId = isViscOnly
                        ? entry._viscosity_submission_id
                        : timeKey ? viscosityByTime[timeKey]?.submission_id : undefined;
                      const tbdCell = <span className="text-slate-300">—</span>;
                      return (
                        <tr
                          key={`${timeKey || "no-time"}-${i}`}
                          className={`border-b border-slate-50 transition-colors ${isHighlighted ? "bg-purple-50 ring-1 ring-purple-300" : isViscOnly ? "bg-blue-50/40" : anomaly ? "bg-amber-50" : "hover:bg-slate-50"}`}
                          data-testid={`log-row-${timeKey || i}`}
                          ref={isHighlighted ? (el) => el?.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined}
                        >
                          <td className="py-2 px-2 text-slate-400 text-xs tabular-nums">{i + 1}</td>
                          <td className="py-2 px-2 text-slate-500 text-xs tabular-nums whitespace-nowrap">{entry.datetime ? formatDateOnlyCompact(entry.datetime) : ''}</td>
                          <td className="py-2 px-2 font-medium text-slate-700 tabular-nums">{timeLabel}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.rpm}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.feed}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.moisture}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.energy}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mt1}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mt2}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mt3}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mp1}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mp2}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mp3}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.mp4}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.co2_feed_p}</td>
                          <td className="py-2 px-2 tabular-nums">{isViscOnly ? tbdCell : entry.t_product_ir}</td>
                          <td className="py-2 px-2 tabular-nums">{viscValue !== undefined ? viscValue : <span className="text-amber-500 font-medium">TBD</span>}</td>
                          <td className="py-2 px-2 text-slate-500 text-xs truncate max-w-[120px]" title={entry.remarks || ""}>{isViscOnly ? "" : entry.remarks || ""}</td>
                          <td className="py-2 px-2 text-slate-500 text-xs truncate max-w-[80px]">{entry.submitted_by}</td>
                          <td className="py-1.5 px-2 flex items-center gap-0.5">
                            <button
                              onClick={() => {
                                if (isViscOnly) {
                                  setEditEntry({ ...entry, _index: i, viscosity: entry._viscosity_value ?? "", _viscosity_submission_id: entry._viscosity_submission_id || "", _viscosity_only: true });
                                } else {
                                  const viscData = timeKey ? viscosityByTime[timeKey] : undefined;
                                  setEditEntry({ ...entry, _index: i, viscosity: viscData?.value ?? "", _viscosity_submission_id: viscData?.submission_id || "" });
                                }
                              }}
                              className={PRODUCTION_DASH_ACTION_EDIT}
                              data-testid={`edit-row-${timeKey || i}`}
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleProductionLogReprint(entry, isViscOnly, e)}
                              disabled={
                                !!printingLogSubmissionId &&
                                printingLogSubmissionId === (isViscOnly ? entry._viscosity_submission_id : entry.submission_id)
                              }
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-60"
                              data-testid={`reprint-row-${timeKey || i}`}
                              title="Reprint label"
                            >
                              {printingLogSubmissionId &&
                              printingLogSubmissionId === (isViscOnly ? entry._viscosity_submission_id : entry.submission_id) ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Printer className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                if (isViscOnly) {
                                  setDeleteConfirm({ ids: [entry._viscosity_submission_id].filter(Boolean), label: `viscosity sample at ${timeLabel}` });
                                } else {
                                  const ids = [entry.submission_id, timeKey ? viscosityByTime[timeKey]?.submission_id : undefined].filter(Boolean);
                                  setDeleteConfirm({ ids, label: `log entry at ${timeLabel}` });
                                }
                              }}
                              className={PRODUCTION_DASH_ACTION_DELETE}
                              data-testid={`delete-row-${timeKey || i}`}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={19} className="py-8 text-center text-slate-400 text-sm">
                        {data?.production_log?.length === 0
                          ? "No production data for this date/shift. Submit Extruder settings samples to see data here."
                          : "No matching results"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            )}

            {filteredLog.length > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{filteredLog.length} entries</span>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Screen changes: {data?.screen_changes?.length || 0}</span>
                    <span className="text-slate-300">|</span>
                    <span>Magnet cleanings: {data?.magnet_cleanings?.length || 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-amber-50 border border-amber-200" /><span className="text-slate-500">Viscosity anomaly (&gt;4 MU from avg)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-purple-50 border border-purple-300" /><span className="text-slate-500">Selected point</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-blue-50 border border-blue-100" /><span className="text-slate-500">Viscosity-only sample</span></div>
                </div>
              </div>
            )}
          </div>
    </>
  );
}
