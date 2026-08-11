"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ConfiguratorSlug } from "../lib/configurators";
import type { Locale } from "../lib/i18n";
import { HallControls, SolarControls } from "./extended-showcase-controls";

type ControlValue = string | number | boolean;

function emit(scene: ConfiguratorSlug, control: string, value: ControlValue) {
  window.dispatchEvent(new CustomEvent("configurator-control", { detail: { scene, control, value } }));
}

function RangeControl({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="scene-range">
      <span>{label}<b>{value}{unit}</b></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function LegacyShowcaseControls({ scene, locale = "en" }: { scene: ConfiguratorSlug; controls?: string[]; locale?: Locale }) {
  const text = locale === "ro" ? {
    resolving: "Se calculează…", structure: "STRUCTURĂ / LIVE", roof: "ACOPERIȘ PARAMETRIC", environment: "MEDIU / LIVE", controls: "Comenzi +", hide: "Ascunde −",
    length: "Lungime", depth: "Adâncime", wall: "Înălțime pereți", pitch: "Pantă", eaves: "Streașină", graphite: "Grafit", slate: "Ardezie", oxide: "Oxid",
    slopes2: "2 ape", slopes4: "4 ape", slope1: "1 apă", lshape: "Formă L", dormer: "Lucarnă", louver: "Unghi lamele", width: "Lățime",
    open: "Deschis", screen: "Screen", privacy: "Intimitate", glass: "Sticlă", day: "Mod zi", night: "Mod noapte", perimeter: "LED perimetral", spots: "Spoturi integrate", cool: "Rece", ice: "Albastru glaciar", sunset: "Apus",
  } : locale === "de" ? {
    resolving: "Wird berechnet…", structure: "STRUKTUR / LIVE", roof: "PARAMETRISCHES DACH", environment: "UMGEBUNG / LIVE", controls: "Steuerung +", hide: "Ausblenden −",
    length: "Länge", depth: "Tiefe", wall: "Wandhöhe", pitch: "Dachneigung", eaves: "Traufe", graphite: "Graphit", slate: "Schiefer", oxide: "Oxid",
    slopes2: "2 Flächen", slopes4: "4 Flächen", slope1: "1 Fläche", lshape: "L-Form", dormer: "Gaube", louver: "Lamellenwinkel", width: "Breite",
    open: "Offen", screen: "Screen", privacy: "Sichtschutz", glass: "Glas", day: "Tagmodus", night: "Nachtmodus", perimeter: "Umlaufende LED", spots: "Integrierte Spots", cool: "Kaltweiß", ice: "Eisblau", sunset: "Sonnenuntergang",
  } : {
    resolving: "Resolving…", structure: "STRUCTURE / LIVE", roof: "PARAMETRIC ROOF", environment: "ENVIRONMENT / LIVE", controls: "Controls +", hide: "Hide −",
    length: "Length", depth: "Depth", wall: "Wall height", pitch: "Roof pitch", eaves: "Eaves", graphite: "Graphite", slate: "Slate", oxide: "Oxide",
    slopes2: "2 slope", slopes4: "4 slope", slope1: "1 slope", lshape: "L shape", dormer: "Dormer", louver: "Louver tilt", width: "Width",
    open: "Open", screen: "Screen", privacy: "Privacy", glass: "Glass", day: "Day mode", night: "Night mode", perimeter: "Perimeter LED", spots: "Integrated spots", cool: "Cool", ice: "Ice blue", sunset: "Sunset",
  };
  const [collapsed, setCollapsed] = useState(false);
  const [tilt, setTilt] = useState(0);
  const [width, setWidth] = useState(6);
  const [depth, setDepth] = useState(4);
  const [front, setFront] = useState("glass");
  const [night, setNight] = useState(false);
  const [roofLength, setRoofLength] = useState(10);
  const [roofDepth, setRoofDepth] = useState(7);
  const [wallHeight, setWallHeight] = useState(3);
  const [roofPitch, setRoofPitch] = useState(30);
  const [overhang, setOverhang] = useState(0.4);
  const [roofMaterial, setRoofMaterial] = useState("graphite");
  const [roofShape, setRoofShape] = useState("lshape");
  const [led, setLed] = useState(true);
  const [ledColor, setLedColor] = useState("#fff1b4");
  const [spotlights, setSpotlights] = useState(4);
  const [price, setPrice] = useState<{ total: number; currency: string } | null>(null);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 720px)");
    const frame = window.requestAnimationFrame(() => setCollapsed(mobile.matches));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onPrice = (event: Event) => {
      const detail = (event as CustomEvent<{ scene: ConfiguratorSlug; total: number; currency: string }>).detail;
      if (detail.scene === scene) setPrice({ total: detail.total, currency: detail.currency });
    };
    window.addEventListener("configurator-price", onPrice);
    const timer = window.setTimeout(() => emit(scene, "requestPrice", true), 120);
    return () => { window.clearTimeout(timer); window.removeEventListener("configurator-price", onPrice); };
  }, [scene]);

  const formattedPrice = price ? new Intl.NumberFormat(price.currency === "RON" ? "ro-RO" : "en-US", {
    style: "currency", currency: price.currency, maximumFractionDigits: 0,
  }).format(price.total) : text.resolving;

  useEffect(() => {
    if (scene !== "pergola") return;
    const sync = () => {
      const isNight = document.documentElement.dataset.theme !== "light";
      setNight(isNight);
      setTilt(isNight ? 34 : 0);
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener("themechange", sync);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("themechange", sync); };
  }, [scene]);

  if (scene === "window") return null;

  if (scene === "roof") {
    const materials = [["graphite", text.graphite], ["slate", text.slate], ["oxide", text.oxide]];
    const shapes = [["gable", text.slopes2], ["hip", text.slopes4], ["shed", text.slope1], ["lshape", text.lshape], ["dormer", text.dormer]];
    return (
      <div className={`scene-controls scene-controls-panel instrument-console roof-controls ${collapsed ? "is-collapsed" : ""}`} aria-label="Roof preview controls">
        <div className="console-header"><span>{text.structure}</span><b>{text.roof}</b><strong className="live-price">LIVE {formattedPrice}</strong><button className="console-collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>{collapsed ? text.controls : text.hide}</button></div>
        <div className="console-body">
        <div className="scene-control-grid">
          <RangeControl label={text.length} value={roofLength} min={7} max={14} step={0.5} unit=" m" onChange={(value) => { setRoofLength(value); emit(scene, "length", value); }} />
          <RangeControl label={text.depth} value={roofDepth} min={5} max={10} step={0.5} unit=" m" onChange={(value) => { setRoofDepth(value); emit(scene, "depth", value); }} />
          <RangeControl label={text.wall} value={wallHeight} min={2.2} max={4.5} step={0.1} unit=" m" onChange={(value) => { setWallHeight(value); emit(scene, "wallHeight", value); }} />
          <RangeControl label={text.pitch} value={roofPitch} min={10} max={55} step={1} unit="°" onChange={(value) => { setRoofPitch(value); emit(scene, "pitch", value); }} />
          <RangeControl label={text.eaves} value={overhang} min={0.1} max={1} step={0.05} unit=" m" onChange={(value) => { setOverhang(value); emit(scene, "overhang", value); }} />
        </div>
        <div className="scene-preset-row shape-row" aria-label="Roof shape">
          {shapes.map(([value, label]) => <button key={value} className={roofShape === value ? "active" : ""} onClick={() => { setRoofShape(value); emit(scene, "shape", value); }}>{label}</button>)}
        </div>
        <div className="scene-preset-row material-row" aria-label="Roof material">
          {materials.map(([value, label]) => <button key={value} className={roofMaterial === value ? "active" : ""} onClick={() => { setRoofMaterial(value); emit(scene, "material", value); }}>{label}</button>)}
        </div>
        </div>
      </div>
    );
  }

  const frontOptions = [["none", text.open], ["screen", text.screen], ["privacy-wall", text.privacy], ["glass", text.glass]];
  const ledColors = [
    ["#ffca73", "2700K"], ["#ffe5a3", "3000K"], ["#fff1cf", "4000K"],
    ["#dbeeff", text.cool], ["#86b8ff", text.ice], ["#ff8f77", text.sunset],
  ];
  return (
    <div className={`scene-controls scene-controls-panel instrument-console pergola-controls ${collapsed ? "is-collapsed" : ""}`} aria-label="Pergola preview controls">
      <div className="console-header"><span>{text.environment}</span><b>PERGOLA 6 × 4 M</b><strong className="live-price">LIVE {formattedPrice}</strong><button className="console-collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>{collapsed ? text.controls : text.hide}</button></div>
      <div className="console-body">
      <div className="scene-control-grid">
        <RangeControl label={text.louver} value={tilt} min={0} max={80} step={1} unit="°" onChange={(value) => { setTilt(value); emit(scene, "tilt", value); }} />
        <RangeControl label={text.width} value={width} min={4} max={10} step={0.25} unit=" m" onChange={(value) => { setWidth(value); emit(scene, "width", value); }} />
        <RangeControl label={text.depth} value={depth} min={3} max={10} step={0.25} unit=" m" onChange={(value) => { setDepth(value); emit(scene, "depth", value); }} />
      </div>
      <div className="scene-preset-row" aria-label="Pergola front side">
        {frontOptions.map(([value, label]) => <button key={value} className={front === value ? "active" : ""} onClick={() => { setFront(value); emit(scene, "front", value); }}>{label}</button>)}
        <button className={`night-control ${night ? "active" : ""}`} onClick={() => {
          const next = !night;
          setNight(next);
          setTilt(next ? 34 : 0);
          emit(scene, "night", next);
          const theme = next ? "dark" : "light";
          document.documentElement.dataset.theme = theme;
          localStorage.setItem("360-theme", theme);
          window.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
        }}>{night ? text.day : text.night}</button>
      </div>
      {night && <div className="lighting-console">
        <button className={`led-switch ${led ? "active" : ""}`} onClick={() => { const next = !led; setLed(next); emit(scene, "led", next); }}><i />{text.perimeter}</button>
        <div className="led-colors" aria-label="LED color">
          {ledColors.map(([color, label]) => <button key={color} className={ledColor === color ? "active" : ""} title={label} style={{ "--led-color": color } as CSSProperties} onClick={() => { setLedColor(color); emit(scene, "ledColor", color); }}><i /><span>{label}</span></button>)}
        </div>
        <div className="spotlight-stepper"><span>{text.spots}</span><button onClick={() => { const next = Math.max(0, spotlights - 1); setSpotlights(next); emit(scene, "spotlights", next); }}>−</button><b>{spotlights}</b><button onClick={() => { const next = Math.min(8, spotlights + 1); setSpotlights(next); emit(scene, "spotlights", next); }}>+</button></div>
      </div>}
      </div>
    </div>
  );
}

export function ShowcaseControls(props: { scene: ConfiguratorSlug; controls?: string[]; locale?: Locale }) {
  if (props.scene === "hall") return <HallControls locale={props.locale ?? "en"} />;
  if (props.scene === "solar") return <SolarControls locale={props.locale ?? "en"} />;
  return <LegacyShowcaseControls {...props} />;
}
