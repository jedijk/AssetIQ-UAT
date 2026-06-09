/** Translate backend enum / status labels via `enums.*` i18n keys. */
export function translateEnum(t, value) {
  if (value == null || value === "") return value;
  const key = `enums.${value}`;
  const translated = t(key);
  return translated !== key ? translated : String(value);
}
