// Date helpers (timezone-safe: use local date strings, not UTC)
export const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const displayDate = (d) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

export const today = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
};

export const daysAgo = (n) => {
  const d = today();
  d.setDate(d.getDate() - n);
  return d;
};

export const monthsAgo = (n) => {
  const d = today();
  d.setMonth(d.getMonth() - n);
  return d;
};

export const startOfYear = () => {
  const d = today();
  d.setMonth(0, 1);
  return d;
};

export const PERIOD_OPTIONS = [
  { key: "1d", label: "1D" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "ytd", label: "YTD" },
];

