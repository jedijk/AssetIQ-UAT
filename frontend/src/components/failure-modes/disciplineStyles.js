import {
  Box,
  Cog,
  FlaskConical,
  Gauge,
  Leaf,
  Minimize2,
  Pipette,
  Shield,
  Zap,
} from "lucide-react";

export const disciplineIcons = {
  Rotating: Cog,
  Static: Box,
  Piping: Pipette,
  Instrumentation: Gauge,
  Electrical: Zap,
  Process: FlaskConical,
  Safety: Shield,
  Environment: Leaf,
  Extruder: Minimize2,
};

export const disciplineColors = {
  Rotating: "bg-blue-100 text-blue-700 border-blue-200",
  Static: "bg-purple-100 text-purple-700 border-purple-200",
  Piping: "bg-orange-100 text-orange-700 border-orange-200",
  Instrumentation: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Electrical: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Process: "bg-slate-100 text-slate-700 border-slate-200",
  Safety: "bg-red-100 text-red-700 border-red-200",
  Environment: "bg-green-100 text-green-700 border-green-200",
  Extruder: "bg-indigo-100 text-indigo-700 border-indigo-200",
};
