export const EMPTY_TEMPLATE = {
  name: "",
  description: "",
  discipline: "",
  require_signature: false,
  allow_partial_submission: false,
  fields: [],
  tags: [],
  documents: [],
  pendingDocuments: [],
};

export const EMPTY_FIELD = {
  id: "",
  label: "",
  field_type: "text",
  required: false,
  description: "",
  unit: "",
  thresholds: {},
  options: [],
  range_min: null,
  range_max: null,
  range_step: null,
  allowed_extensions: [],
  max_file_size_mb: null,
  linked_equipment: null,
};

export function createEmptyTemplate() {
  return {
    ...EMPTY_TEMPLATE,
    fields: [],
    tags: [],
    documents: [],
    pendingDocuments: [],
  };
}

export function createEmptyField() {
  return { ...EMPTY_FIELD };
}
