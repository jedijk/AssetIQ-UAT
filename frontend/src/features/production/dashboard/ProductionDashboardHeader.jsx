import React from "react";
import {
  ChevronLeft, ChevronRight, RefreshCw, Settings, Sparkles, Search, Download,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { PRODUCTION_SHIFT_OPTIONS } from "./productionDashboardShared";
export function ProductionDashboardHeader({
  isMobile, period, setPeriod, fromDate, setFromDate, toDate, setToDate,
  showCustomDate, setShowCustomDate, handlePeriod, fromStr, toStr, selectedShifts,
  toggleProductionShift, isFetching, handleManualRefresh, runPairingRepair,
  downloadPairingDebugReport, exportToExcel, displayDate, PERIOD_OPTIONS,
  prevDay, nextDay, stepPeriod, data,
}) {
  return (
    <>
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className={isMobile ? "hidden" : ""}>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900" data-testid="production-title">
            Production Overview
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track performance, monitor trends, and take action
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {/* Toolbar: <md = column (date row, then shifts); md+ = single flex row with original control order via display:contents */}
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-2">
            <div className="order-1 flex w-full min-w-0 flex-wrap items-center gap-2 md:order-none md:contents">
              {/* Period quick filters - hide entirely on mobile (forced to 1D) */}
              <div className={`inline-flex h-8 items-center rounded-lg bg-slate-100 p-0.5 gap-0.5 flex-wrap sm:flex-nowrap ${isMobile ? "hidden" : ""}`} data-testid="period-selector">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => handlePeriod(opt.key)}
                    className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      opt.key !== "1d" && isMobile ? "hidden" : ""
                    } ${
                      period === opt.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                    data-testid={`period-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
                {/* Custom date gear toggle - hide on mobile */}
                {!isMobile && (
                  <button
                    onClick={() => { setShowCustomDate(!showCustomDate); if (!showCustomDate) setPeriod("custom"); }}
                    className={`px-1.5 py-1.5 rounded-md transition-colors ${
                      showCustomDate ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    }`}
                    data-testid="custom-date-toggle"
                    title="Custom date range"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Day-mode prev/next arrows and date picker */}
              {period === "1d" && (
                <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-0 md:flex-none">
                  <div className="flex shrink-0 items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-8 sm:w-8 rounded-none touch-manipulation" onClick={prevDay} data-testid="prev-day">
                      <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-8 sm:w-8 rounded-none touch-manipulation" onClick={nextDay} data-testid="next-day">
                      <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                  {/* Mobile date picker */}
                  {isMobile && (
                    <input
                      type="date"
                      value={fromStr}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        const d = new Date(v + "T12:00:00");
                        if (!isNaN(d)) { setFromDate(d); setToDate(d); }
                      }}
                      className="h-8 min-w-0 flex-1 px-2 text-sm border border-slate-200 rounded-lg bg-white ml-1"
                      data-testid="mobile-date-picker"
                    />
                  )}
                  {/* Mobile: sync next to date selector */}
                  {isMobile && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 touch-manipulation ml-1"
                      onClick={handleManualRefresh}
                      data-testid="refresh-btn-mobile"
                      title="Refresh"
                    >
                      <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                    </Button>
                  )}
                </div>
              )}

              {/* Period navigation arrows for non-day modes */}
              {period !== "1d" && !showCustomDate && (
                <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => stepPeriod(-1)} data-testid="prev-period">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => stepPeriod(1)} data-testid="next-period">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Production shifts — multi-select (comma-separated in API); at least one active */}
            <div
              role="group"
              aria-label="Production shifts"
              className="order-3 inline-flex w-full max-w-none flex-wrap items-stretch gap-1 rounded-lg bg-slate-100 p-0.5 md:order-none md:inline-flex md:w-auto md:max-w-none md:basis-auto"
              data-testid="shift-multi-selector"
            >
              {PRODUCTION_SHIFT_OPTIONS.map((opt) => {
                const on = selectedShifts.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleProductionShift(opt.key)}
                    className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-[11px] font-semibold leading-tight transition-colors touch-manipulation sm:min-h-8 sm:flex-none sm:flex-row sm:items-center sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs ${
                      on ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"
                    }`}
                    title={`${opt.title}${on ? " — click to deselect" : " — click to include"}`}
                    data-testid={`shift-multi-${opt.key}`}
                  >
                    <span>{opt.short}</span>
                    <span className="font-normal text-[8px] text-slate-400 whitespace-nowrap sm:text-[10px]">{opt.sub}</span>
                  </button>
                );
              })}
            </div>

            {/* Desktop toolbar row: hidden on mobile (refresh lives next to date; pairing/debug omitted on small screens) */}
            <div className="order-2 hidden w-full min-w-0 md:order-none md:contents">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 touch-manipulation"
                onClick={handleManualRefresh}
                data-testid="refresh-btn"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 touch-manipulation"
                onClick={runPairingRepair}
                disabled={period !== "1d" || isFetching}
                data-testid="pairing-repair-btn"
                title="Re-run Mooney → Extruder pairing for this day"
              >
                <Sparkles className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Run pairing</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 touch-manipulation"
                onClick={downloadPairingDebugReport}
                disabled={period !== "1d" || isFetching}
                data-testid="pairing-debug-btn"
                title="Download a JSON report explaining viscosity pairing for this day"
              >
                <Search className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Debug pairing</span>
              </Button>

              {/* Date display - desktop only */}
              <span className="hidden sm:flex text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 sm:px-3 h-8 items-center tabular-nums whitespace-nowrap" data-testid="date-display">
                {fromStr === toStr ? displayDate(fromDate) : `${displayDate(fromDate)} — ${displayDate(toDate)}`}
              </span>

              {/* Export - hidden on mobile */}
              <Button variant="outline" size="sm" className="h-8 gap-1 hidden sm:flex" onClick={exportToExcel} disabled={!data} data-testid="export-btn">
                <Download className="w-3.5 h-3.5" /> <span>Export</span>
              </Button>
            </div>
          </div>

          {/* Custom date pickers (unfold below) - hidden on mobile */}
          {showCustomDate && !isMobile && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-500">From</label>
                <input
                  type="date"
                  value={fromStr}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const d = new Date(v + "T12:00:00");
                    if (!isNaN(d)) { setFromDate(d); setPeriod("custom"); }
                  }}
                  className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white"
                  data-testid="from-date"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-500">To</label>
                <input
                  type="date"
                  value={toStr}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const d = new Date(v + "T12:00:00");
                    if (!isNaN(d)) { setToDate(d); setPeriod("custom"); }
                  }}
                  className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white"
                  data-testid="to-date"
                />
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
