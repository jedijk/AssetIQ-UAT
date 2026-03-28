import React, { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

export const THEMES = {
  light: {
    name: "Light",
    value: "light",
    icon: "sun"
  },
  dark: {
    name: "Dark", 
    value: "dark",
    icon: "moon"
  }
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("assetiq-theme");
    // If saved theme was assetiq, default to dark
    if (saved === "assetiq") return "dark";
    return saved || "light";
  });

  useEffect(() => {
    localStorage.setItem("assetiq-theme", theme);
    
    // Remove all theme classes
    document.documentElement.classList.remove("theme-light", "theme-dark");
    
    // Add current theme class
    document.documentElement.classList.add(`theme-${theme}`);
    
    // Also set data attribute for CSS targeting
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const cycleTheme = () => {
    const themes = Object.keys(THEMES);
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

export default ThemeContext;
