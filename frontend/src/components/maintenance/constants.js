/**
 * Shared constants and configurations for Maintenance Strategies
 */
import { Shield, AlertTriangle, Activity, CheckCircle2 } from "lucide-react";

export const CRITICALITY_CONFIG = {
  safety_critical: { label: "Safety Critical", color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200", icon: Shield },
  production_critical: { label: "Production Critical", color: "bg-orange-500", textColor: "text-orange-700", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: AlertTriangle },
  medium: { label: "Medium", color: "bg-yellow-500", textColor: "text-yellow-700", bgColor: "bg-yellow-50", borderColor: "border-yellow-200", icon: Activity },
  low: { label: "Low", color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200", icon: CheckCircle2 },
};

export const FREQUENCY_OPTIONS = [
  { value: "continuous", label: "Continuous" },
  { value: "hourly", label: "Hourly" },
  { value: "per_shift", label: "Per Shift" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "bi_weekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annually", label: "Semi-Annually" },
  { value: "annually", label: "Annually" },
  { value: "as_needed", label: "As Needed" },
];

export const DISCIPLINE_OPTIONS = [
  { value: "mechanical", label: "Mechanical" },
  { value: "electrical", label: "Electrical" },
  { value: "instrumentation", label: "Instrumentation" },
  { value: "operations", label: "Operations" },
  { value: "laboratory", label: "Laboratory" },
  { value: "predictive", label: "Predictive Maintenance" },
  { value: "reliability", label: "Reliability Engineering" },
];

export const RESOURCE_OPTIONS = [
  { value: "1_technician", label: "1 Technician" },
  { value: "2_technicians", label: "2 Technicians" },
  { value: "crew", label: "Full Crew" },
  { value: "specialist", label: "Specialist Required" },
  { value: "contractor", label: "Contractor" },
];

export const DETECTION_TYPES = [
  { value: "vibration", label: "Vibration Monitoring" },
  { value: "temperature", label: "Temperature Monitoring" },
  { value: "pressure", label: "Pressure Monitoring" },
  { value: "flow", label: "Flow Monitoring" },
  { value: "level", label: "Level Monitoring" },
  { value: "oil_analysis", label: "Oil Analysis" },
  { value: "ultrasonic", label: "Ultrasonic" },
  { value: "thermography", label: "Thermography" },
  { value: "visual", label: "Visual Inspection" },
  { value: "acoustic", label: "Acoustic Monitoring" },
];
