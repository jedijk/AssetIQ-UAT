import React, { useEffect, useState } from "react";
import { cn } from "../../../lib/utils";

const DEMO_STYLES = "rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6 overflow-hidden";

function FlowColumn({ items, activeIndex = -1 }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {items.map((item, i) => (
        <div key={item} className="flex flex-col items-center gap-2">
          <div
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium border transition-all duration-500",
              i <= activeIndex
                ? "bg-emerald-100 border-emerald-300 text-emerald-800 scale-105"
                : "bg-white border-slate-200 text-slate-600"
            )}
          >
            {item}
          </div>
          {i < items.length - 1 && (
            <div
              className={cn(
                "w-0.5 h-4 transition-colors duration-500",
                i < activeIndex ? "bg-emerald-400" : "bg-slate-200"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function AnimatedFlow({ primary, secondary, interval = 1200 }) {
  const [step, setStep] = useState(0);
  const total = primary.length + (secondary?.length || 0);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % (total + 2)), interval);
    return () => clearInterval(timer);
  }, [total, interval]);

  const primaryActive = Math.min(step, primary.length - 1);
  const secondaryActive =
    secondary && step >= primary.length
      ? Math.min(step - primary.length, secondary.length - 1)
      : -1;

  return (
    <div className={cn(DEMO_STYLES, "flex flex-col md:flex-row gap-8 justify-center items-center min-h-[280px]")}>
      <FlowColumn items={primary} activeIndex={primaryActive} />
      {secondary && (
        <>
          <div className="hidden md:block text-slate-300 text-2xl">→</div>
          <FlowColumn items={secondary} activeIndex={secondaryActive} />
        </>
      )}
    </div>
  );
}

export function OnboardingDemo({ type }) {
  switch (type) {
    case "company":
      return (
        <div className={cn(DEMO_STYLES, "flex items-center justify-center min-h-[200px]")}>
          <div className="text-center space-y-3 animate-pulse">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-2xl font-bold text-emerald-700">
              AC
            </div>
            <p className="font-semibold text-slate-800">Acme Corporation</p>
            <p className="text-sm text-slate-500">EN · Europe/Amsterdam</p>
          </div>
        </div>
      );
    case "sites":
      return (
        <AnimatedFlow
          primary={["Company", "Site", "Plant", "Area", "Equipment"]}
        />
      );
    case "equipment":
      return (
        <AnimatedFlow
          primary={["Factory", "Line", "Pump", "Motor", "Bearing"]}
          secondary={[
            "Observation",
            "Failure Mode",
            "Maintenance",
            "Task",
            "Completed",
            "Risk Reduced",
          ]}
        />
      );
    case "users":
      return (
        <div className={cn(DEMO_STYLES, "grid grid-cols-2 md:grid-cols-3 gap-3 min-h-[200px]")}>
          {["Operator", "Maintenance", "Planner", "Reliability Engineer", "Administrator"].map(
            (role, i) => (
              <div
                key={role}
                className="p-3 rounded-lg border border-slate-200 bg-white text-center text-sm font-medium animate-fade-in"
                style={{ animationDelay: `${i * 200}ms` }}
              >
                {role}
              </div>
            )
          )}
        </div>
      );
    case "criticality":
      return (
        <div className={cn(DEMO_STYLES, "space-y-2 min-h-[200px]")}>
          {[
            { name: "Pump A", impact: "Production Loss", value: "$1M", stars: 5 },
            { name: "Pump B", impact: "Production Loss", value: "$20k", stars: 2 },
          ].map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white text-sm"
            >
              <span className="font-medium">{row.name}</span>
              <span className="text-slate-500">{row.impact}</span>
              <span className="font-mono">{row.value}</span>
              <span className="text-amber-500">{"★".repeat(row.stars)}</span>
            </div>
          ))}
        </div>
      );
    case "failure_modes":
      return (
        <AnimatedFlow
          primary={["Failure Mode", "Symptoms", "Recommended Actions", "Maintenance Strategy", "Reduced Risk"]}
        />
      );
    case "maintenance_strategy":
      return (
        <AnimatedFlow
          primary={["Failure Mode", "Inspection", "Monthly", "Scheduled Task", "Execution"]}
        />
      );
    case "spare_parts":
      return <AnimatedFlow primary={["Motor", "Bearing", "Seal", "Lubricant"]} />;
    case "forms":
      return (
        <AnimatedFlow
          primary={["Inspection", "Submit", "Observation", "Action", "Closure"]}
        />
      );
    case "visual_boards":
      return (
        <div className={cn(DEMO_STYLES, "min-h-[200px] p-4")}>
          <div className="bg-slate-900 rounded-lg p-4 text-white space-y-2 animate-pulse">
            <p className="text-xs text-slate-400">Shop Floor Display</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-slate-800 p-2 rounded">Today&apos;s Tasks: 12</div>
              <div className="bg-slate-800 p-2 rounded">Open Observations: 3</div>
              <div className="bg-red-900/50 p-2 rounded">Overdue PM: 1</div>
              <div className="bg-emerald-900/50 p-2 rounded">Risk: Low</div>
            </div>
          </div>
        </div>
      );
    case "external_api":
      return (
        <AnimatedFlow primary={["PLC", "API", "Observation", "AssetIQ", "Dashboard"]} />
      );
    case "go_live":
      return (
        <div className={cn(DEMO_STYLES, "space-y-2 min-h-[200px]")}>
          {["Equipment", "Failure Modes", "Users", "Maintenance", "Forms", "Visual Boards", "External API"].map(
            (item, i) => (
              <div
                key={item}
                className="flex items-center gap-2 p-2 rounded border border-emerald-200 bg-emerald-50 text-sm"
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                <span className="text-emerald-600">✓</span>
                <span>{item}</span>
              </div>
            )
          )}
        </div>
      );
    default:
      return null;
  }
}
