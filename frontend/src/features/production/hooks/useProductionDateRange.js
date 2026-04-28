import { useState } from "react";
import { daysAgo, monthsAgo, startOfYear, today, fmtDate } from "../../../lib/production/dateRange";

export function useProductionDateRange() {
  // Default the Production Report to "today" on first open.
  const t0 = today();
  const [period, setPeriod] = useState("1d");
  const [fromDate, setFromDate] = useState(t0);
  const [toDate, setToDate] = useState(t0);
  const [showCustomDate, setShowCustomDate] = useState(false);

  const handlePeriod = (p) => {
    setPeriod(p);
    setShowCustomDate(false);
    const t = today();
    setToDate(t);
    switch (p) {
      case "1d":
        setFromDate(t);
        break;
      case "1w":
        setFromDate(daysAgo(7));
        break;
      case "1m":
        setFromDate(monthsAgo(1));
        break;
      case "3m":
        setFromDate(monthsAgo(3));
        break;
      case "6m":
        setFromDate(monthsAgo(6));
        break;
      case "1y":
        setFromDate(monthsAgo(12));
        break;
      case "ytd":
        setFromDate(startOfYear());
        break;
      default:
        setFromDate(t);
    }
  };

  const fromStr = fmtDate(fromDate);
  const toStr = fmtDate(toDate);

  return {
    period,
    setPeriod,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    showCustomDate,
    setShowCustomDate,
    handlePeriod,
    fromStr,
    toStr,
  };
}

