"use client";

import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ConfiguratorSlug } from "../lib/configurators";
import type { Locale } from "../lib/i18n";
import { modulePresets } from "../lib/scenes/solar-state.js";

type SolarMetrics = {
  requestedPanels: number;
  placedPanels: number;
  systemKwp: number;
  modulePowerW: number;
  fitWarning: string;
};

const defaultSolarMetrics: SolarMetrics = {
  requestedPanels: 12,
  placedPanels: 12,
  systemKwp: 5.7,
  modulePowerW: 475,
  fitWarning: "",
};

const dispatch = (
  scene: ConfiguratorSlug,
  control: string,
  value: string | number | boolean,
) =>
  window.dispatchEvent(
    new CustomEvent("configurator-control", {
      detail: { scene, control, value },
    }),
  );

const bearingCardinal = (degrees: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((degrees % 360) + 360) % 360) / 45) % 8];

function Range({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="scene-range">
      <span>
        {label}
        <b>
          {value}
          {unit}
        </b>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

const copy = {
  en: {
    controls: "Controls +",
    hide: "Hide −",
    dimensions: "Structure",
    assembly: "Layers",
    length: "Length",
    width: "Span",
    height: "Eaves height",
    pitch: "Roof pitch",
    spacing: "Target frame spacing",
    doorW: "Door width",
    doorH: "Door height",
    light: "Light",
    standard: "Standard",
    heavy: "Heavy",
    cladding: "Cladding",
    secondary: "Secondary beams",
    explode: "Explode",
    assemble: "Assemble",
    site: "Site & sun",
    roof: "Roof & PV",
    energy: "Energy",
    address: "Search a Romanian project address",
    locate: "Load context",
    locating: "Searching…",
    chooseMap: "Choose on map",
    mapTitle: "Choose exact project location",
    mapHelp:
      "Click the map to place the configured roof and load its real surroundings.",
    loadingContext: "Loading terrain and nearby buildings…",
    contextReady: "3D geographic context loaded",
    contextError: "Context unavailable — choose another point",
    date: "Date & season",
    today: "Today",
    hour: "Time of day",
    bearing: "Roof front bearing",
    spring: "Spring",
    summer: "Summer",
    autumn: "Autumn",
    winter: "Winter",
    day: "Day mode",
    night: "Night preview",
    roofLength: "Roof length",
    roofDepth: "Roof depth",
    panels: "Requested panels",
    columns: "Columns",
    module: "Solar module",
    fitWarning: (placed: number, requested: number) =>
      `Only ${placed} of ${requested} requested panels fit with the current roof, margin and grid settings.`,
    gable: "2 slopes",
    hip: "4 slopes",
    shed: "1 slope",
    best: "Auto best",
    front: "Front",
    back: "Back",
    both: "Both",
    connection: "Grid connection",
    singlePhase: "Single-phase",
    threePhase: "Three-phase",
    bill: "Monthly bill",
    tariff: "Energy tariff",
    consumption: "Consumption profile",
    away: "Away all day",
    partial: "Partly home",
    home: "Someone home",
    optimized: "Solar optimized",
    battery: "LiFePO₄ storage",
    autoBattery: "Auto-size storage",
    capacity: "Storage size",
    analytics: "Open energy analytics",
    nudge: "House position in loaded context",
    position: "Position",
    nudgeStep: "Nudge step",
    east: "East",
    west: "West",
    north: "North",
    south: "South",
    close: "Close",
    production: "Production vs. consumption",
    generation: "PV generation",
    demand: "Home consumption",
    autonomy: "Self-sufficiency",
    gridIn: "Grid import",
    gridOut: "Grid export",
    installed: "Installed power",
    fitted: "Panels fitted",
    average: "Average production/day",
  },
  ro: {
    controls: "Comenzi +",
    hide: "Ascunde −",
    dimensions: "Structură",
    assembly: "Straturi",
    length: "Lungime",
    width: "Deschidere",
    height: "Înălțime streașină",
    pitch: "Pantă acoperiș",
    spacing: "Distanță țintă între cadre",
    doorW: "Lățime ușă",
    doorH: "Înălțime ușă",
    light: "Ușoară",
    standard: "Standard",
    heavy: "Grea",
    cladding: "Închideri",
    secondary: "Grinzi secundare",
    explode: "Explodează",
    assemble: "Asamblează",
    site: "Locație & soare",
    roof: "Acoperiș & PV",
    energy: "Energie",
    address: "Caută adresa proiectului din România",
    locate: "Încarcă zona",
    locating: "Se caută…",
    chooseMap: "Alege pe hartă",
    mapTitle: "Alege locația exactă a proiectului",
    mapHelp:
      "Apasă pe hartă pentru a poziționa acoperișul și a încărca împrejurimile reale.",
    loadingContext: "Se încarcă relieful și clădirile din apropiere…",
    contextReady: "Contextul geografic 3D este încărcat",
    contextError: "Context indisponibil — alege alt punct",
    date: "Dată și anotimp",
    today: "Astăzi",
    hour: "Ora zilei",
    bearing: "Orientarea fațadei acoperișului",
    spring: "Primăvară",
    summer: "Vară",
    autumn: "Toamnă",
    winter: "Iarnă",
    day: "Mod zi",
    night: "Previzualizare noapte",
    roofLength: "Lungime acoperiș",
    roofDepth: "Adâncime acoperiș",
    panels: "Panouri solicitate",
    columns: "Coloane",
    module: "Modul fotovoltaic",
    fitWarning: (placed: number, requested: number) =>
      `Doar ${placed} din cele ${requested} de panouri solicitate încap pe acoperiș cu setările actuale pentru margini și grilă.`,
    gable: "2 ape",
    hip: "4 ape",
    shed: "1 apă",
    best: "Automat",
    front: "Față",
    back: "Spate",
    both: "Ambele",
    connection: "Racordare la rețea",
    singlePhase: "Monofazat",
    threePhase: "Trifazat",
    bill: "Factură lunară",
    tariff: "Tarif energie",
    consumption: "Profil de consum",
    away: "Plecat toată ziua",
    partial: "Parțial acasă",
    home: "Cineva acasă",
    optimized: "Optimizat solar",
    battery: "Stocare LiFePO₄",
    autoBattery: "Dimensionare automată",
    capacity: "Capacitate baterie",
    analytics: "Deschide analiza energetică",
    nudge: "Poziția casei în contextul încărcat",
    position: "Poziție",
    nudgeStep: "Pas de deplasare",
    east: "Est",
    west: "Vest",
    north: "Nord",
    south: "Sud",
    close: "Închide",
    production: "Producție și consum",
    generation: "Producție PV",
    demand: "Consum casnic",
    autonomy: "Autonomie",
    gridIn: "Import rețea",
    gridOut: "Export rețea",
    installed: "Putere instalată",
    fitted: "Panouri montate",
    average: "Producție medie/zi",
  },
  de: {
    controls: "Steuerung +",
    hide: "Ausblenden −",
    dimensions: "Tragwerk",
    assembly: "Ebenen",
    length: "Länge",
    width: "Spannweite",
    height: "Traufhöhe",
    pitch: "Dachneigung",
    spacing: "Ziel-Rahmenabstand",
    doorW: "Torbreite",
    doorH: "Torhöhe",
    light: "Leicht",
    standard: "Standard",
    heavy: "Schwer",
    cladding: "Gebäudehülle",
    secondary: "Sekundärträger",
    explode: "Explodieren",
    assemble: "Montieren",
    site: "Standort & Sonne",
    roof: "Dach & PV",
    energy: "Energie",
    address: "Rumänische Projektadresse suchen",
    locate: "Umgebung laden",
    locating: "Suche…",
    chooseMap: "Auf Karte wählen",
    mapTitle: "Exakten Projektstandort wählen",
    mapHelp:
      "Klicken Sie auf die Karte, um das Dach zu platzieren und die reale Umgebung zu laden.",
    loadingContext: "Gelände und umliegende Gebäude werden geladen…",
    contextReady: "Geografischer 3D-Kontext geladen",
    contextError: "Kontext nicht verfügbar — anderen Punkt wählen",
    date: "Datum & Jahreszeit",
    today: "Heute",
    hour: "Tageszeit",
    bearing: "Ausrichtung der Dachfront",
    spring: "Frühling",
    summer: "Sommer",
    autumn: "Herbst",
    winter: "Winter",
    day: "Tagmodus",
    night: "Nachtvorschau",
    roofLength: "Dachlänge",
    roofDepth: "Dachtiefe",
    panels: "Gewünschte Module",
    columns: "Spalten",
    module: "Solarmodul",
    fitWarning: (placed: number, requested: number) =>
      `Nur ${placed} der ${requested} gewünschten Module passen mit den aktuellen Dach-, Rand- und Rastereinstellungen.`,
    gable: "Satteldach",
    hip: "Walmdach",
    shed: "Pultdach",
    best: "Automatisch",
    front: "Vorn",
    back: "Hinten",
    both: "Beide",
    connection: "Netzanschluss",
    singlePhase: "Einphasig",
    threePhase: "Dreiphasig",
    bill: "Monatsrechnung",
    tariff: "Stromtarif",
    consumption: "Verbrauchsprofil",
    away: "Ganztags abwesend",
    partial: "Teilweise zu Hause",
    home: "Jemand zu Hause",
    optimized: "Solar optimiert",
    battery: "LiFePO₄-Speicher",
    autoBattery: "Speicher automatisch",
    capacity: "Speichergröße",
    analytics: "Energieanalyse öffnen",
    nudge: "Hausposition im geladenen Kontext",
    position: "Position",
    nudgeStep: "Verschiebungsschritt",
    east: "Ost",
    west: "West",
    north: "Nord",
    south: "Süd",
    close: "Schließen",
    production: "Erzeugung und Verbrauch",
    generation: "PV-Erzeugung",
    demand: "Hausverbrauch",
    autonomy: "Autarkie",
    gridIn: "Netzbezug",
    gridOut: "Einspeisung",
    installed: "Installierte Leistung",
    fitted: "Montierte Module",
    average: "Mittlere Tagesproduktion",
  },
} as const;

export function HallControls({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<"dimensions" | "assembly">("dimensions");
  const [state, setState] = useState({
    length: 24,
    width: 12,
    height: 5,
    pitch: 12,
    spacing: 6,
    doorWidth: 4,
    doorHeight: 4,
    preset: "standard",
    cladding: true,
    secondary: true,
    exploded: false,
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (matchMedia("(max-width: 720px)").matches) setCollapsed(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const set = (
    key: keyof typeof state,
    value: string | number | boolean,
    control = key,
  ) => {
    setState((current) => ({ ...current, [key]: value }));
    dispatch("hall", String(control), value);
  };
  return (
    <div
      className={`scene-controls scene-controls-panel instrument-console hall-controls ${collapsed ? "is-collapsed" : ""}`}
    >
      <div className="console-header">
        <span>STRUCTURE / LIVE</span>
        <b>INDUSTRIAL HALL</b>
        <strong className="console-metric">
          {Math.ceil(state.length / state.spacing) + 1} FRAMES
        </strong>
        <button
          className="console-collapse"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? t.controls : t.hide}
        </button>
      </div>
      <div className="console-body">
        <div className="console-tabs">
          <button
            className={tab === "dimensions" ? "active" : ""}
            onClick={() => setTab("dimensions")}
          >
            {t.dimensions}
          </button>
          <button
            className={tab === "assembly" ? "active" : ""}
            onClick={() => setTab("assembly")}
          >
            {t.assembly}
          </button>
        </div>
        {tab === "dimensions" ? (
          <>
            <div className="scene-control-grid">
              <Range
                label={t.length}
                value={state.length}
                min={12}
                max={60}
                step={0.5}
                unit=" m"
                onChange={(v) => set("length", v)}
              />
              <Range
                label={t.width}
                value={state.width}
                min={6}
                max={30}
                step={0.5}
                unit=" m"
                onChange={(v) => set("width", v)}
              />
              <Range
                label={t.height}
                value={state.height}
                min={3}
                max={12}
                step={0.25}
                unit=" m"
                onChange={(v) => set("height", v)}
              />
              <Range
                label={t.pitch}
                value={state.pitch}
                min={5}
                max={25}
                step={1}
                unit="°"
                onChange={(v) => set("pitch", v)}
              />
              <Range
                label={t.spacing}
                value={state.spacing}
                min={3}
                max={8}
                step={0.25}
                unit=" m"
                onChange={(v) => set("spacing", v)}
              />
            </div>
            <div className="scene-preset-row">
              {[
                ["light", t.light],
                ["standard", t.standard],
                ["heavy", t.heavy],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={state.preset === v ? "active" : ""}
                  onClick={() => set("preset", v)}
                >
                  {l}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="scene-control-grid">
              <Range
                label={t.doorW}
                value={state.doorWidth}
                min={2.5}
                max={Math.min(8, Math.max(2.5, state.width - 1.2))}
                step={0.25}
                unit=" m"
                onChange={(v) => set("doorWidth", v)}
              />
              <Range
                label={t.doorH}
                value={state.doorHeight}
                min={2.5}
                max={Math.min(6, Math.max(2.5, state.height - 0.2))}
                step={0.25}
                unit=" m"
                onChange={(v) => set("doorHeight", v)}
              />
            </div>
            <div className="scene-preset-row hall-layer-row">
              <button
                className={state.cladding ? "active" : ""}
                onClick={() => set("cladding", !state.cladding)}
              >
                {t.cladding}
              </button>
              <button
                className={state.secondary ? "active" : ""}
                onClick={() => set("secondary", !state.secondary)}
              >
                {t.secondary}
              </button>
              <button
                className={state.exploded ? "active" : ""}
                onClick={() => set("exploded", !state.exploded)}
              >
                {state.exploded ? t.assemble : t.explode}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type LocationResult = { display_name: string; lat: string; lon: string };
const tileX = (lon: number, zoom: number) => ((lon + 180) / 360) * 2 ** zoom;
const tileY = (lat: number, zoom: number) =>
  ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** zoom;
const tileLon = (x: number, zoom: number) => (x / 2 ** zoom) * 360 - 180;
const tileLat = (y: number, zoom: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI;

function SolarMapPicker({
  locale,
  center,
  onClose,
  onSelect,
}: {
  locale: Locale;
  center: { lat: number; lon: number };
  onClose: () => void;
  onSelect: (result: LocationResult) => void;
}) {
  const t = copy[locale];
  const [zoom, setZoom] = useState(14);
  const [point, setPoint] = useState(center);
  const [resolving, setResolving] = useState(false);
  const cx = tileX(center.lon, zoom),
    cy = tileY(center.lat, zoom);
  const tiles = [] as Array<{
    x: number;
    y: number;
    left: number;
    top: number;
  }>;
  for (let y = Math.floor(cy) - 2; y <= Math.floor(cy) + 2; y += 1)
    for (let x = Math.floor(cx) - 2; x <= Math.floor(cx) + 2; x += 1)
      tiles.push({
        x,
        y,
        left: (x - cx) * 256 + 320,
        top: (y - cy) * 256 + 190,
      });
  async function choosePoint(next: { lat: number; lon: number }) {
    setPoint(next);
    setResolving(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${next.lat}&lon=${next.lon}&zoom=18&addressdetails=1`,
        {
          headers: {
            "Accept-Language":
              locale === "ro" ? "ro,en" : locale === "de" ? "de,en" : "en,ro",
          },
        },
      );
      const result = await response.json();
      onSelect({
        display_name:
          result.display_name ||
          `${next.lat.toFixed(5)}, ${next.lon.toFixed(5)}`,
        lat: String(next.lat),
        lon: String(next.lon),
      });
    } catch {
      onSelect({
        display_name: `${next.lat.toFixed(5)}, ${next.lon.toFixed(5)}`,
        lat: String(next.lat),
        lon: String(next.lon),
      });
    } finally {
      setResolving(false);
    }
  }
  function choose(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) * 640) / rect.width,
      py = ((event.clientY - rect.top) * 380) / rect.height;
    void choosePoint({
      lon: tileLon(cx + (px - 320) / 256, zoom),
      lat: tileLat(cy + (py - 190) / 256, zoom),
    });
  }
  return (
    <div
      className="solar-map-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t.mapTitle}
    >
      <button
        className="energy-modal-backdrop"
        onClick={onClose}
        aria-label={t.close}
      />
      <div className="solar-map-panel">
        <header>
          <div>
            <span className="mono-label">GEOGRAPHIC SOLAR CONTEXT</span>
            <h2>{t.mapTitle}</h2>
            <p>{t.mapHelp}</p>
          </div>
          <button onClick={onClose}>{t.close} ×</button>
        </header>
        <div
          className="solar-map-canvas"
          onClick={choose}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void choosePoint(point);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={t.mapHelp}
        >
          {tiles.map((tile) => (
            // OpenStreetMap tiles are dynamic external images and bypass the app image pipeline.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${tile.x}/${tile.y}/${zoom}`}
              alt=""
              draggable={false}
              src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
          <i
            className="solar-map-pin"
            style={{
              left: 320 + (tileX(point.lon, zoom) - cx) * 256,
              top: 190 + (tileY(point.lat, zoom) - cy) * 256,
            }}
          />
          {resolving && <span className="map-resolving">{t.locating}</span>}
        </div>
        <footer>
          <span>© OpenStreetMap contributors</span>
          <div>
            <button onClick={() => setZoom((value) => Math.max(10, value - 1))}>
              −
            </button>
            <b>Z{zoom}</b>
            <button onClick={() => setZoom((value) => Math.min(18, value + 1))}>
              +
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function EnergyModal({
  locale,
  panelCount,
  systemKwp,
  battery,
  profile,
  bill,
  tariff,
  hour,
  date,
  bearing,
  onClose,
}: {
  locale: Locale;
  panelCount: number;
  systemKwp: number;
  battery: number;
  profile: string;
  bill: number;
  tariff: number;
  hour: number;
  date: string;
  bearing: number;
  onClose: () => void;
}) {
  const t = copy[locale];
  const month = Math.max(1, Math.min(12, Number(date.slice(5, 7)) || 6));
  const seasonalYield = [0.54, 0.64, 0.82, 1, 1.12, 1.2, 1.22, 1.15, 0.98, 0.78, 0.6, 0.5][month - 1];
  const southAlignment = (1 + Math.cos(((bearing - 180) * Math.PI) / 180)) / 2;
  const orientationYield = 0.72 + southAlignment * 0.28;
  const generation = systemKwp * 3.55 * seasonalYield * orientationYield;
  const profileDemand =
    profile === "optimized"
      ? 10.8
      : profile === "home"
        ? 12.4
        : profile === "away"
          ? 9.6
          : 11.2;
  const billedDemand = tariff > 0 ? bill / tariff / 30.4375 : profileDemand;
  const demand = profileDemand * .42 + billedDemand * .58;
  const autonomy = Math.min(
    96,
    Math.round(((generation + battery * 0.42) / demand) * 64),
  );
  const gridIn = Math.max(0, demand * (1 - autonomy / 100));
  const gridOut = Math.max(0, generation - demand * 0.72);
  const productionPoints = Array.from(
    { length: 25 },
    (_, h) =>
      `${h * 40},${180 - Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) * 145}`,
  ).join(" ");
  const demandPoints = Array.from(
    { length: 25 },
    (_, h) =>
      `${h * 40},${150 - (Math.exp(-((h - 8) ** 2) / 8) * 50 + Math.exp(-((h - 19) ** 2) / 10) * 72)}`,
  ).join(" ");
  const availablePoints = Array.from(
    { length: 25 },
    (_, h) => {
      const pv = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
      const stored = Math.min(1, pv * 1.28 + battery * .035);
      return `${h * 40},${180 - stored * 145}`;
    },
  ).join(" ");
  const timeX = Math.max(0, Math.min(960, hour * 40));
  return (
    <div
      className="energy-modal"
      role="dialog"
      aria-label={t.production}
    >
      <button
        className="energy-modal-backdrop"
        aria-label={t.close}
        onClick={onClose}
      />
      <div className="energy-modal-panel">
        <header>
          <div>
            <span className="mono-label">ENERGY / LIVE MODEL</span>
            <h2>{t.production}</h2>
            <p className="energy-date-line">{date} · {String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round((hour % 1) * 60)).padStart(2, "0")}</p>
          </div>
          <button onClick={onClose}>{t.close} ×</button>
        </header>
        <div className="energy-kpis">
          {[
            [t.generation, `${generation.toFixed(1)} kWh/day`],
            [t.demand, `${demand.toFixed(1)} kWh/day`],
            [t.autonomy, `${autonomy}%`],
            [t.gridIn, `${gridIn.toFixed(1)} kWh`],
            [t.gridOut, `${gridOut.toFixed(1)} kWh`],
          ].map(([label, value]) => (
            <span key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </span>
          ))}
        </div>
        <div className="energy-chart">
          <svg viewBox="0 0 960 200" role="img" aria-label={t.production}>
            <path d="M0 180H960M0 120H960M0 60H960" />
            <polyline className="available-line" points={availablePoints} />
            <polyline className="production-line" points={productionPoints} />
            <polyline className="demand-line" points={demandPoints} />
            <line className="current-time-line" x1={timeX} x2={timeX} y1="0" y2="180" />
          </svg>
          <div>
            <span className="pv-legend">
              <i />
              PV
            </span>
            <span className="load-legend">
              <i />
              LOAD
            </span>
            <span className="available-legend">
              <i />
              AVAILABLE + STORAGE
            </span>
          </div>
        </div>
        <div className="energy-summary">
          <span>
            <small>{t.installed}</small>
            <b>{systemKwp.toFixed(2)} kWp</b>
          </span>
          <span>
            <small>{t.fitted}</small>
            <b>{panelCount}</b>
          </span>
          <span>
            <small>{t.average}</small>
            <b>{generation.toFixed(1)} kWh</b>
          </span>
        </div>
      </div>
    </div>
  );
}

export function SolarControls({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<"site" | "roof" | "energy">("site");
  const [modal, setModal] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState("45.63317°N · 25.60906°E");
  const [locationPoint, setLocationPoint] = useState({
    lat: 45.63317,
    lon: 25.60906,
  });
  const [nudge, setNudge] = useState({ east: 0, north: 0, step: 1 });
  const [suggestions, setSuggestions] = useState<LocationResult[]>([]);
  const [addressResolved, setAddressResolved] = useState(false);
  const [contextStatus, setContextStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [solarMetrics, setSolarMetrics] =
    useState<SolarMetrics>(defaultSolarMetrics);
  const [s, setS] = useState(() => {
    const date = (() => {
      try {
        const parts = Object.fromEntries(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Bucharest",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
            .formatToParts(new Date())
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value]),
        );
        return `${parts.year}-${parts.month}-${parts.day}`;
      } catch {
        return new Date().toISOString().slice(0, 10);
      }
    })();
    const month = Number(date.slice(5, 7));
    const season =
      month >= 3 && month <= 5
        ? "spring"
        : month >= 6 && month <= 8
          ? "summer"
          : month >= 9 && month <= 11
            ? "autumn"
            : "winter";
    return {
      address: "",
      date,
      hour: 12,
      bearing: 325,
      season,
      night: false,
      shape: "gable",
      length: 10,
      depth: 7,
      pitch: 30,
      panels: 12,
      columns: 4,
      modulePreset: "standard475",
      side: "best",
      phase: "single",
      bill: 400,
      tariff: 1.3,
      profile: "partial",
      battery: true,
      autoBattery: true,
      capacity: 5,
    };
  });
  useEffect(() => {
    let defaultLocationRequested = false;
    const requestDefaultLocation = () => {
      if (defaultLocationRequested) return;
      defaultLocationRequested = true;
      dispatch("solar", "bearing", 325);
      dispatch(
        "solar",
        "location",
        JSON.stringify({
          lat: 45.63317,
          lon: 25.60906,
          label: "45.63317, 25.60906",
        }),
      );
    };
    const sync = () => {
      const night = document.documentElement.dataset.theme !== "light";
      setS((x) => ({ ...x, night }));
      dispatch("solar", "night", night);
    };
    const status = (event: Event) =>
      setContextStatus(
        ((event as CustomEvent).detail?.status ||
          "idle") as typeof contextStatus,
      );
    const metrics = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const next = detail?.solarMetrics ?? detail;
      if (!next || typeof next.placedPanels !== "number") return;
      setSolarMetrics({
        requestedPanels: Number(next.requestedPanels) || 0,
        placedPanels: Number(next.placedPanels) || 0,
        systemKwp: Number(next.systemKwp) || 0,
        modulePowerW: Number(next.modulePowerW) || 475,
        fitWarning: String(next.fitWarning || ""),
      });
    };
    const frame = requestAnimationFrame(() => {
      if (matchMedia("(max-width: 720px)").matches) setCollapsed(true);
      sync();
      if (document.documentElement.dataset.webglStageReady === "true") {
        requestDefaultLocation();
      }
    });
    window.addEventListener("themechange", sync);
    window.addEventListener("webgl-stage-ready", requestDefaultLocation);
    window.addEventListener("solar-environment-status", status);
    window.addEventListener("solar-metrics", metrics);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("themechange", sync);
      window.removeEventListener("webgl-stage-ready", requestDefaultLocation);
      window.removeEventListener("solar-environment-status", status);
      window.removeEventListener("solar-metrics", metrics);
    };
  }, []);
  useEffect(() => {
    if (addressResolved || s.address.trim().length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLocating(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ro&limit=5&addressdetails=1&q=${encodeURIComponent(s.address)}`,
          {
            signal: controller.signal,
            headers: {
              "Accept-Language":
                locale === "ro" ? "ro,en" : locale === "de" ? "de,en" : "en,ro",
            },
          },
        );
        setSuggestions(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLocating(false);
      }
    }, 360);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [s.address, locale, addressResolved]);
  const set = (
    key: keyof typeof s,
    value: string | number | boolean,
    emitKey = key,
  ) => {
    setS((x) => ({ ...x, [key]: value }));
    dispatch("solar", String(emitKey), value);
  };
  const estimate = useMemo(
    () => {
      const selectedModule =
        modulePresets[s.modulePreset as keyof typeof modulePresets];
      return (
      s.panels * selectedModule.panelPriceRon +
      s.panels * 430 +
      (s.battery ? s.capacity * 1960 : 0) +
      1800
      );
    },
    [s.panels, s.modulePreset, s.battery, s.capacity],
  );
  function selectLocation(result: LocationResult) {
    const lat = Number(result.lat),
      lon = Number(result.lon);
    const short = String(result.display_name).split(",").slice(0, 3).join(",");
    setAddressResolved(true);
    setS((x) => ({ ...x, address: short }));
    setLocation(`${short} · ${lat.toFixed(2)}°N`);
    setLocationPoint({ lat, lon });
    setSuggestions([]);
    setMapOpen(false);
    setContextStatus("loading");
    dispatch("solar", "location", JSON.stringify({ lat, lon, label: short }));
  }
  async function resolveAddress() {
    if (suggestions[0]) {
      selectLocation(suggestions[0]);
      return;
    }
    if (!s.address.trim()) {
      setMapOpen(true);
      return;
    }
    setLocating(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ro&limit=1&addressdetails=1&q=${encodeURIComponent(s.address)}`,
      );
      const [result] = await response.json();
      if (result) selectLocation(result);
    } finally {
      setLocating(false);
    }
  }
  const dateSeason = (value: string) => {
    const month = Number(value.slice(5, 7));
    const season =
      month >= 3 && month <= 5
        ? "spring"
        : month >= 6 && month <= 8
          ? "summer"
          : month >= 9 && month <= 11
            ? "autumn"
            : "winter";
    setS((x) => ({ ...x, date: value, season }));
    dispatch("solar", "date", value);
  };
  const chooseSeason = (season: string) => {
    const month = { spring: "04", summer: "07", autumn: "10", winter: "01" }[season] || "07";
    const year = s.date.slice(0, 4) || "2026";
    const date = `${year}-${month}-15`;
    setS((current) => ({ ...current, season, date }));
    dispatch("solar", "season", season);
    dispatch("solar", "date", date);
  };
  const moveHouse = (axis: "east" | "north", direction: number) => {
    setNudge((current) => {
      const next = { ...current, [axis]: current[axis] + current.step * direction };
      dispatch("solar", axis === "east" ? "nudgeEast" : "nudgeNorth", next[axis]);
      return next;
    });
  };
  const switchNight = () => {
    const next = !s.night;
    set("night", next);
    const theme = next ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("360-theme", theme);
    window.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  };
  return (
    <>
      <div
        className={`scene-controls scene-controls-panel instrument-console solar-controls ${collapsed ? "is-collapsed" : ""}`}
      >
        <div className="console-header">
          <span>SOLAR / LIVE</span>
          <b>{location}</b>
          <strong className="live-price">
            EST.{" "}
            {new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-US").format(
              estimate,
            )}{" "}
            RON
          </strong>
          <button
            className="console-collapse"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? t.controls : t.hide}
          </button>
        </div>
        <div className="console-body">
          <div className="console-tabs solar-tabs">
            {(["site", "roof", "energy"] as const).map((name) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                {t[name]}
              </button>
            ))}
          </div>
          {tab === "site" && (
            <>
              <div className="address-control-wrap">
                <div className="address-control">
                  <input
                    value={s.address}
                    onChange={(e) => {
                      setAddressResolved(false);
                      if (e.target.value.trim().length < 3) setSuggestions([]);
                      setS((x) => ({ ...x, address: e.target.value }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") resolveAddress();
                    }}
                    placeholder={t.address}
                  />
                  <button onClick={resolveAddress}>
                    {locating ? t.locating : t.locate}
                  </button>
                  <button
                    className="map-trigger"
                    onClick={() => setMapOpen(true)}
                  >
                    {t.chooseMap}
                  </button>
                </div>
                {suggestions.length > 0 && (
                  <div className="address-suggestions">
                    {suggestions.map((result) => (
                      <button
                        key={`${result.lat}/${result.lon}`}
                        onClick={() => selectLocation(result)}
                      >
                        <b>{result.display_name.split(",")[0]}</b>
                        <span>
                          {result.display_name.split(",").slice(1).join(",")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {contextStatus !== "idle" && (
                  <p className={`solar-context-status ${contextStatus}`}>
                    {contextStatus === "loading"
                      ? t.loadingContext
                      : contextStatus === "loaded"
                        ? t.contextReady
                        : t.contextError}
                  </p>
                )}
              </div>
              <div className="date-control">
                <label>
                  <span>{t.date}</span>
                  <input
                    type="date"
                    value={s.date}
                    onChange={(e) => dateSeason(e.target.value)}
                  />
                </label>
                <button
                  onClick={() =>
                    dateSeason(new Date().toISOString().slice(0, 10))
                  }
                >
                  {t.today}
                </button>
              </div>
              <div className="solar-site-tools-row">
                <div className="scene-control-grid">
                  <Range
                    label={t.hour}
                    value={s.hour}
                    min={0}
                    max={23.9833}
                    step={0.05}
                    unit=":00"
                    onChange={(v) => set("hour", v)}
                  />
                  <Range
                    label={t.bearing}
                    value={s.bearing}
                    min={0}
                    max={359}
                    step={1}
                    unit={`° ${bearingCardinal(s.bearing)}`}
                    onChange={(v) => set("bearing", v)}
                  />
                </div>
                <button
                  className={`solar-position-trigger ${nudgeOpen ? "active" : ""}`}
                  onClick={() => setNudgeOpen((open) => !open)}
                  aria-expanded={nudgeOpen}
                  aria-label={t.nudge}
                  title={t.nudge}
                >
                  <span>⌖</span>
                  <b>{t.position}</b>
                </button>
              </div>
              <div className="scene-preset-row solar-season-row">
                {[
                  ["spring", t.spring],
                  ["summer", t.summer],
                  ["autumn", t.autumn],
                  ["winter", t.winter],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={s.season === v ? "active" : ""}
                    onClick={() => chooseSeason(v)}
                  >
                    {l}
                  </button>
                ))}
                <button
                  className={s.night ? "active" : ""}
                  onClick={switchNight}
                >
                  {s.night ? t.day : t.night}
                </button>
              </div>
            </>
          )}
          {tab === "roof" && (
            <>
              <label className="solar-module-select">
                <span>{t.module}</span>
                <select
                  value={s.modulePreset}
                  onChange={(event) =>
                    set("modulePreset", event.target.value, "module")
                  }
                >
                  {Object.entries(modulePresets).map(([value, module]) => (
                    <option key={value} value={value}>{module.label}</option>
                  ))}
                </select>
                <small>
                  {modulePresets[s.modulePreset as keyof typeof modulePresets].powerW} W · {Math.round(modulePresets[s.modulePreset as keyof typeof modulePresets].efficiency * 1000) / 10}% — {modulePresets[s.modulePreset as keyof typeof modulePresets].note}
                </small>
              </label>
              <div className="scene-control-grid">
                <Range
                  label={t.roofLength}
                  value={s.length}
                  min={5}
                  max={20}
                  step={0.1}
                  unit=" m"
                  onChange={(v) => set("length", v)}
                />
                <Range
                  label={t.roofDepth}
                  value={s.depth}
                  min={4}
                  max={14}
                  step={0.1}
                  unit=" m"
                  onChange={(v) => set("depth", v)}
                />
                <Range
                  label={t.pitch}
                  value={s.pitch}
                  min={5}
                  max={55}
                  step={1}
                  unit="°"
                  onChange={(v) => set("pitch", v)}
                />
                <Range
                  label={t.panels}
                  value={s.panels}
                  min={1}
                  max={80}
                  step={1}
                  unit=""
                  onChange={(v) => set("panels", v)}
                />
                <Range
                  label={t.columns}
                  value={s.columns}
                  min={1}
                  max={12}
                  step={1}
                  onChange={(v) => set("columns", v)}
                />
              </div>
              <div className="scene-preset-row">
                {[
                  ["gable", t.gable],
                  ["hip", t.hip],
                  ["shed", t.shed],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={s.shape === v ? "active" : ""}
                    onClick={() => set("shape", v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="scene-preset-row solar-side-row">
                {[
                  ["best", t.best],
                  ["front", t.front],
                  ["back", t.back],
                  ["both", t.both],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={s.side === v ? "active" : ""}
                    onClick={() => set("side", v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {solarMetrics.placedPanels < s.panels && (
                <p className="solar-fit-warning">
                  {t.fitWarning(solarMetrics.placedPanels, s.panels)}
                </p>
              )}
            </>
          )}
          {tab === "energy" && (
            <>
              <span className="control-section-label">{t.connection}</span>
              <div className="scene-preset-row phase-row">
                {[
                  ["single", t.singlePhase],
                  ["three", t.threePhase],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={s.phase === v ? "active" : ""}
                    onClick={() => setS((x) => ({ ...x, phase: v }))}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="energy-input-row">
                <label>
                  <span>{t.bill} (RON)</span>
                  <input
                    type="number"
                    min="0"
                    value={s.bill}
                    onChange={(e) =>
                      setS((x) => ({ ...x, bill: Number(e.target.value) }))
                    }
                  />
                </label>
                <label>
                  <span>{t.tariff} (RON/kWh)</span>
                  <input
                    type="number"
                    min="0"
                    step=".1"
                    value={s.tariff}
                    onChange={(e) =>
                      setS((x) => ({ ...x, tariff: Number(e.target.value) }))
                    }
                  />
                </label>
              </div>
              <span className="control-section-label">{t.consumption}</span>
              <div className="scene-preset-row consumption-row">
                {[
                  ["away", t.away],
                  ["partial", t.partial],
                  ["home", t.home],
                  ["optimized", t.optimized],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={s.profile === v ? "active" : ""}
                    onClick={() => setS((x) => ({ ...x, profile: v }))}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="solar-storage-switches">
                <button
                  className={s.battery ? "active" : ""}
                  onClick={() => setS((x) => ({ ...x, battery: !x.battery }))}
                >
                  {t.battery}
                  <i />
                </button>
                <button
                  className={s.autoBattery ? "active" : ""}
                  disabled={!s.battery}
                  onClick={() =>
                    setS((x) => ({
                      ...x,
                      autoBattery: !x.autoBattery,
                      capacity: !x.autoBattery
                        ? Math.max(5, Math.round(x.panels * 0.34))
                        : x.capacity,
                    }))
                  }
                >
                  {t.autoBattery}
                  <i />
                </button>
              </div>
              {s.battery && !s.autoBattery && (
                <div className="solar-storage-row">
                  <Range
                    label={t.capacity}
                    value={s.capacity}
                    min={2}
                    max={20}
                    step={1}
                    unit=" kWh"
                    onChange={(v) =>
                      setS((x) => ({ ...x, capacity: v, autoBattery: false }))
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {nudgeOpen && (
        <div className="solar-position-popover" role="dialog" aria-label={t.nudge}>
          <header>
            <div>
              <span>{t.nudge}</span>
              <b>E {nudge.east >= 0 ? "+" : ""}{nudge.east.toFixed(1)} m · N {nudge.north >= 0 ? "+" : ""}{nudge.north.toFixed(1)} m</b>
            </div>
            <button onClick={() => setNudgeOpen(false)} aria-label={t.close}>×</button>
          </header>
          <div className="solar-position-body">
            <div className="nudge-pad">
              <button onClick={() => moveHouse("north", 1)}>↑ <small>{t.north}</small></button>
              <button onClick={() => moveHouse("east", -1)}>← <small>{t.west}</small></button>
              <button className="nudge-center" onClick={() => {
                setNudge((current) => ({ ...current, east: 0, north: 0 }));
                dispatch("solar", "nudgeEast", 0); dispatch("solar", "nudgeNorth", 0);
              }}>◎</button>
              <button onClick={() => moveHouse("east", 1)}>→ <small>{t.east}</small></button>
              <button onClick={() => moveHouse("north", -1)}>↓ <small>{t.south}</small></button>
            </div>
            <label>
              <span>{t.nudgeStep}</span>
              <select value={nudge.step} onChange={(event) => setNudge((current) => ({ ...current, step: Number(event.target.value) }))}>
                <option value="0.5">0.5 m</option><option value="1">1 m</option><option value="2">2 m</option><option value="5">5 m</option>
              </select>
            </label>
          </div>
        </div>
      )}
      <button className="analytics-bubble" onClick={() => setModal(true)} aria-label={t.analytics}>
        <span>ENERGY</span><b>LIVE<br />ANALYTICS</b><i>↗</i>
      </button>
      {modal && (
        <EnergyModal
          locale={locale}
          panelCount={solarMetrics.placedPanels}
          systemKwp={solarMetrics.systemKwp}
          battery={s.battery ? s.capacity : 0}
          profile={s.profile}
          bill={s.bill}
          tariff={s.tariff}
          hour={s.hour}
          date={s.date}
          bearing={s.bearing}
          onClose={() => setModal(false)}
        />
      )}{" "}
      {mapOpen && (
        <SolarMapPicker
          locale={locale}
          center={locationPoint}
          onClose={() => setMapOpen(false)}
          onSelect={selectLocation}
        />
      )}
    </>
  );
}
