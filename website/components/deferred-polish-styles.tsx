"use client";

import { useEffect } from "react";

const POLISH_STYLESHEET = "/styles/homepage-polish.css";

export function DeferredPolishStyles() {
  useEffect(() => {
    if (document.querySelector(`link[href="${POLISH_STYLESHEET}"]`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = POLISH_STYLESHEET;
    link.dataset.deferredPolish = "true";

    requestAnimationFrame(() => document.head.appendChild(link));
  }, []);

  return null;
}
