"use client";

import { useEffect, useState, type ComponentType } from "react";

export function DeferredWebGLStage() {
  const [Stage, setStage] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const loadStage = () => {
      void import("./webgl-stage").then(({ WebGLStage }) => {
        if (!cancelled) setStage(() => WebGLStage);
      });
    };

    const target = document.querySelector("#configurators, .configurator-sequence");
    if (!target || !("IntersectionObserver" in window)) loadStage();
    else {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        loadStage();
      }, { rootMargin: "350px 0px" });
      observer.observe(target);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return Stage ? <Stage /> : <div className="webgl-stage webgl-stage-placeholder" aria-hidden="true" />;
}
