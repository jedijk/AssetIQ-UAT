export const EQUIPMENT_UNKNOWN_MESSAGE = "Equipment: I don't know";

export function getIsLastAssistant(messages, index) {
  const msg = messages[index];
  if (msg?.role !== "assistant") return false;
  return !messages.slice(index + 1).some((m) => m.role === "assistant");
}

export function shouldHideUserMessage(msg) {
  return msg.role === "user" && (msg.content || "").trim().toLowerCase() === "skip";
}

export function isIssueConfirmMessage(msg) {
  return (
    msg.role === "assistant" &&
    msg.question_type === "issue_confirm" &&
    msg.issue_summary
  );
}

export function hasThreatRecorded(msg) {
  return Boolean(msg.threat_id || msg.threat_summary);
}

export function isAwaitingContext(msg) {
  return msg.chat_state === "awaiting_context" || msg.awaiting_context_for_threat;
}

export function formatEquipmentSelection(eq) {
  return eq.tag ? `${eq.name} (${eq.tag})` : eq.name;
}

export function parseIssueSummaryLines(summary) {
  const lines = (summary || "").split("\n");
  let equipment = "";
  let whatsHappening = "";

  lines.forEach((line) => {
    if (line.includes("**Equipment:**") || line.includes("**Apparatuur:**")) {
      equipment = line.replace(/\*\*Equipment:\*\*|\*\*Apparatuur:\*\*/g, "").trim();
    } else if (line.includes("**Description:**") || line.includes("**Beschrijving:**")) {
      whatsHappening = line.replace(/\*\*Description:\*\*|\*\*Beschrijving:\*\*/g, "").trim();
    }
  });

  return { equipment, whatsHappening };
}

export function splitIssueConfirmContent(content) {
  const chunks = (content || "").split(/\n\n+/);
  return {
    intro: chunks[0] || "",
    promptText: chunks.slice(1).join("\n\n").trim(),
  };
}
