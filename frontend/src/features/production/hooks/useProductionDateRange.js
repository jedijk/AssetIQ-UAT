import { useState } from "react";
import { daysAgo, monthsAgo, startOfYear, today, fmtDate } from "../../../lib/production/dateRange";

export function useProductionDateRange() {
  const [period, setPeriod] = useState("1w");
  const [fromDate, setFromDate] = useState(daysAgo(7));
  const [toDate, setToDate] = useState(today());
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

