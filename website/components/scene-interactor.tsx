"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { ConfiguratorSlug } from "../lib/configurators";
import type { Locale } from "../lib/i18n";
import { MobileSceneActions } from "./mobile-scene-actions";

export function SceneInteractor({ scene, locale = "en" }: { scene: ConfiguratorSlug; locale?: Locale }) {
  const [enabled, setEnabled] = useState(false);
  const [mobileActions, setMobileActions] = useState(true);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; pointer: number; pan: boolean } | null>(null);
  const text = locale === "ro"
    ? { surface: "Suprafață interactivă 3D" }
    : locale === "de"
      ? { surface: "Interaktive 3D-Ansicht" }
      : { surface: "Interactive 3D surface" };

  useEffect(() => {
    const syncInputMode = () => {
      const isMobileInput = matchMedia("(pointer: coarse)").matches || window.innerWidth <= 1050;
      setMobileActions(isMobileInput);
      setEnabled(!isMobileInput);
    };
    const frame = requestAnimationFrame(syncInputMode);
    window.addEventListener("resize", syncInputMode, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncInputMode);
    };
  }, []);

  function orbit(dx: number, dy: number, pan = false) {
    window.dispatchEvent(new CustomEvent("scene-orbit", { detail: { scene, dx, dy, pan } }));
  }

  return (
    <Fragment>
      <div
        ref={surface}
        className={`scene-interactor ${enabled ? "enabled is-interacting" : ""}`}
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
      </div>
      {mobileActions && <MobileSceneActions active={enabled} onToggle={() => setEnabled((value) => !value)} locale={locale} />}
    </Fragment>
  );
}
