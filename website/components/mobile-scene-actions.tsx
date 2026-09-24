"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../lib/i18n";

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function FullscreenGlyph({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {active ? (
        <path d="M8 3v5H3M16 3v5h5M8 21v-5H3m13 5v-5h5" />
      ) : (
        <path d="M9 3H3v6m12-6h6v6M9 21H3v-6m12 6h6v-6" />
      )}
    </svg>
  );
}

export function MobileSceneActions({
  active,
  onToggle,
  locale,
}: {
  active: boolean;
  onToggle: () => void;
  locale: Locale;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const text = locale === "ro"
    ? { interact: "Interacționează 3D", release: "Derulează pagina", enter: "Ecran complet", exit: "Ieși din ecran complet" }
    : locale === "de"
      ? { interact: "3D bedienen", release: "Seite scrollen", enter: "Vollbild", exit: "Vollbild beenden" }
      : { interact: "Interact 3D", release: "Scroll Page", enter: "Enter fullscreen", exit: "Exit fullscreen" };

  useEffect(() => {
    const documentWithPrefix = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    const capabilityFrame = requestAnimationFrame(() => {
      setFullscreenAvailable(Boolean(root.requestFullscreen || root.webkitRequestFullscreen));
    });
    const onFullscreenChange = () => {
      const fullscreenElement = document.fullscreenElement || documentWithPrefix.webkitFullscreenElement;
      setFullscreen(Boolean(fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      cancelAnimationFrame(capabilityFrame);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const documentWithPrefix = document as FullscreenDocument;
    try {
      const currentFullscreen = document.fullscreenElement || documentWithPrefix.webkitFullscreenElement;
      if (currentFullscreen) {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await documentWithPrefix.webkitExitFullscreen?.();
        return;
      }

      const root = document.documentElement as FullscreenElement;
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: "hide" });
      else await root.webkitRequestFullscreen?.();
    } catch { /* The browser may refuse fullscreen; never replace it with a scene-only layout. */ }
  };

  return (
    <div
      className="mobile-scene-actions"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="interaction-toggle"
        aria-pressed={active}
        onClick={(event) => { event.stopPropagation(); onToggle(); }}
      >
        {active ? text.release : text.interact}
      </button>
      {fullscreenAvailable && (
        <button
          type="button"
          className="scene-fullscreen-toggle"
          aria-label={fullscreen ? text.exit : text.enter}
          title={fullscreen ? text.exit : text.enter}
          aria-pressed={fullscreen}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void toggleFullscreen();
          }}
          onClick={(event) => {
            event.stopPropagation();
            // Pointer input is handled on pointerdown so the browser receives
            // the fullscreen request before a scene/deck gesture can cancel it.
            // A detail of zero denotes keyboard/programmatic activation.
            if (event.detail === 0) void toggleFullscreen();
          }}
        >
          <FullscreenGlyph active={fullscreen} />
        </button>
      )}
    </div>
  );
}
