"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const frame = requestAnimationFrame(() => setTheme(currentTheme()));
    const sync = () => setTheme(currentTheme());
    window.addEventListener("themechange", sync);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("themechange", sync); };
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("360-theme", nextTheme);
    setTheme(nextTheme);
    window.dispatchEvent(new CustomEvent("themechange", { detail: nextTheme }));
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "light"}
    >
      <span aria-hidden="true" className="theme-toggle-orbit">
        <i className="theme-sun" />
        <i className="theme-moon" />
      </span>
      <span className="theme-toggle-label">{theme === "dark" ? "Night" : "Day"}</span>
    </button>
  );
}
