import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { createTranslator } from "../lib/i18n/translate";
import en from "../lib/i18n/en";
import nl from "../lib/i18n/nl";
import de from "../lib/i18n/de";

const LanguageContext = createContext();

const translations = { en, nl, de };

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "de", name: "German", nativeName: "Deutsch" },
];

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem("reliabilityos_language");
    if (saved && SUPPORTED_LANGUAGES.find(l => l.code === saved)) {
      return saved;
    }
    return "en";
  });

  useEffect(() => {
    localStorage.setItem("reliabilityos_language", language);
  }, [language]);

  const t = useMemo(() => createTranslator(translations, language), [language]);

  const toggleLanguage = () => {
    setLanguage(prev => {
      const currentIndex = SUPPORTED_LANGUAGES.findIndex(l => l.code === prev);
      const nextIndex = (currentIndex + 1) % SUPPORTED_LANGUAGES.length;
      return SUPPORTED_LANGUAGES[nextIndex].code;
    });
  };

  const currentLanguage = useMemo(
    () => SUPPORTED_LANGUAGES.find(l => l.code === language) || SUPPORTED_LANGUAGES[0],
    [language]
  );

  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage,
      toggleLanguage,
      t,
      currentLanguage,
      supportedLanguages: SUPPORTED_LANGUAGES,
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

export default LanguageContext;
