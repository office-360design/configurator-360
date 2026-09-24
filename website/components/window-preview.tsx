"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Image from "next/image";
import type { Locale } from "../lib/i18n";
import { MobileSceneActions } from "./mobile-scene-actions";
import { useMobileDeckSwipe } from "./use-mobile-deck-swipe";

type WindowCommand = {
  requestToken?: string;
  width?: number;
  height?: number;
  glassThickness?: number;
  mode?: "batant" | "oscilo";
  angle?: number;
  exploded?: boolean;
  debug?: boolean;
  debugKeepAluminium?: boolean;
  section?: boolean;
  camera?: { position: [number, number, number]; target: [number, number, number] };
  orbit?: { dx?: number; dy?: number; zoom?: number; pan?: boolean };
  smoothSize?: boolean;
  theme?: "dark" | "light";
};

type PreviewState = {
  width: number;
  height: number;
  glassThickness: number;
  gasket: string;
  bead: string;
  mode: "batant" | "oscilo";
  angle: number;
  exploded: boolean;
  debug: boolean;
  section: boolean;
};

const initialState: PreviewState = {
  width: 0.6,
  height: 0.9,
  glassThickness: 24,
  gasket: "224378",
  bead: "573930",
  mode: "batant",
  angle: 0,
  exploded: false,
  debug: false,
  section: false,
};

function post(frame: HTMLIFrameElement | null, command: WindowCommand) {
  frame?.contentWindow?.postMessage({ type: "window-preview-command", command }, window.location.origin);
}

function currentTheme(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function InstrumentRange({ label, value, min, max, step, unit, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="instrument-range">
      <span>{label}<b>{value}{unit}</b></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function WindowHeroRuntime() {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const lastSignature = useRef("");
  const [mounted, setMounted] = useState(false);
  const [visualReady, setVisualReady] = useState(false);

  const update = useCallback(() => {
    const hero = document.querySelector<HTMLElement>(".spatial-hero");
    if (!hero || !frame.current) return;
    const rect = hero.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < innerHeight;
    frame.current.classList.toggle("is-visible", visible);
    if (!ready.current) return;
    const progress = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height - innerHeight, 1)));

    const theme = currentTheme();
    let width = 0.6;
    let height = 0.9;
    if (progress > 0) width = 0.6 + Math.min(1, progress / 0.28) * 0.4;
    if (progress > 0.3) height = 0.9 + Math.min(1, (progress - 0.3) / 0.24) * 1.2;

    const exploded = progress > 0.58;
    const debug = progress > 0.78;
    const isoT = Math.min(1, Math.max(0, (progress - 0.55) / 0.2));
    const profileT = Math.min(1, Math.max(0, (progress - 0.78) / 0.22));
    const cameraPosition: [number, number, number] = [
      isoT * 1.42,
      0.08 + isoT * 0.92,
      2.55 - isoT * 0.6,
    ];
    const rightProfileCamera: [number, number, number] = [1.35, 1.15, 0.04];
    cameraPosition[0] += (rightProfileCamera[0] - cameraPosition[0]) * profileT;
    cameraPosition[1] += (rightProfileCamera[1] - cameraPosition[1]) * profileT;
    cameraPosition[2] += (rightProfileCamera[2] - cameraPosition[2]) * profileT;
    const cameraTarget: [number, number, number] = [profileT * 0.42, profileT * 0.82, 0];
    const command: WindowCommand = {
      width,
      height,
      smoothSize: true,
      exploded,
      debug,
      debugKeepAluminium: true,
      section: false,
      theme,
      camera: {
        position: cameraPosition,
        target: cameraTarget,
      },
    };
    const signature = `${width.toFixed(3)}|${height.toFixed(3)}|${exploded}|${debug}|${theme}|${Math.round(isoT * 60)}|${Math.round(profileT * 80)}`;
    if (signature !== lastSignature.current) {
      lastSignature.current = signature;
      post(frame.current, command);
    }
  }, []);

  useEffect(() => {
    if (mounted) return;
    const mobile = window.matchMedia("(max-width: 720px), ((max-width: 1050px) and (pointer: coarse))").matches;
    let cancelled = false;
    let idleHandle = 0;
    let queued = false;
    const mountRuntime = () => {
      if (!cancelled) setMounted(true);
    };
    const activate = () => {
      if (!mobile) {
        mountRuntime();
        return;
      }
      if (queued) return;
      queued = true;
      const afterLoad = () => {
        if (cancelled) return;
        if ("requestIdleCallback" in window) {
          idleHandle = window.requestIdleCallback(mountRuntime, { timeout: 1800 });
        } else {
          idleHandle = window.setTimeout(mountRuntime, 180);
        }
      };
      if (document.readyState === "complete") afterLoad();
      else window.addEventListener("load", afterLoad, { once: true });
    };
    const options = { once: true, passive: true } as AddEventListenerOptions;
    window.addEventListener("wheel", activate, options);
    if (!mobile) {
      window.addEventListener("touchstart", activate, options);
      window.addEventListener("pointerdown", activate, options);
    }
    window.addEventListener("keydown", activate, { once: true });
    window.addEventListener("scroll", activate, options);
    return () => {
      cancelled = true;
      if (idleHandle) {
        if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      window.removeEventListener("wheel", activate);
      window.removeEventListener("touchstart", activate);
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", activate);
      window.removeEventListener("scroll", activate);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    let pingTimer = 0;
    const ping = () => frame.current?.contentWindow?.postMessage({ type: "window-preview-ping" }, window.location.origin);
    const syncTheme = () => {
      lastSignature.current = "";
      if (ready.current) {
        post(frame.current, { theme: currentTheme(), debugKeepAluminium: true });
        update();
      } else ping();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "window-preview-ready") {
        ready.current = true;
        setVisualReady(true);
        lastSignature.current = "";
        if (pingTimer) window.clearInterval(pingTimer);
        update();
      }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("themechange", syncTheme);
    window.addEventListener("pageshow", syncTheme);
    ping();
    pingTimer = window.setInterval(ping, 400);
    update();
    return () => {
      if (pingTimer) window.clearInterval(pingTimer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("themechange", syncTheme);
      window.removeEventListener("pageshow", syncTheme);
    };
  }, [mounted, update]);

  return (
    <>
      <div className={`window-hero-poster${visualReady ? " is-hidden" : ""}`} aria-hidden="true">
        <div className="window-hero-poster-object">
          <div className="window-hero-poster-glass" />
          <i className="window-hero-poster-handle" />
        </div>
        <span className="window-hero-poster-dimension dimension-height">1000 mm</span>
        <span className="window-hero-poster-dimension dimension-width">700 mm</span>
      </div>
      {mounted && <iframe
        ref={frame}
        className="window-hero-runtime"
        src="/window-runtime/?preview=1&theme=dark"
        title="Schüco B2-6 scroll sequence"
        tabIndex={-1}
        aria-hidden="true"
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: "window-preview-ping" }, window.location.origin)}
      />}
    </>
  );
}

