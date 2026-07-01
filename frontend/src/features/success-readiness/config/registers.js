export const REGISTER_TYPES = [
  { id: "training", label: "Training", kpiId: "training_completion" },
  { id: "champion", label: "Champions", kpiId: "champion_program" },
  { id: "procedure", label: "Procedures", kpiId: "procedure_coverage" },
  { id: "governance", label: "Governance", kpiId: "governance_maturity" },
];

export const REGISTER_FIELDS = {
  training: [
    { key: "user", label: "User", metadataKey: "user" },
    { key: "role", label: "Role", metadataKey: "role" },
    { key: "training", label: "Training", metadataKey: "training_name" },
    { key: "completed_at", label: "Completion date", metadataKey: "completed_at", type: "date" },
    { key: "expires_at", label: "Expiry date", metadataKey: "expires_at", type: "date" },
  ],
  champion: [
    { key: "department", label: "Department / area", metadataKey: "department", useTitle: true },
    { key: "champion", label: "Champion", metadataKey: "champion" },
    { key: "backup", label: "Backup champion", metadataKey: "backup_champion" },
  ],
  procedure: [
    { key: "procedure", label: "Procedure", metadataKey: "procedure", useTitle: true },
    { key: "owner", label: "Owner", metadataKey: "owner", useOwner: true },
    { key: "revision", label: "Revision", metadataKey: "revision" },
    { key: "updated_for_assetiq", label: "Updated for AssetIQ", metadataKey: "updated_for_assetiq", type: "checkbox" },
    { key: "review_date", label: "Review date", metadataKey: "review_date", type: "date" },
  ],
  governance: [
    { key: "meeting", label: "Meeting type", metadataKey: "meeting_type", useTitle: true },
    { key: "frequency", label: "Frequency", metadataKey: "frequency" },
    { key: "owner", label: "Owner", metadataKey: "owner", useOwner: true },
    { key: "comments", label: "Comments", metadataKey: "comments", type: "textarea" },
  ],
};

export const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
];
