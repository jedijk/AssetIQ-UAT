export function createTranslator(translations, language) {
  return function t(key, params) {
    const keys = key.split(".");
    let value = translations[language];
    for (const k of keys) {
      value = value?.[k];
    }
    if (typeof value !== "string") {
      return value ?? key;
    }
    if (!params || typeof params !== "object") {
      return value;
    }
    return value.replace(/\{(\w+)\}/g, (_, name) => {
      const replacement = params[name];
      return replacement !== undefined && replacement !== null ? String(replacement) : `{${name}}`;
    });
  };
}

