"use client";

import type { CSSProperties } from "react";

// Shared by the established instrument consoles and the new lite products.
// Keep this module free of scene builders, pricing logic and product imports.
export function RangeControl({ label, value, min, max, step, unit = "", onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string;
  onChange: (value: number) => void;
}) {
  return <label className="scene-range">
    <span>{label}<b>{value}{unit}</b></span>
    <input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

export function PresetControl({ label, value, options, onChange }: {
  label: string; value: string | number; options: [string, string][]; onChange: (value: string) => void;
}) {
  return <div className="scene-option-group">
    <span className="control-section-label">{label}</span>
    <div className="scene-preset-row" role="group" aria-label={label} style={{gridTemplateColumns:`repeat(${options.length}, minmax(0, 1fr))`}}>
      {options.map(([key, title]) => <button type="button" key={key} className={value === key ? "active" : ""} aria-pressed={value === key} onClick={() => onChange(key)}>{title}</button>)}
    </div>
  </div>;
}

export function ColourControl({ label, value, options, onChange }: {
  label: string; value: string | number; options: [string, string][]; onChange: (value: string) => void;
}) {
  return <div className="scene-option-group">
    <span className="control-section-label">{label}</span>
    <div className="roof-color-row scene-colour-row" role="group" aria-label={label} style={{"--swatch-count":options.length} as CSSProperties}>
      {options.map(([key, title]) => <button key={key} className={value === key ? "active" : ""} type="button" title={title} aria-label={title} aria-pressed={value === key} onClick={() => onChange(key)}><i style={{background:key}} /><span>{title}</span></button>)}
    </div>
  </div>;
}
