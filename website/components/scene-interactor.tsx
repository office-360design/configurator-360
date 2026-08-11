"use client";

import { useEffect, useRef, useState } from "react";
import type { ConfiguratorSlug } from "../lib/configurators";
import type { Locale } from "../lib/i18n";

export function SceneInteractor({ scene, locale = "en" }: { scene: ConfiguratorSlug; locale?: Locale }) {
  const [enabled, setEnabled] = useState(false);
  const [coarse, setCoarse] = useState(true);
  const drag = useRef<{ x: number; y: number; pointer: number; pan: boolean } | null>(null);
  const text = locale === "ro"
    ? { explore: "Explorează 3D", release: "Revino la derulare", surface: "Suprafață interactivă 3D" }
    : locale === "de"
      ? { explore: "3D erkunden", release: "Scrollen freigeben", surface: "Interaktive 3D-Ansicht" }
      : { explore: "Explore 3D", release: "Release scroll", surface: "Interactive 3D surface" };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const isCoarse = matchMedia("(pointer: coarse)").matches;
      setCoarse(isCoarse);
      setEnabled(!isCoarse);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function orbit(dx: number, dy: number, pan = false) {
    window.dispatchEvent(new CustomEvent("scene-orbit", { detail: { scene, dx, dy, pan } }));
  }

  return (
    <div
      className={`scene-interactor ${enabled ? "enabled" : ""}`}
      style={{ touchAction: enabled ? "none" : "pan-y" }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (!enabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId, pan: event.shiftKey || event.button === 2 };
      }}
      onPointerMove={(event) => {
        if (!enabled || !drag.current || drag.current.pointer !== event.pointerId) return;
        const dx = event.clientX - drag.current.x;
        const dy = event.clientY - drag.current.y;
        drag.current.x = event.clientX; drag.current.y = event.clientY;
        orbit(dx, dy, drag.current.pan || event.shiftKey);
      }}
      onPointerUp={() => { drag.current = null; }}
      onWheel={(event) => {
        if (!enabled) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("scene-orbit", { detail: { scene, zoom: event.deltaY } }));
      }}
      aria-label={`${scene}: ${text.surface}`}
    >
      <span className="interaction-hint">Drag / orbit · Shift / pan · Wheel / zoom</span>
      {coarse && <button type="button" className="interaction-toggle" onClick={(event) => { event.stopPropagation(); setEnabled((value) => !value); }}>{enabled ? text.release : text.explore}</button>}
    </div>
  );
}
