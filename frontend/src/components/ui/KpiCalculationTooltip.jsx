/**
 * Hover tooltip explaining how a KPI value is calculated.
 */
import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

export default function KpiCalculationTooltip({
  calculation,
  children,
  side = "bottom",
  align = "center",
  className = "",
}) {
  if (!calculation) {
    return children;
  }

  const content =
    typeof calculation === "string" ? (
      <p className="text-xs leading-relaxed max-w-[280px]">{calculation}</p>
    ) : (
      <div className="text-xs leading-relaxed max-w-[280px] space-y-1">{calculation}</div>
    );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`cursor-help ${className}`.trim()}>{children}</div>
        </TooltipTrigger>
        <TooltipContent side={side} align={align}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
