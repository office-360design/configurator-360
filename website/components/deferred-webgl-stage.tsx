"use client";

import { useEffect, useState, type ComponentType } from "react";

export function DeferredWebGLStage() {
  const [Stage, setStage] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let idleHandle = 0;
    let loadQueued = false;
    let observer: IntersectionObserver | undefined;
    const mobile = window.matchMedia("(max-width: 720px), ((max-width: 1050px) and (pointer: coarse))").matches;
    const importStage = () => {
      void import("./webgl-stage").then(({ WebGLStage }) => {
        if (!cancelled) setStage(() => WebGLStage);
      });
    };
    const loadStage = () => {
      if (loadQueued) return;
      loadQueued = true;
      if (!mobile) {
        importStage();
        return;
      }
      const afterLoad = () => {
        if (cancelled) return;
        if ("requestIdleCallback" in window) {
          idleHandle = window.requestIdleCallback(importStage, { timeout: 1800 });
        } else {
          idleHandle = window.setTimeout(importStage, 180);
        }
      };
      if (document.readyState === "complete") afterLoad();
      else window.addEventListener("load", afterLoad, { once: true });
    };

    const target = document.querySelector("#configurators, .configurator-sequence, .detail-hero");
    if (!target || !("IntersectionObserver" in window)) loadStage();
    else {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        loadStage();
      }, { rootMargin: mobile ? "120px 0px" : "350px 0px" });
      observer.observe(target);
    }

    return () => {
      cancelled = true;
      if (idleHandle) {
        if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      observer?.disconnect();
    };
  }, []);

  return Stage ? <Stage /> : <div className="webgl-stage webgl-stage-placeholder" aria-hidden="true" />;
}
