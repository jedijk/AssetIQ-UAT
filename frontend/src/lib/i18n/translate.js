export function createTranslator(translations, language) {
  return function t(key) {
    const keys = key.split(".");
    let value = translations[language];
    for (const k of keys) {
      value = value?.[k];
    }
    return value || key;
  };
}

