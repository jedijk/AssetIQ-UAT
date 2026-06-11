import React from "react";
import { Plus, Pencil, Trash2, MessageCircle, Pin, PinOff } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import {
  WasteReportingPanel,
  PRODUCTION_DASH_ACTION_EDIT,
  PRODUCTION_DASH_ACTION_DELETE,
  PRODUCTION_DASH_INFO_ACTION_BTN,
  PRODUCTION_DASH_INFO_ACTION_EDIT,
  PRODUCTION_DASH_INFO_ACTION_DELETE,
  PRODUCTION_TILE_SCROLL_CLASS,
  PRODUCTION_TILE_SCROLL_CLASS_SM,
} from "./productionDashboardShared";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import {
  Tooltip as RadixTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "../../../components/ui/tooltip";
import { formatDateTimeCompact } from "../../../lib/dateUtils";
import { toast } from "sonner";
export function ProductionShiftPanels({
  data, isMobile, formTemplates, line90Equipment, setFormExec, setDeleteConfirm,
  wasteWeightThresholdKg, expandedEosNotes, setExpandedEosNotes, editBigBag, setEditBigBag,
  sortedInformationEntries, toggleInformationPin, setInformationPinMutation
}) {
  return (
    <>
          {/* ── End of Shift, Waste, Input Material, Information ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            {/* End of Shift Details */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="end-of-shift-panel">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">End of Shift Details</h3>
                <div className="flex items-center gap-2">
                  {data?.end_of_shift_entries?.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{data.end_of_shift_entries.length}</Badge>
                  )}
                  {!isMobile && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        if (formTemplates?.endOfShift) {
                          setFormExec({
                            templateId: formTemplates.endOfShift.id,
                            templateName: "End of Shift",
                            equipmentId: line90Equipment?.id,
                          });
                        } else {
                          toast.error("End of shift template not found");
                        }
                      }}
                      data-testid="end-of-shift-add-btn"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </Button>
                  )}
                </div>
              </div>
              <div className={PRODUCTION_TILE_SCROLL_CLASS}>
                {data?.end_of_shift_entries?.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-2 font-semibold text-slate-700 tracking-wide text-[11px]">Date & Time</th>
                        <th className="text-right py-2 px-1 font-medium text-slate-500 uppercase tracking-wider text-[10px]">Input (kg)</th>
                        <th className="w-14 p-0" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.end_of_shift_entries.map((eos, i) => {
                        const raw = eos.date_time_raw || eos.datetime;
                        const displayDT = raw ? formatDateTimeCompact(raw) : "";
                        const hasNotes = eos.notes && eos.notes.trim().length > 0;
                        const isExpanded = expandedEosNotes === (eos.submission_id || i);
                        return (
                          <React.Fragment key={eos.submission_id || i}>
                            <TooltipProvider delayDuration={200}>
                              <RadixTooltip>
                                <TooltipTrigger asChild>
                                  <tr 
                                    className={`border-b border-slate-50 hover:bg-slate-50 group cursor-default ${hasNotes ? "bg-amber-50/30" : ""} ${isExpanded ? "bg-amber-100/50" : ""}`} 
                                    data-testid={`eos-row-${i}`}
                                    onClick={() => {
                                      // Toggle notes expansion on mobile (click)
                                      if (hasNotes) {
                                        setExpandedEosNotes(isExpanded ? null : (eos.submission_id || i));
                                      }
                                    }}
                                  >
                                    <td className="py-1.5 px-1 text-slate-700 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5">
                                        {displayDT || "—"}
                                        {hasNotes && (
                                          <MessageCircle className={`w-3 h-3 flex-shrink-0 ${isExpanded ? "text-amber-600" : "text-amber-500"}`} />
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-1 text-right tabular-nums text-slate-700">{Number(eos.total_input || 0).toLocaleString()}</td>
                                    <td className="py-1.5 px-2 align-top">
                                      <div className="flex items-center gap-0.5">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (formTemplates?.endOfShift && eos.submission_id) {
                                              setFormExec({
                                                templateId: formTemplates.endOfShift.id,
                                                templateName: "End of Shift",
                                                equipmentId: line90Equipment?.id,
                                                submissionId: eos.submission_id,
                                                initialValues: {
                                                  "date_&_time": eos.date_time_raw || "",
                                                  "total_input": eos.total_input ?? "",
                                                },
                                              });
                                            }
                                          }}
                                          className={PRODUCTION_DASH_ACTION_EDIT}
                                          title="Edit"
                                          data-testid={`edit-eos-${i}`}
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (eos.submission_id) {
                                              setDeleteConfirm({ ids: [eos.submission_id], label: `end of shift entry (${displayDT || "item"})` });
                                            }
                                          }}
                                          className={PRODUCTION_DASH_ACTION_DELETE}
                                          title="Delete"
                                          data-testid={`delete-eos-${i}`}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                </TooltipTrigger>
                                {/* Desktop hover tooltip */}
                                {hasNotes && (
                                  <TooltipContent side="top" className="max-w-xs bg-slate-800 text-white px-3 py-2 rounded-lg shadow-lg hidden sm:block">
                                    <div className="text-xs">
                                      <span className="font-semibold text-amber-300">Completion Comments:</span>
                                      <p className="mt-1 whitespace-pre-wrap">{eos.notes}</p>
                                    </div>
                                  </TooltipContent>
                                )}
                              </RadixTooltip>
                            </TooltipProvider>
                            {/* Mobile expanded notes row */}
                            {hasNotes && isExpanded && (
                              <tr className="bg-amber-50 border-b border-amber-100">
                                <td colSpan={3} className="px-2 py-2">
                                  <div className="text-xs">
                                    <span className="font-semibold text-amber-700">Completion Comments:</span>
                                    <p className="mt-1 text-slate-600 whitespace-pre-wrap">{eos.notes}</p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-slate-400 py-8 text-center">No end of shift data</p>
                )}
              </div>
            </div>

            <WasteReportingPanel
              entries={data?.waste_reporting_entries}
              thresholdKg={wasteWeightThresholdKg}
              isMobile={isMobile}
              formTemplates={formTemplates}
              line90Equipment={line90Equipment}
              setFormExec={setFormExec}
              setDeleteConfirm={setDeleteConfirm}
            />

            {/* Input Material / Big Bag Loading */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="big-bag-panel">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Input Material</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Line-90 — big bag loading</p>
                </div>
                <div className="flex items-center gap-2">
                  {data?.big_bag_entries?.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{data.big_bag_entries.length}</Badge>
                  )}
                  {/* Hide Add button on mobile (view only) */}
                  {!isMobile && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" data-testid="big-bag-add-btn">
                          <Plus className="w-3 h-3" /> Add
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          if (formTemplates?.bigBag) setFormExec({ templateId: formTemplates.bigBag.id, templateName: "Big Bag Loading", equipmentId: line90Equipment?.id });
                          else toast.error("Big Bag Loading template not found");
                        }} data-testid="add-bigbag-option">
                          Big Bag Loading
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <div className={PRODUCTION_TILE_SCROLL_CLASS_SM}>
                {data?.big_bag_entries?.length > 0 ? (
                  isMobile ? (
                    /* Mobile Card View for Big Bag */
                    <div className="space-y-2">
                      {data.big_bag_entries.map((bag, i) => (
                        <div key={bag.submission_id || i} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                          <div className="font-medium text-slate-900">{bag.material || "—"}</div>
                          <div className="flex flex-wrap gap-x-3 text-slate-600 mt-1">
                            <span className="text-slate-500">{bag.equipment_name || "Line-90"}</span>
                            <span>Supplier: {bag.supplier || "—"}</span>
                            <span>Bag: {bag.bag_no || "—"}</span>
                            <span>Lot: {bag.lot_no || "—"}</span>
                            <span>Prod. Date: {bag.production_date || "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Desktop Table View for Big Bag */
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-2 font-semibold text-slate-700 tracking-wide text-[11px]">Material</th>
                          <th className="text-left py-2 px-1 font-medium text-slate-500 uppercase tracking-wider text-[10px]">Supplier</th>
                          <th className="text-left py-2 px-1 font-medium text-slate-500 uppercase tracking-wider text-[10px]">Bag No.</th>
                          <th className="text-left py-2 px-1 font-medium text-slate-500 uppercase tracking-wider text-[10px]">Lot No.</th>
                          <th className="text-left py-2 px-1 font-medium text-slate-500 uppercase tracking-wider text-[10px]">Prod. Date</th>
                          <th className="text-left py-2 px-1 font-medium text-slate-500 uppercase tracking-wider text-[10px]">Equipment</th>
                          <th className="w-14 p-0" aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.big_bag_entries.map((bag, i) => (
                          <tr key={bag.submission_id || i} className="border-b border-slate-50 hover:bg-slate-50 group">
                            <td className="py-1.5 px-1 text-slate-700">{bag.material}</td>
                            <td className="py-1.5 px-1 text-slate-700">{bag.supplier}</td>
                            <td className="py-1.5 px-1 text-slate-700 tabular-nums">{bag.bag_no}</td>
                            <td className="py-1.5 px-1 text-slate-700">{bag.lot_no}</td>
                            <td className="py-1.5 px-1 text-slate-700 tabular-nums">{bag.production_date || ""}</td>
                            <td className="py-1.5 px-1 text-slate-600 text-[11px]">{bag.equipment_name || "Line-90"}</td>
                            <td className="py-1.5 px-2 align-middle">
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => setEditBigBag({ ...bag, _index: i })}
                                  className={PRODUCTION_DASH_ACTION_EDIT}
                                  title="Edit"
                                  data-testid={`edit-bag-${i}`}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (bag.submission_id) {
                                      setDeleteConfirm({ ids: [bag.submission_id], label: `big bag entry (${bag.material || bag.lot_no || "item"})` });
                                    }
                                  }}
                                  className={PRODUCTION_DASH_ACTION_DELETE}
                                  title="Delete"
                                  data-testid={`delete-bag-${i}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No input material data</p>
                )}
              </div>
            </div>

            {/* Information (submitted forms) */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4" data-testid="information-panel">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Information</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Line-90 — information forms · Pinned items stay on top for everyone (saved with the entry)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {data?.information_entries?.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{data.information_entries.length}</Badge>
                  )}
                  {!isMobile && (formTemplates?.informationTemplates?.length > 0) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" data-testid="information-add-btn">
                          <Plus className="w-3 h-3" /> Add
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {formTemplates.informationTemplates.map((tpl) => (
                          <DropdownMenuItem
                            key={tpl.id}
                            onClick={() => {
                              setFormExec({
                                templateId: tpl.id,
                                templateName: tpl.name || "Information",
                                equipmentId: line90Equipment?.id,
                              });
                            }}
                            data-testid={`add-information-${tpl.id}`}
                          >
                            {tpl.name || "Information"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <div className={PRODUCTION_TILE_SCROLL_CLASS_SM}>
                {data?.information_entries?.length > 0 ? (
                  <div className="space-y-2">
                    {sortedInformationEntries.map((row, i) => (
                      <div
                        key={row.submission_id || i}
                        className={`p-2 rounded-lg border text-xs ${
                          row._informationPinned ? "bg-amber-50/50 border-amber-200 border-l-[3px] border-l-amber-400" : "bg-slate-50 border-slate-100"
                        }`}
                      >
                        <p className="text-slate-700 break-words leading-normal">
                          {row.text || "—"}
                        </p>
                        <div className="mt-1.5 border-t border-slate-200/90 pt-1.5 flex flex-row flex-wrap items-center justify-between gap-x-2 gap-y-2">
                          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="shrink-0 tabular-nums text-slate-500">
                              {(row.submitted_at || row.datetime)
                                ? formatDateTimeCompact(row.submitted_at || row.datetime)
                                : row.time || "—"}
                            </span>
                            <span className="text-slate-300 select-none" aria-hidden>
                              ·
                            </span>
                            <span className="min-w-0 text-slate-700">{row.submitted_by || "—"}</span>
                          </div>
                          <div className="flex shrink-0 items-center justify-end gap-0.5">
                            {row.submission_id && (
                              <button
                                type="button"
                                onClick={() => toggleInformationPin(row.submission_id)}
                                disabled={setInformationPinMutation.isPending}
                                className={`${PRODUCTION_DASH_INFO_ACTION_BTN} ${
                                  row._informationPinned
                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                    : "text-slate-400 hover:bg-slate-100 hover:text-amber-600"
                                }`}
                                title={row._informationPinned ? "Unpin" : "Pin to top"}
                                data-testid={`pin-information-${i}`}
                              >
                                {row._informationPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const tid = row.form_template_id || formTemplates?.informationTemplates?.[0]?.id;
                                if (!tid) {
                                  toast.error("Information template not found");
                                  return;
                                }
                                setFormExec({
                                  templateId: tid,
                                  templateName: row.form_template_name || "Information",
                                  equipmentId: line90Equipment?.id,
                                  submissionId: row.submission_id,
                                  initialValues: row.prefill && typeof row.prefill === "object" ? row.prefill : {},
                                });
                              }}
                              className={PRODUCTION_DASH_INFO_ACTION_EDIT}
                              title="Edit"
                              data-testid={`edit-information-${i}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (row.submission_id) {
                                  const snippet = (row.text || "").slice(0, 40);
                                  setDeleteConfirm({
                                    ids: [row.submission_id],
                                    label: `information entry${snippet ? ` (${snippet}${(row.text || "").length > 40 ? "…" : ""})` : ""}`,
                                  });
                                }
                              }}
                              className={PRODUCTION_DASH_INFO_ACTION_DELETE}
                              title="Delete"
                              data-testid={`delete-information-${i}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No information submitted</p>
                )}
              </div>
            </div>
          </div>
    </>
  );
}
