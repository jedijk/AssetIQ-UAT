import React from "react";

const KpiCardWidget = ({ widget, data }) => {
  const metric = widget?.config?.metric || widget?.id;
  const payload = data?.widgets?.[widget?.id] || data?.kpis?.[metric] || {};
  const value = payload.formatted_value ?? payload.value ?? "—";
  const label = widget?.title || payload.label || metric;

  return (
    <div className="h-full rounded-xl border border-slate-700/50 bg-slate-900/80 p-4 flex flex-col justify-center">
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">{label}</div>
      <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
      {payload.subtitle && (
        <div className="text-xs text-slate-500 mt-1">{payload.subtitle}</div>
      )}
    </div>
  );
};

export default KpiCardWidget;
