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
  // Dark mode disabled - always use light theme
  const [theme] = useState("light");

  useEffect(() => {
    // Always ensure light theme is applied
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add("theme-light");
    document.documentElement.setAttribute("data-theme", "light");
  }, []);

  // No-op functions since dark mode is disabled
  const setTheme = () => {};
  const cycleTheme = () => {};

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
