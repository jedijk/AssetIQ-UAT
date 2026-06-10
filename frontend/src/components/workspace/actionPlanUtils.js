import { translateEnum } from "../../lib/translateEnum";

export const ACTION_STATUS_ENUM = {
  open: "Open",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  validated: "Validated",
};

export const getActionStatusLabel = (t, status) => {
  if (!status) return status;
  const key = ACTION_STATUS_ENUM[String(status).toLowerCase()];
  return key ? translateEnum(t, key) : translateEnum(t, status);
};


// Map backend action_type values (e.g. "preventive") to short UI codes (PM/CM/PDM/OP/LEARN/IV)
export const normalizeActionType = (val) => {
  if (!val) return "CM";
  const v = String(val).toUpperCase();
  if (["PM", "CM", "PDM", "OP", "LEARN", "IV"].includes(v)) return v;
  const lc = String(val).toLowerCase();
  if (lc.startsWith("prev")) return "PM";
  if (lc.startsWith("corr")) return "CM";
  if (lc.startsWith("pred")) return "PDM";
  if (lc.startsWith("oper")) return "OP";
  if (lc.startsWith("learn")) return "LEARN";
  if (lc.startsWith("invest")) return "IV";
  return "CM";
};
