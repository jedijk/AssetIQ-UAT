import React from "react";

/**
 * HTML table fallback for chart widgets on TV browsers that cannot run Recharts reliably.
 */
export default function LegacyChartTable({ points, theme = "dark", maxRows = 8 }) {
  const rows = (points || []).slice(-maxRows);
  if (rows.length === 0) {
    return <p className="vmb-text-body">No trend data</p>;
  }

  const labelKey = rows[0].date != null ? "date" : Object.keys(rows[0]).find((k) => k !== "value") || "label";
  const borderColor = theme === "light" ? "#cbd5e1" : "#334155";
  const headBg = theme === "light" ? "#f1f5f9" : "#1e293b";
  const headColor = theme === "light" ? "#475569" : "#94a3b8";

  return (
    <table
      className="vmb-legacy-chart-table"
      style={{ borderColor, fontSize: "var(--vmb-chart-fs, 11px)" }}
    >
      <thead>
        <tr>
          <th style={{ background: headBg, color: headColor, borderColor }}>Period</th>
          <th style={{ background: headBg, color: headColor, borderColor }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={`${row[labelKey]}-${idx}`}>
            <td style={{ borderColor }}>{String(row[labelKey] ?? "").slice(0, 12)}</td>
            <td style={{ borderColor }}>{row.value ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
