import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { AlertTriangle, BarChart3, Loader2 } from "lucide-react";

import { granulometryAPI } from "../lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { Switch } from "../components/ui/switch";
import { Skeleton } from "../components/ui/skeleton";

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

export default function GranulometryPage() {
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

  const derived = useMemo(() => {
    // Build a size union + per-bag value map using server-computed percentPassing.
    const sieveSizesSet = new Set();
    const bagKeys = [];
    const bagLabelByKey = new Map();
    const tableValues = new Map(); // `${bagKey}::${size}` -> percentPassing
    const recordByBagKey = new Map(); // bigBag -> record

    records.forEach((r, idx) => {
      const bagKey = r.bigBagNo || `Bag ${idx + 1}`;
      bagKeys.push(bagKey);
      bagLabelByKey.set(bagKey, bagKey);
      recordByBagKey.set(bagKey, r);
      (r.percentPassing || []).forEach((pt) => {
        const s = Number(pt.sieveSize);
        const v = Number(pt.percentPassing);
        if (!Number.isFinite(s) || !Number.isFinite(v)) return;
        sieveSizesSet.add(s);
        tableValues.set(`${bagKey}::${s}`, v);
      });
    });

    const sieveSizes = Array.from(sieveSizesSet).sort((a, b) => a - b);

    const avgBySize = new Map();
    sieveSizes.forEach((s) => {
      const vals = bagKeys
        .map((b) => tableValues.get(`${b}::${s}`))
        .filter((v) => Number.isFinite(v));
      const avg = vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : NaN;
      avgBySize.set(s, avg);
    });

    const chartData = sieveSizes.map((s) => {
      const row = { sieveSize: s };
      bagKeys.forEach((b) => {
        const v = tableValues.get(`${b}::${s}`);
        row[b] = Number.isFinite(v) ? v : null;
      });
      const av = avgBySize.get(s);
      row.__avg = Number.isFinite(av) ? av : null;
      return row;
    });

    const insights = buildInsights({ sieveSizes, bagKeys, tableValues, avgBySize });

    return { sieveSizes, bagKeys, chartData, tableValues, avgBySize, insights, recordByBagKey };
  }, [records]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">Granulometric analysis</h1>
          <p className="text-sm text-slate-500">Built from “Granulometric analysis” form submissions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Analysis */}
        <div className="xl:col-span-12 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-600" /> % Passing curves
                  </CardTitle>
                  <CardDescription>Compare bags across sieve sizes. Toggle individual vs average.</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={showIndividual} onCheckedChange={setShowIndividual} />
                    <span className="text-sm text-slate-700">Individual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={showAverage} onCheckedChange={setShowAverage} />
                    <span className="text-sm text-slate-700">Average</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-3 space-y-1.5">
                  <Label>From</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="md:col-span-3 space-y-1.5">
                  <Label>To</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="md:col-span-6 space-y-1.5">
                  <Label>Big bag no (multi-select)</Label>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    {bigBagsQuery.isLoading ? (
                      <Skeleton className="h-5 w-48" />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(bigBagsQuery.data?.bigBags || []).slice(0, 60).map((b) => {
                          const checked = selectedBags.includes(b);
                          return (
                            <label key={b} className="flex items-center gap-2 text-xs px-2 py-1 rounded-full border border-slate-200 hover:bg-slate-50 cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => {
                                  const will = !!next;
                                  setSelectedBags((prev) => {
                                    const set = new Set(prev);
                                    if (will) set.add(b);
                                    else set.delete(b);
                                    return Array.from(set);
                                  });
                                }}
                              />
                              <span className="text-slate-700">{b}</span>
                            </label>
                          );
                        })}
                        {(bigBagsQuery.data?.bigBags || []).length === 0 && (
                          <span className="text-xs text-slate-500">No bags found in this date range.</span>
                        )}
                      </div>
                    )}
                    {selectedBags.length > 0 && (
                      <div className="mt-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedBags([])}>
                          Clear selection
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="h-[360px] rounded-xl border border-slate-200 bg-white">
                {recordsQuery.isLoading ? (
                  <div className="p-4">
                    <Skeleton className="h-6 w-48 mb-3" />
                    <Skeleton className="h-[280px] w-full" />
                  </div>
                ) : derived.chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">No records to display.</div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 h-[360px]">
                    <div className="text-xs text-slate-500 flex items-center gap-2 mb-2">
                      <BarChart3 className="w-4 h-4" /> Curve preview
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={derived.chartData} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="sieveSize" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip content={<ReportChartTooltip />} />
                        <Legend />
                        {showIndividual &&
                          derived.bagKeys.slice(0, 12).map((b, i) => (
                            <Line
                              key={b}
                              type="monotone"
                              dataKey={b}
                              stroke={palette(i)}
                              strokeWidth={2}
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
                            strokeWidth={3}
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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <Card className="lg:col-span-8">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Table</CardTitle>
                    <CardDescription>Rows are sieve sizes; columns are big bags. Cell values are % passing.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-700">Sieve</th>
                            {derived.bagKeys.slice(0, 12).map((b) => (
                              <th key={b} className="text-right px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap">
                                {b}
                              </th>
                            ))}
                            {derived.bagKeys.length > 12 && (
                              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-400">…</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {derived.sieveSizes.map((s) => {
                            // Compute per-size mean/sd for conditional colors
                            const vals = derived.bagKeys
                              .map((b) => derived.tableValues.get(`${b}::${s}`))
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
                              if (z <= 1) return "bg-emerald-50";
                              if (z <= 2) return "bg-amber-50";
                              return "bg-rose-50";
                            };

                            return (
                              <tr key={s} className="border-b border-slate-100 last:border-b-0">
                                <td className="px-3 py-2 text-slate-700 font-medium">{s}</td>
                                {derived.bagKeys.slice(0, 12).map((b) => {
                                  const v = derived.tableValues.get(`${b}::${s}`);
                                  return (
                                    <td
                                      key={b}
                                      className={`px-3 py-2 text-right tabular-nums text-slate-900 ${colorFor(v)}`}
                                    >
                                      {Number.isFinite(v) ? v.toFixed(2) : "—"}
                                    </td>
                                  );
                                })}
                                {derived.bagKeys.length > 12 && <td className="px-3 py-2 text-right text-slate-400">…</td>}
                              </tr>
                            );
                          })}
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
                  </CardContent>
                </Card>

                <Card className="lg:col-span-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-slate-600" /> Insights
                    </CardTitle>
                    <CardDescription>Automatic flags based on deviation and curve sanity checks.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {derived.insights.map((t, i) => (
                      <div key={i} className="text-sm text-slate-700">
                        - {t}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Pagination */}
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

