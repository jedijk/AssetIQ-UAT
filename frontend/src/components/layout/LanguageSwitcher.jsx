/**
 * Language Switcher Component
 * Dropdown for selecting UI language with flag icons
 */

import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { Globe, Check } from 'lucide-react';

// Language configuration with native names and flag emojis
const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
];

export function LanguageSwitcher({ variant = 'default', showLabel = true }) {
  const { language, setLanguage } = useLanguage();
  
  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
  
  const handleLanguageChange = (langCode) => {
    setLanguage(langCode);
    // Optionally save to backend
    // translationsAPI.setUserPreference(langCode);
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant === 'ghost' ? 'ghost' : 'outline'} 
          size="sm"
          className="gap-2"
        >
          <Globe className="h-4 w-4" />
          {showLabel && (
            <span className="hidden sm:inline">{currentLang.flag} {currentLang.code.toUpperCase()}</span>
          )}
          {!showLabel && <span>{currentLang.flag}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="text-lg">{lang.flag}</span>
              <span>{lang.nativeName}</span>
            </span>
            {language === lang.code && (
              <Check className="h-4 w-4 text-green-600" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSwitcher;
