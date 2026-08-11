"use client";

import { useEffect, useState, type ComponentType } from "react";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function DeferredWebGLStage() {
  const [Stage, setStage] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const idleWindow = window as IdleWindow;
    let cancelled = false;
    let idleHandle = 0;
    let timerHandle = 0;
    const loadStage = () => {
      void import("./webgl-stage").then(({ WebGLStage }) => {
        if (!cancelled) setStage(() => WebGLStage);
      });
    };

    if (idleWindow.requestIdleCallback) idleHandle = idleWindow.requestIdleCallback(loadStage, { timeout: 650 });
    else timerHandle = window.setTimeout(loadStage, 90);

    return () => {
      cancelled = true;
      if (idleHandle) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timerHandle) window.clearTimeout(timerHandle);
    };
  }, []);

  return Stage ? <Stage /> : <div className="webgl-stage webgl-stage-placeholder" aria-hidden="true" />;
}
