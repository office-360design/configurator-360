"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../lib/i18n";

type Theme = "light" | "dark";

const themeCopy: Record<Locale, { day: string; night: string; toLight: string; toDark: string }> = {
  en: { day: "Day", night: "Night", toLight: "Switch to light mode", toDark: "Switch to dark mode" },
  ro: { day: "Zi", night: "Noapte", toLight: "Comută la modul luminos", toDark: "Comută la modul întunecat" },
  de: { day: "Tag", night: "Nacht", toLight: "Zum hellen Modus wechseln", toDark: "Zum dunklen Modus wechseln" },
  es: { day: "Día", night: "Noche", toLight: "Cambiar al modo claro", toDark: "Cambiar al modo oscuro" },
  fr: { day: "Jour", night: "Nuit", toLight: "Passer en mode clair", toDark: "Passer en mode sombre" },
  it: { day: "Giorno", night: "Notte", toLight: "Passa alla modalità chiara", toDark: "Passa alla modalità scura" },
};

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle({ locale = "en" }: { locale?: Locale }) {
  const text = themeCopy[locale];
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
      aria-label={theme === "dark" ? text.toLight : text.toDark}
      aria-pressed={theme === "light"}
    >
      <span aria-hidden="true" className="theme-toggle-orbit">
        <i className="theme-sun" />
        <i className="theme-moon" />
      </span>
      <span className="theme-toggle-label">{theme === "dark" ? text.night : text.day}</span>
    </button>
  );
}
