export const EVENT_CATEGORIES = [
  { value: "operational_event", label: "Operational Event", bgClass: "bg-blue-100 text-blue-700", dotClass: "bg-blue-500" },
  { value: "alarm", label: "Alarm", bgClass: "bg-red-100 text-red-700", dotClass: "bg-red-500" },
  { value: "maintenance_action", label: "Maintenance Action", bgClass: "bg-orange-100 text-orange-700", dotClass: "bg-orange-500" },
  { value: "human_decision", label: "Human Decision", bgClass: "bg-purple-100 text-purple-700", dotClass: "bg-purple-500" },
  { value: "system_response", label: "System Response", bgClass: "bg-cyan-100 text-cyan-700", dotClass: "bg-cyan-500" },
  { value: "environmental_condition", label: "Environmental", bgClass: "bg-green-100 text-green-700", dotClass: "bg-green-500" },
];

export const ACTION_PRIORITIES = [
  { value: "critical", label: "Critical", bgClass: "bg-red-100 text-red-700" },
  { value: "high", label: "High", bgClass: "bg-orange-100 text-orange-700" },
  { value: "medium", label: "Medium", bgClass: "bg-yellow-100 text-yellow-700" },
  { value: "low", label: "Low", bgClass: "bg-green-100 text-green-700" },
];

export const ACTION_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

export const INVESTIGATION_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Under Review" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