const SHOWCASE_CAMERA = { position: [0.82, 0.46, 1.27], target: [0.18, -0.14, 0] } as const;
const DETAIL_CAMERA = { position: [0.82, 0.46, 1.27], target: [-0.56, -0.14, 0] } as const;
const SHOWCASE_CAMERA_MOBILE = { position: [0.56, 0.34, 2.22], target: [0.02, -0.12, 0] } as const;
const DETAIL_CAMERA_MOBILE = { position: [0.6, 0.38, 2.18], target: [0.02, -0.1, 0] } as const;

export function WindowConfiguratorPreview({ locale = "en", placement = "showcase" }: { locale?: Locale; placement?: "showcase" | "detail" }) {
  const text = locale === "ro" ? {
    loading: "Se încarcă sistemul nativ B2-6", controls: "Personalizează", hide: "Vezi modelul",
    width: "Lățime", height: "Înălțime", glass: "Sticlă", opening: "Deschidere", gasket: "Garnitură", bead: "Baghetă", side: "Batant", tilt: "Oscilo", explode: "Explodat", debug: "Diagnostic", section: "Secțiune",
  } : locale === "de" ? {
    loading: "Natives B2-6-System wird geladen", controls: "Konfigurieren", hide: "Modell ansehen",
    width: "Breite", height: "Höhe", glass: "Glas", opening: "Öffnung", gasket: "Dichtung", bead: "Glasleiste", side: "Dreh", tilt: "Kipp", explode: "Explodieren", debug: "Diagnose", section: "Querschnitt",
  } : {
    loading: "Loading native B2-6 system", controls: "Customize", hide: "View model",
    width: "Width", height: "Height", glass: "Glass", opening: "Opening", gasket: "Gasket", bead: "Bead", side: "Side hung", tilt: "Tilt", explode: "Explode", debug: "Debug", section: "Section",
  };
  const frame = useRef<HTMLIFrameElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [interaction, setInteraction] = useState(false);
  const [coarse, setCoarse] = useState(true);
  const [state, setState] = useState(initialState);
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const deckSwipe = useMobileDeckSwipe(setCollapsed);
  const drag = useRef<{ x: number; y: number; pointer: number; pan: boolean } | null>(null);
  const initialCamera = placement === "detail" ? DETAIL_CAMERA : SHOWCASE_CAMERA;

  const command = useCallback((next: WindowCommand) => {
    post(frame.current, { ...next, requestToken: String(performance.now()) });
    setState((current) => ({ ...current, ...next } as PreviewState));
  }, []);

  useEffect(() => {
    const element = shell.current;
    if (!element || shouldLoad) return;
    const mobile = window.matchMedia("(max-width: 720px), ((max-width: 1050px) and (pointer: coarse))").matches;
    let cancelled = false;
    let idleHandle = 0;
    let queued = false;
    const loadRuntime = () => {
      if (queued) return;
      queued = true;
      if (!mobile) {
        setShouldLoad(true);
        return;
      }
      const afterLoad = () => {
        if (cancelled) return;
        const mount = () => {
          if (!cancelled) setShouldLoad(true);
        };
        if ("requestIdleCallback" in window) {
          idleHandle = window.requestIdleCallback(mount, { timeout: 1600 });
        } else {
          idleHandle = window.setTimeout(mount, 160);
        }
      };
      if (document.readyState === "complete") afterLoad();
      else window.addEventListener("load", afterLoad, { once: true });
    };
    if (!("IntersectionObserver" in window)) {
      loadRuntime();
      return () => {
        cancelled = true;
        if (idleHandle) {
          if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
          else window.clearTimeout(idleHandle);
        }
      };
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      loadRuntime();
      observer.disconnect();
    }, { rootMargin: mobile ? "100px 0px" : "320px 0px" });
    observer.observe(element);
    return () => {
      cancelled = true;
      if (idleHandle) {
        if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      observer.disconnect();
    };
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;
    let pingTimer = 0;
    const ping = () => frame.current?.contentWindow?.postMessage({ type: "window-preview-ping" }, window.location.origin);
    const media = matchMedia("(pointer: coarse)");
    const mobileViewport = matchMedia("(max-width: 720px), ((max-width: 1050px) and (pointer: coarse))");
    const camera = mobileViewport.matches
      ? (placement === "detail" ? DETAIL_CAMERA_MOBILE : SHOWCASE_CAMERA_MOBILE)
      : initialCamera;
    const mediaFrame = requestAnimationFrame(() => {
      setCoarse(media.matches);
      setInteraction(!media.matches);
      setCollapsed(mobileViewport.matches);
    });
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "window-preview-ready") {
        setReady(true);
        if (pingTimer) window.clearInterval(pingTimer);
        post(frame.current, {
          ...initialState,
          theme: currentTheme(),
          camera,
        });
      }
      if (event.data?.type === "window-preview-state") {
        setState((current) => ({ ...current, ...event.data }));
      }
    };
    const syncTheme = () => post(frame.current, { theme: currentTheme() });
    window.addEventListener("message", onMessage);
    window.addEventListener("themechange", syncTheme);
    window.addEventListener("pageshow", ping);
    ping();
    pingTimer = window.setInterval(ping, 400);
    return () => {
      if (pingTimer) window.clearInterval(pingTimer);
      cancelAnimationFrame(mediaFrame);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("themechange", syncTheme);
      window.removeEventListener("pageshow", ping);
    };
  }, [initialCamera, placement, shouldLoad]);

  useEffect(() => {
    const onScene = (event: Event) => {
      const scene = (event as CustomEvent<{ scene: string }>).detail.scene;
      setVisible(scene === "window");
    };
    window.addEventListener("active-scene-change", onScene);
    return () => window.removeEventListener("active-scene-change", onScene);
  }, []);

  useEffect(() => {
    const element = shell.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (!interaction) return;
      event.preventDefault();
      post(frame.current, { orbit: { zoom: event.deltaY } });
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [interaction]);

  const estimate = 1380 + state.width * state.height * 920 + state.glassThickness * 18 + (state.mode === "oscilo" ? 240 : 140);

  return (
    <div
      ref={shell}
      className={`window-runtime-shell ${interaction ? "interaction-enabled is-interacting" : ""}`}
      style={{ touchAction: interaction ? "none" : "pan-y" }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (!interaction || (event.target as HTMLElement).closest(".window-instrument,.mobile-scene-actions")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId, pan: event.shiftKey || event.button === 2 };
      }}
      onPointerMove={(event) => {
        if (!interaction || !drag.current || drag.current.pointer !== event.pointerId) return;
        const dx = event.clientX - drag.current.x;
        const dy = event.clientY - drag.current.y;
        drag.current.x = event.clientX;
        drag.current.y = event.clientY;
        post(frame.current, { orbit: { dx, dy, pan: drag.current.pan || event.shiftKey } });
      }}
      onPointerUp={() => { drag.current = null; }}
    >
      {shouldLoad && <iframe
        ref={frame}
        className={`window-showcase-runtime ${visible ? "is-visible" : ""}`}
        src="/window-runtime/?preview=1&theme=dark"
        title="Interactive Schüco Window System AW CT 65 B2-6 preview"
        loading="lazy"
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: "window-preview-ping" }, window.location.origin)}
      />}
      {coarse && <MobileSceneActions active={interaction} onToggle={() => setInteraction((value) => !value)} locale={locale} />}
      <div className={`runtime-loading mono-label ${ready ? "ready" : ""}`}>{text.loading}</div>
      <div className={`window-instrument ${collapsed ? "is-collapsed" : ""}`} aria-label="Window profile controls">
        <div className="instrument-identity" {...deckSwipe}>
          <span>AW CT 65</span>
          <strong>B2-6</strong>
          <b className="live-price">EST. €{Math.round(estimate).toLocaleString("en-US")}</b>
          <button className="console-collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>{collapsed ? text.controls : text.hide}</button>
        </div>
        <div className="console-body" aria-hidden={collapsed} inert={collapsed || undefined}>
        <div className="instrument-grid">
          <InstrumentRange label={text.width} value={state.width} min={0.45} max={1} step={0.05} unit=" m" onChange={(width) => command({ width })} />
          <InstrumentRange label={text.height} value={state.height} min={0.45} max={2.2} step={0.05} unit=" m" onChange={(height) => command({ height })} />
          <InstrumentRange label={text.glass} value={state.glassThickness} min={16} max={29} step={1} unit=" mm" onChange={(glassThickness) => command({ glassThickness })} />
          <InstrumentRange label={text.opening} value={state.angle} min={0} max={state.mode === "batant" ? 80 : 15} step={1} unit="°" onChange={(angle) => command({ angle })} />
        </div>
        <div className="component-readout">
          <span><Image src={`/window-runtime/icons/gaskets/${state.gasket}.svg`} width={28} height={22} alt="" />{text.gasket} <b>{state.gasket}</b></span>
          <span><Image src={`/window-runtime/icons/glazing_beads/${state.bead}.svg`} width={28} height={22} alt="" />{text.bead} <b>{state.bead}</b></span>
        </div>
        <div className="instrument-actions">
          <button className={state.mode === "batant" ? "active" : ""} onClick={() => command({ mode: "batant", angle: 0 })}>{text.side}</button>
          <button className={state.mode === "oscilo" ? "active" : ""} onClick={() => command({ mode: "oscilo", angle: 0 })}>{text.tilt}</button>
          <button className={state.exploded ? "active" : ""} onClick={() => command({ exploded: !state.exploded })}>{text.explode}</button>
          <button className={state.debug ? "active" : ""} onClick={() => {
            const enabled = !state.debug;
            command({ debug: enabled });
          }}>{text.debug}</button>
          <button className={state.section ? "active" : ""} onClick={() => {
            const enabled = !state.section;
            command({
              section: enabled,
              camera: enabled
                ? { position: [1.02, 0.58, 1.68], target: [0.7, 0.35, 1.1] }
                : initialCamera,
            });
          }}>{text.section}</button>
        </div>
        </div>
      </div>
    </div>
  );
}
