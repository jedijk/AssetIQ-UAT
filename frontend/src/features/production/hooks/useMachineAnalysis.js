import { useCallback, useEffect, useMemo, useState } from "react";

export function useMachineAnalysis({ api, fromDate, toDate, period }) {
  const [analysis, setAnalysis] = useState(null);
  const [stats, setStats] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [createdAt, setCreatedAt] = useState(null);
  const [analysisRange, setAnalysisRange] = useState(null);
  const [error, setError] = useState(null);

  const periodLabel = useMemo(
    () =>
      ({ "1d": "day", "1w": "week", "1m": "month", "3m": "3 months", "6m": "6 months", "1y": "year", ytd: "YTD" }[
        period
      ] || period),
    [period]
  );

  const fetchAnalysis = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get(`/production/machine-analysis?start=${fromDate}&end=${toDate}`);
      if (res.data?.status === "ok") {
        setAnalysis(res.data.analysis);
        setStats(res.data.stats);
        setCreatedAt(res.data.created_at);
        setAnalysisRange(res.data.date_range);
      } else if (res.data?.status === "error") {
        setError(res.data.error);
        setAnalysis(null);
      }
    } catch {
      // Keep silent like the original implementation
    }
  }, [api, fromDate, toDate]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const runAnalysis = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.post("/production/machine-analysis", { start: fromDate, end: toDate });
      if (res.data?.status === "ok") {
        setAnalysis(res.data.analysis);
        setStats(res.data.stats);
        setCreatedAt(new Date().toISOString());
        setAnalysisRange({ start: fromDate, end: toDate });
        setError(null);
      } else if (res.data?.status === "error") {
        setError(res.data.error);
        setAnalysis(null);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError("Failed to run analysis. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [api, fromDate, toDate]);

  const opt = analysis?.optimal_settings || {};

  return {
    analysis,
    stats,
    generating,
    createdAt,
    analysisRange,
    error,
    periodLabel,
    opt,
    fetchAnalysis,
    runAnalysis,
  };
}

