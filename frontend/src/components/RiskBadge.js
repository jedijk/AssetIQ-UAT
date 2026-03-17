import { cn } from "../lib/utils";

const RiskBadge = ({ level, size = "md", className }) => {
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const levelClasses = {
    Critical: "bg-red-100 text-red-700 border-red-200",
    High: "bg-orange-100 text-orange-700 border-orange-200",
    Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Low: "bg-green-100 text-green-700 border-green-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold rounded-full border",
        sizeClasses[size],
        levelClasses[level] || levelClasses.Medium,
        className
      )}
      data-testid={`risk-badge-${level?.toLowerCase()}`}
    >
      {level}
    </span>
  );
};

export default RiskBadge;
