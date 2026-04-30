import { useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { AlertTriangle, BarChart3, Calendar, Info, Loader2, TrendingUp } from "lucide-react";

import { granulometryAPI } from "../lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { Switch } from "../components/ui/switch";
import { Skeleton } from "../components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";

function fmtPct(v) {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

// Match Production Report tooltip style
const fmt1 = (v) => (typeof v === "number" ? v.toFixed(1) : v);

function ReportChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-medium text-slate-800">{fmt1(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function CompactLegend({ payload }) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-slate-600 leading-tight px-1">
      {payload.map((e) => (
        <div key={e.dataKey} className="flex items-center gap-1.5 max-w-[220px]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
          <span className="truncate" title={e.value}>
            {e.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function normalizeSieveRows(rows) {
  const cleaned = (rows || [])
    .map((r) => ({
      sieveSize: Number(r.sieveSize),
      weight: Number(r.weight),
    }))
    .filter((r) => Number.isFinite(r.sieveSize) && Number.isFinite(r.weight) && r.sieveSize > 0 && r.weight >= 0)
    .sort((a, b) => a.sieveSize - b.sieveSize);
  return cleaned;
}

function computePercentPassingFromWeights(sieves) {
  const rows = normalizeSieveRows(sieves);
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (!total) return rows.map((r) => ({ sieveSize: r.sieveSize, percentPassing: 0 }));
  let cum = 0;
  return rows.map((r) => {
    cum += r.weight;
    const pct = Math.max(0, Math.min(100, 100 * (1 - cum / total)));
    return { sieveSize: r.sieveSize, percentPassing: Math.round(pct * 100) / 100 };
  });
}

function palette(i) {
  const colors = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#64748b"];
  return colors[i % colors.length];
}

function zscore(x, mean, sd) {
  if (!Number.isFinite(x) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) return 0;
  return (x - mean) / sd;
}

function buildInsights({ sieveSizes, bagKeys, tableValues, avgBySize }) {
  // Outliers: use mean absolute deviation from avg curve, then z-score across bags.
  const bagDevs = bagKeys
    .map((b) => {
      const devs = sieveSizes
        .map((s) => {
          const v = tableValues.get(`${b}::${s}`);
          const avg = avgBySize.get(s);
          if (!Number.isFinite(v) || !Number.isFinite(avg)) return null;
          return Math.abs(v - avg);
        })
        .filter((x) => x !== null);
      const mad = devs.length ? devs.reduce((a, c) => a + c, 0) / devs.length : 0;
      return { bag: b, mad };
    })
    .filter((x) => x.bag);

  const mean = bagDevs.length ? bagDevs.reduce((a, c) => a + c.mad, 0) / bagDevs.length : 0;
  const sd =
    bagDevs.length > 1
      ? Math.sqrt(bagDevs.reduce((a, c) => a + (c.mad - mean) ** 2, 0) / (bagDevs.length - 1))
      : 0;

  const outliers = bagDevs
    .map((x) => ({ ...x, z: zscore(x.mad, mean, sd) }))
    .filter((x) => Math.abs(x.z) >= 2)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 5);

  // Trend/quality checks: non-monotonic average curve (should generally be non-decreasing with increasing sieve size).
  const avgCurve = sieveSizes.map((s) => ({ s, v: avgBySize.get(s) }));
  let nonMono = 0;
  for (let i = 1; i < avgCurve.length; i++) {
    const prev = avgCurve[i - 1]?.v;
    const cur = avgCurve[i]?.v;
    if (Number.isFinite(prev) && Number.isFinite(cur) && cur + 0.25 < prev) nonMono += 1;
  }

  const insights = [];
  if (outliers.length) {
    insights.push(
      `Outliers detected: ${outliers
        .map((o) => `${o.bag} (z=${o.z.toFixed(1)})`)
        .join(", ")}`
    );
  } else {
    insights.push("No strong outliers detected across bags (z-score ≥ 2).");
  }

  if (nonMono > 0) insights.push(`Average curve shows ${nonMono} non-monotonic step(s) (possible entry/scale issue).`);
  else insights.push("Average curve looks monotonic (good).");

  return insights;
}

export default function GranulometryPage({ embedded = false } = {}) {
  const isLab = embedded;
  const tableScrollRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(today);
  const [selectedBags, setSelectedBags] = useState([]);

  const [showIndividual, setShowIndividual] = useState(true);
  const [showAverage, setShowAverage] = useState(true);
  const [tableMode, setTableMode] = useState("weight"); // "weight" | "percent"

  const fmtDmy = (iso) => {
    const s = String(iso || "").slice(0, 10);
    if (!s || s.length !== 10) return "";
    const [y, m, d] = s.split("-");
    if (!y || !m || !d) return "";
    return `${d}.${m}.${y}`;
  };

  const bigBagsQuery = useQuery({
    queryKey: ["granulometry", "form-big-bags", { fromDate, toDate }],
    queryFn: () => granulometryAPI.listFormBigBags({ fromDate, toDate }),
    staleTime: 60_000,
  });

  const recordsQuery = useInfiniteQuery({
    queryKey: ["granulometry", "form-records", { fromDate, toDate, selectedBags }],
    queryFn: ({ pageParam }) =>
      granulometryAPI.listFormRecords({
        fromDate,
        toDate,
        bigBagNos: selectedBags,
        skip: pageParam ?? 0,
        limit: 50,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + (p?.records?.length || 0), 0);
      const total = lastPage?.total ?? loaded;
      if (loaded >= total) return undefined;
      return loaded;
    },
    staleTime: 15_000,
  });

  const records = useMemo(() => {
    const pages = recordsQuery.data?.pages || [];
    return pages.flatMap((p) => p?.records || []);
  }, [recordsQuery.data]);

  const toggleBag = (b) => {
    setSelectedBags((prev) => {
      const set = new Set(prev);
      if (set.has(b)) set.delete(b);
      else set.add(b);
      return Array.from(set);
    });
  };

  const onTableScroll = (e) => {
    if (!recordsQuery.hasNextPage || recordsQuery.isFetchingNextPage) return;
    const el = e.currentTarget;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 220) recordsQuery.fetchNextPage();
  };

  const derived = useMemo(() => {
    // Build a size union + per-bag value maps.
    // - chart uses server-computed percentPassing
    // - table shows raw form-entered weights, with totals per bag
    const sieveSizesSet = new Set();
    const bagKeys = [];
    const bagLabelByKey = new Map();
    const bagDateByKey = new Map();
    const tableValuesPct = new Map(); // `${bagKey}::${size}` -> percentPassing
    const tableValuesWeight = new Map(); // `${bagKey}::${size}` -> weight retained
    const totalsByBag = new Map(); // bagKey -> total weight
    const recordByBagKey = new Map(); // bigBag -> record

    records.forEach((r, idx) => {
      const bb = r.bigBagNo || "Unknown";
      const dmy = fmtDmy(r.sampleDate || r.recordedDate);
      const label = `Bag ${bb}${dmy ? ` (${dmy})` : ""}`;
      const bagKey = `bag_${String(r.id || idx)}`;
      bagKeys.push(bagKey);
      bagLabelByKey.set(bagKey, label);
      bagDateByKey.set(bagKey, dmy);
      recordByBagKey.set(bagKey, r);

      let totalW = 0;
      (r.sieves || []).forEach((sv) => {
        const s = Number(sv.sieveSize);
        const w = Number(sv.weight);
        if (!Number.isFinite(s) || !Number.isFinite(w)) return;
        sieveSizesSet.add(s);
        tableValuesWeight.set(`${bagKey}::${s}`, w);
        totalW += w;
      });
      totalsByBag.set(bagKey, totalW);

      (r.percentPassing || []).forEach((pt) => {
        const s = Number(pt.sieveSize);
        const v = Number(pt.percentPassing);
        if (!Number.isFinite(s) || !Number.isFinite(v)) return;
        sieveSizesSet.add(s);
        tableValuesPct.set(`${bagKey}::${s}`, v);
      });
    });

    const sieveSizes = Array.from(sieveSizesSet).sort((a, b) => a - b);

    const avgBySize = new Map();
    sieveSizes.forEach((s) => {
      const vals = bagKeys
        .map((b) => tableValuesPct.get(`${b}::${s}`))
        .filter((v) => Number.isFinite(v));
      const avg = vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : NaN;
      avgBySize.set(s, avg);
    });

    const chartData = sieveSizes.map((s) => {
      const row = { sieveSize: s };
      bagKeys.forEach((b) => {
        const v = tableValuesPct.get(`${b}::${s}`);
        // Inverse percentage: plot % retained (100 - % passing)
        row[b] = Number.isFinite(v) ? Math.max(0, Math.min(100, 100 - v)) : null;
      });
      const av = avgBySize.get(s);
      row.__avg = Number.isFinite(av) ? Math.max(0, Math.min(100, 100 - av)) : null;
      return row;
    });

    const insights = buildInsights({ sieveSizes, bagKeys, tableValues: tableValuesPct, avgBySize });

    return {
      sieveSizes,
      bagKeys,
      bagLabelByKey,
      bagDateByKey,
      chartData,
      tableValuesPct,
      tableValuesWeight,
      totalsByBag,
      avgBySize,
      insights,
      recordByBagKey,
    };
  }, [records]);

  return (
    <div
      className={[
        embedded ? "space-y-4 sm:space-y-5" : "p-4 md:p-6 space-y-4",
        isLab ? "bg-transparent" : "",
      ].join(" ")}
    >
      {!embedded && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">Granulometric analysis</h1>
            <p className="text-sm text-slate-500">Built from “Granulometric analysis” form submissions.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Analysis */}
        <div className="xl:col-span-12 space-y-4">
          <Card className={isLab ? "rounded-xl border border-slate-200 shadow-none bg-white" : ""}>
            <CardHeader className={isLab ? "p-3 sm:p-4 pb-2 sm:pb-3" : "pb-3"}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <CardTitle className={`${isLab ? "text-sm sm:text-[15px]" : "text-base"} flex items-center gap-2`}>
                    <BarChart3 className="w-4 h-4 text-slate-600" /> % Passing curves
                  </CardTitle>
                  <CardDescription className={isLab ? "text-[11px] sm:text-xs" : ""}>
                    Compare bags across sieve sizes. Toggle individual vs average.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <ToggleGroup
                    type="multiple"
                    value={[...(showIndividual ? ["individual"] : []), ...(showAverage ? ["average"] : [])]}
                    onValueChange={(vals) => {
                      const set = new Set(vals || []);
                      setShowIndividual(set.has("individual"));
                      setShowAverage(set.has("average"));
                    }}
                    variant="outline"
                    size="sm"
                    className={`${isLab ? "rounded-lg border border-slate-200 bg-white shadow-sm px-1" : ""}`}
                    aria-label="Series visibility"
                  >
                    <ToggleGroupItem
                      value="individual"
                      className={`${isLab ? "h-8 px-2 text-xs data-[state=on]:bg-blue-600 data-[state=on]:text-white" : ""}`}
                    >
                      Individual
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="average"
                      className={`${isLab ? "h-8 px-2 text-xs data-[state=on]:bg-blue-600 data-[state=on]:text-white" : ""}`}
                    >
                      Average
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </CardHeader>
            <CardContent className={isLab ? "p-3 sm:p-4 pt-0 space-y-3 sm:space-y-4" : "space-y-4"}>
              {/* Filters */}
              <div className={isLab ? "flex items-start justify-start w-full" : ""}>
                <div
                  className={
                    isLab
                      ? "w-full flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2 max-w-full"
                      : "grid grid-cols-1 md:grid-cols-12 gap-3"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-[150px] max-w-full">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full h-10 pl-9 text-sm bg-white"
                        aria-label="From date"
                      />
                    </div>

                    <div className="relative w-[150px] max-w-full">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full h-10 pl-9 text-sm bg-white"
                        aria-label="To date"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-600">Bag No.</span>
                      {selectedBags.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedBags([])}
                          className="text-[11px] text-slate-500 hover:text-slate-700"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {bigBagsQuery.isLoading ? (
                      <Skeleton className="h-5 w-48" />
                    ) : (
                      <div className="max-h-20 overflow-auto flex flex-wrap gap-1 pr-1">
                        {(bigBagsQuery.data?.bigBags || []).slice(0, 120).map((b) => {
                          const active = selectedBags.includes(b);
                          return (
                            <button
                              type="button"
                              key={b}
                              onClick={() => toggleBag(b)}
                              className={[
                                "text-[10px] px-1 py-0.5 rounded-full border transition-colors touch-manipulation",
                                active
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                              ].join(" ")}
                            >
                              {b}
                            </button>
                          );
                        })}
                        {(bigBagsQuery.data?.bigBags || []).length === 0 && (
                          <span className="text-xs text-slate-500">No bags found in this date range.</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div
                className={[
                  isLab ? "h-[300px] sm:h-[460px]" : "h-[280px] sm:h-[360px]",
                  isLab
                    ? "rounded-xl border border-slate-200 bg-white p-3 sm:p-4 flex flex-col"
                    : "rounded-xl border border-slate-200 bg-white",
                ].join(" ")}
              >
                {recordsQuery.isLoading ? (
                  <div className={isLab ? "flex-1 min-h-0" : "p-4"}>
                    <Skeleton className="h-6 w-48 mb-3" />
                    <Skeleton className="h-[220px] sm:h-[300px] w-full" />
                  </div>
                ) : derived.chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">No records to display.</div>
                ) : isLab ? (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2 sm:mb-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">Curves</div>
                        <div className="text-[11px] sm:text-xs text-slate-500">
                          Multiple lines per bag. Average is shown as a darker line.
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={derived.chartData}
                          margin={{ top: 56, right: 12, bottom: 30, left: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="sieveSize"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => `${v}`}
                            label={{
                              value: "Sieve (mm)",
                              position: "bottom",
                              offset: 12,
                              style: { fill: "#64748b", fontSize: 12 },
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            domain={[0, 100]}
                            tickFormatter={(v) => `${v}%`}
                            label={{
                              value: "Percentage (%)",
                              angle: -90,
                              position: "outsideLeft",
                              offset: 26,
                              style: { fill: "#64748b", fontSize: 12 },
                            }}
                          />
                          <Tooltip content={<ReportChartTooltip />} />
                          <Legend
                            verticalAlign="top"
                            align="left"
                            content={<CompactLegend />}
                            wrapperStyle={{
                              position: "absolute",
                              top: 8,
                              left: 12,
                              paddingBottom: 0,
                              background: "rgba(255,255,255,0.9)",
                              border: "1px solid #e2e8f0",
                              borderRadius: 10,
                              padding: "6px 8px",
                              backdropFilter: "blur(6px)",
                            }}
                          />
                          {showIndividual &&
                            derived.bagKeys.slice(0, 12).map((b, i) => (
                              <Line
                                key={b}
                                type="monotone"
                                dataKey={b}
                                name={derived.bagLabelByKey?.get(b) || b}
                                stroke={palette(i)}
                                strokeWidth={2.5}
                                dot={false}
                                connectNulls
                              />
                            ))}
                          {showAverage && (
                            <Line
                              type="monotone"
                              dataKey="__avg"
                              name="Average"
                              stroke="#111827"
                              strokeWidth={3.25}
                              dot={false}
                              connectNulls
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 h-full">
                    <div className="text-xs text-slate-500 flex items-center gap-2 mb-2">
                      <BarChart3 className="w-4 h-4" /> Curve preview
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={derived.chartData}
                        margin={{ top: 24, right: 10, bottom: 30, left: 48 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={isLab ? "#e2e8f0" : "#f1f5f9"} />
                        <XAxis
                          dataKey="sieveSize"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `${v}`}
                          label={{
                            value: "Sieve (mm)",
                            position: "bottom",
                            offset: 12,
                            style: { fill: "#64748b", fontSize: 12 },
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                          label={{
                            value: "Percentage (%)",
                            angle: -90,
                            position: "outsideLeft",
                            offset: 18,
                            style: { fill: "#64748b", fontSize: 12 },
                          }}
                        />
                        <Tooltip content={<ReportChartTooltip />} />
                        <Legend
                          verticalAlign="top"
                          align="left"
                          content={<CompactLegend />}
                          wrapperStyle={
                            isLab
                              ? { position: "absolute", top: 8, left: 12, paddingBottom: 0 }
                              : { paddingBottom: 10 }
                          }
                        />
                        {showIndividual &&
                          derived.bagKeys.slice(0, 12).map((b, i) => (
                            <Line
                              key={b}
                              type="monotone"
                              dataKey={b}
                              name={derived.bagLabelByKey?.get(b) || b}
                              stroke={palette(i)}
                              strokeWidth={isLab ? 2.5 : 2}
                              dot={false}
                              connectNulls
                            />
                          ))}
                        {showAverage && (
                          <Line
                            type="monotone"
                            dataKey="__avg"
                            name="Average"
                            stroke="#111827"
                            strokeWidth={isLab ? 3.25 : 3}
                            dot={false}
                            connectNulls
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Table + insights */}
              <div className={isLab ? "grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4" : "grid grid-cols-1 lg:grid-cols-12 gap-4"}>
                <Card className={`lg:col-span-8 ${isLab ? "rounded-xl border border-slate-200 shadow-none bg-white" : ""}`}>
                  <CardHeader className={isLab ? "p-3 sm:p-4 pb-2 sm:pb-3" : "pb-3"}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <CardTitle className={`${isLab ? "text-sm sm:text-[15px]" : "text-base"}`}>Table</CardTitle>
                        <CardDescription className={isLab ? "text-[11px] sm:text-xs" : ""}>
                          Rows are sieve sizes; columns are big bags. Cell values are{" "}
                          {tableMode === "percent" ? "% of total sample" : "the raw weights from the form"}.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLab ? (
                          <ToggleGroup
                            type="single"
                            value={tableMode}
                            onValueChange={(v) => {
                              if (v) setTableMode(v);
                            }}
                            variant="outline"
                            size="sm"
                            className="rounded-lg border border-slate-200 bg-white shadow-sm px-1"
                            aria-label="Table mode"
                          >
                            <ToggleGroupItem
                              value="weight"
                              className="h-8 px-2 text-xs data-[state=on]:bg-blue-600 data-[state=on]:text-white"
                            >
                              Weights
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="percent"
                              className="h-8 px-2 text-xs data-[state=on]:bg-blue-600 data-[state=on]:text-white"
                            >
                              %
                            </ToggleGroupItem>
                          </ToggleGroup>
                        ) : (
                          <>
                            <span className={`text-xs ${tableMode === "weight" ? "text-slate-900 font-semibold" : "text-slate-500"}`}>
                              Weights
                            </span>
                            <Switch
                              checked={tableMode === "percent"}
                              onCheckedChange={(v) => setTableMode(v ? "percent" : "weight")}
                            />
                            <span className={`text-xs ${tableMode === "percent" ? "text-slate-900 font-semibold" : "text-slate-500"}`}>
                              %
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className={isLab ? "p-3 sm:p-4 pt-0" : ""}>
                    <div
                      ref={tableScrollRef}
                      onScroll={isLab ? onTableScroll : undefined}
                      className={[
                        isLab ? "max-h-[60vh] sm:max-h-[520px] -mx-1 px-1" : "",
                        "overflow-auto rounded-xl border border-slate-200",
                      ].join(" ")}
                    >
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th
                              className="text-left px-3 py-2 text-xs font-semibold text-slate-700 align-bottom"
                              rowSpan={2}
                            >
                              Sieve (mm)
                            </th>
                            {derived.bagKeys.slice(0, 12).map((b) => (
                              <th key={b} className="text-right px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap">
                                {(derived.bagLabelByKey?.get(b) || b).replace(/\s*\([^)]+\)\s*$/, "")}
                              </th>
                            ))}
                            {derived.bagKeys.length > 12 && (
                              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-400">…</th>
                            )}
                          </tr>
                          <tr className="border-t border-slate-200">
                            {derived.bagKeys.slice(0, 12).map((b) => (
                              <th key={`${b}-date`} className="text-right px-3 py-1.5 text-[11px] font-medium text-slate-500 whitespace-nowrap">
                                {derived.bagDateByKey?.get(b) || ""}
                              </th>
                            ))}
                            {derived.bagKeys.length > 12 && (
                              <th className="text-right px-3 py-1.5 text-[11px] font-medium text-slate-400"> </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {derived.sieveSizes.map((s) => {
                            // Compute per-size mean/sd for conditional colors
                            const vals = derived.bagKeys
                              .map((b) => {
                                if (tableMode === "percent") {
                                  const pctPassing = derived.tableValuesPct.get(`${b}::${s}`);
                                  return Number.isFinite(pctPassing) ? Math.max(0, Math.min(100, 100 - pctPassing)) : NaN;
                                }
                                const w = derived.tableValuesWeight.get(`${b}::${s}`);
                                return w;
                              })
                              .filter((v) => Number.isFinite(v));
                            const mean = vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : NaN;
                            const sd =
                              vals.length > 1
                                ? Math.sqrt(vals.reduce((a, c) => a + (c - mean) ** 2, 0) / (vals.length - 1))
                                : 0;

                            const colorFor = (v) => {
                              if (!Number.isFinite(v) || !Number.isFinite(mean)) return "bg-white";
                              const effectiveSd = sd > 0.25 ? sd : 2.0; // small-sd guard
                              const z = Math.abs((v - mean) / effectiveSd);
                              if (!isLab) {
                                if (z <= 1) return "bg-emerald-50";
                                if (z <= 2) return "bg-amber-50";
                                return "bg-rose-50";
                              }
                              if (z <= 1) return "bg-slate-50/60";
                              if (z <= 2) return "bg-indigo-50/45";
                              return "bg-rose-50/45";
                            };

                            return (
                              <tr
                                key={s}
                                className={`border-b border-slate-100 last:border-b-0 ${isLab ? "hover:bg-slate-50/40 transition-colors" : ""}`}
                              >
                                <td className={`px-3 ${isLab ? "py-3" : "py-2"} text-slate-700 font-medium`}>
                                  {s === 0 ? "PAN (0)" : `${s}`}
                                </td>
                                {derived.bagKeys.slice(0, 12).map((b) => {
                                  const v =
                                    tableMode === "percent"
                                      ? (() => {
                                          const pctPassing = derived.tableValuesPct.get(`${b}::${s}`);
                                          return Number.isFinite(pctPassing) ? Math.max(0, Math.min(100, 100 - pctPassing)) : NaN;
                                        })()
                                      : derived.tableValuesWeight.get(`${b}::${s}`);
                                  return (
                                    <td
                                      key={b}
                                      className={`px-3 ${isLab ? "py-3" : "py-2"} text-right tabular-nums text-slate-900 ${colorFor(v)}`}
                                    >
                                      {Number.isFinite(v) ? `${v.toFixed(2)}${tableMode === "percent" ? "%" : ""}` : "—"}
                                    </td>
                                  );
                                })}
                                {derived.bagKeys.length > 12 && <td className={`px-3 ${isLab ? "py-3" : "py-2"} text-right text-slate-400`}>…</td>}
                              </tr>
                            );
                          })}
                          {derived.sieveSizes.length > 0 && (
                            <tr className="bg-slate-50 border-t border-slate-200">
                              <td className="px-3 py-2 text-xs font-semibold text-slate-700">Total</td>
                              {derived.bagKeys.slice(0, 12).map((b) => {
                                const t = derived.totalsByBag.get(b);
                                return (
                                  <td key={b} className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-900">
                                    {tableMode === "percent"
                                      ? "—"
                                      : Number.isFinite(t)
                                        ? t.toFixed(2)
                                        : "—"}
                                  </td>
                                );
                              })}
                              {derived.bagKeys.length > 12 && <td className="px-3 py-2 text-right text-slate-400">…</td>}
                            </tr>
                          )}
                          {derived.sieveSizes.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-3 py-8 text-center text-sm text-slate-500">
                                No data yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {isLab && recordsQuery.isFetchingNextPage && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading more…
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className={`lg:col-span-4 ${isLab ? "rounded-xl border border-slate-200 shadow-none bg-white" : ""}`}>
                  <CardHeader className={isLab ? "p-3 sm:p-4 pb-2 sm:pb-3" : "pb-3"}>
                    <CardTitle className={`${isLab ? "text-sm sm:text-[15px]" : "text-base"} flex items-center gap-2`}>
                      <AlertTriangle className="w-4 h-4 text-slate-600" /> Insights
                    </CardTitle>
                    <CardDescription className={isLab ? "text-[11px] sm:text-xs" : ""}>
                      Automatic flags based on deviation and curve sanity checks.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className={isLab ? "p-3 sm:p-4 pt-0 space-y-2" : "space-y-2"}>
                    {derived.insights.map((t, i) => {
                      if (!isLab) {
                        return (
                          <div key={i} className="text-sm text-slate-700">
                            - {t}
                          </div>
                        );
                      }

                      const lower = String(t || "").toLowerCase();
                      const variant =
                        lower.includes("outlier") || lower.includes("non-monotonic")
                          ? "warning"
                          : lower.includes("good") || lower.includes("monotonic")
                            ? "success"
                            : "info";
                      const meta =
                        variant === "warning"
                          ? { Icon: AlertTriangle, border: "border-l-amber-400", iconColor: "text-amber-600", bg: "bg-amber-50/30" }
                          : variant === "success"
                            ? { Icon: TrendingUp, border: "border-l-emerald-400", iconColor: "text-emerald-600", bg: "bg-emerald-50/20" }
                            : { Icon: Info, border: "border-l-sky-400", iconColor: "text-sky-600", bg: "bg-sky-50/20" };
                      return (
                        <div
                          key={i}
                          className={`rounded-xl border border-slate-200 ${meta.bg} ${meta.border} border-l-2 p-3 flex items-start gap-2`}
                        >
                          <meta.Icon className={`w-4 h-4 mt-0.5 ${meta.iconColor}`} />
                          <div className="text-sm text-slate-700 leading-snug">{t}</div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              {!isLab && (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Showing <span className="font-medium text-slate-700">{records.length}</span> record(s)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => recordsQuery.fetchNextPage()}
                      disabled={!recordsQuery.hasNextPage || recordsQuery.isFetchingNextPage}
                      className="gap-2"
                    >
                      {recordsQuery.isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Load more
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

