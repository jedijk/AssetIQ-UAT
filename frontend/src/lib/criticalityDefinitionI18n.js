import { translateEnum } from "./translateEnum";

const DIMENSION_I18N_KEY = {
  safety: "safety",
  production: "production",
  environmental: "environment",
  reputation: "reputation",
};

/** Map workspace exposure dimension to criticality definition field name. */
export const CRITICALITY_FIELD_BY_DIMENSION = {
  safety: "safety",
  production: "production",
  environmental: "environment",
  reputation: "reputation",
};

export function translateCriticalityDimensionLabel(dimension, t) {
  const key = DIMENSION_I18N_KEY[dimension];
  if (!key) return dimension || "";
  const label = t(`definitions.${key}`);
  return label !== `definitions.${key}` ? label : dimension;
}

export function translateCriticalityLabel(row, t) {
  if (!row?.rank) {
    return translateEnum(t, row?.label) || row?.label || "";
  }
  const i18nKey = `definitions.defaultCriticality.${row.rank}.label`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  return translateEnum(t, row.label) || row.label || t("observationWorkspace.levelN", { rank: row.rank });
}

export function translateCriticalityField(row, field, t) {
  const raw = row?.[field] || "";
  if (!row?.rank || !field) return raw;
  const i18nKey = `definitions.defaultCriticality.${row.rank}.${field}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  return raw;
}

export function translateCriticalityDefinitionText({
  criticalityDefs,
  rank,
  field,
  fallbackText,
  t,
}) {
  const row = (criticalityDefs || []).find((d) => d.rank === rank);
  if (row && field) {
    return translateCriticalityField(row, field, t);
  }
  return fallbackText || "";
}
