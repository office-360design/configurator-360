import { maskRGBA } from './segmentationDebugData.js';
import { projectDebugRing, debugGridSegments } from './debugProjection.js';

/** A transparent canvas ABOVE WebGL and BELOW calibration controls. No raycasts,
 * listeners for editing, model calls, camera setters or geometry changes. */
export function createDebugOverlay(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'segmentation-debug-overlay'; canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '3' });
  canvas.hidden = true; host.append(canvas);
  const context = canvas.getContext('2d');
  let raster = null, rasterKey = '', source = null;
  function maskCanvas(inspected, key, classes) {
    const rgba = maskRGBA(inspected, key, classes); if (!rgba) return null;
    const c = document.createElement('canvas'); c.width = inspected.image.width; c.height = inspected.image.height;
    c.getContext('2d').putImageData(new ImageData(rgba, c.width, c.height), 0, 0);
    return c;
  }
  function clear({ release = false } = {}) {
    canvas.hidden = true; context.clearRect(0, 0, canvas.width, canvas.height);
    if (release) { raster = null; rasterKey = ''; source = null; }
  }
  function draw({ view, inspected, design, options }) {
    if (!view?.photoMode || !(view.width > 0 && view.height > 0) || !options.enabled) { clear(); return; }
    const scale = Math.min(globalThis.devicePixelRatio || 1, 2, 4096/view.width, 4096/view.height);
    const width = Math.max(1, Math.round(view.width*scale)), height = Math.max(1, Math.round(view.height*scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.setTransform(scale,0,0,scale,0,0); context.clearRect(0,0,view.width,view.height);
    const r = view.rect;
    if (!r || !(r.width > 0 && r.height > 0)) { clear(); return; }
    context.save(); context.beginPath(); context.rect(r.left,r.top,r.width,r.height); context.clip();
    const key = JSON.stringify([options.raster, options.classes]);
    if (source !== inspected || key !== rasterKey) {
      source = inspected; rasterKey = key; raster = maskCanvas(inspected,options.raster,options.classes);
    }
    if (raster) {
      context.globalAlpha = Math.min(1,Math.max(0,options.opacity/100)); context.imageSmoothingEnabled = false;
      context.drawImage(raster,r.left,r.top,r.width,r.height); context.globalAlpha = 1;
    }
    if (options.grid && view.hasCalibration) {
      context.strokeStyle = '#f6b82b'; context.lineWidth = 1; context.setLineDash([]);
      context.beginPath();
      for (const [a,b] of debugGridSegments(design,view)) { context.moveTo(a.x,a.y); context.lineTo(b.x,b.y); }
      context.stroke();
    }
    const path = points => {
      if (points.length < 3) return;
      context.moveTo(points[0].x,points[0].y);
      for (const p of points.slice(1)) context.lineTo(p.x,p.y); context.closePath();
    };
    if (options.current && view.hasCalibration) for (const region of design?.areaRegions || []) {
      const outer = projectDebugRing(region.outer,view), holes = region.holes.map(h=>projectDebugRing(h,view));
      context.beginPath(); path(outer); holes.forEach(path);
      context.fillStyle = 'rgba(0,184,219,0.12)'; context.fill('evenodd');
      context.beginPath(); path(outer); context.strokeStyle = '#00b8db'; context.lineWidth = 2.5;
      context.setLineDash([]); context.stroke();
      context.beginPath(); holes.forEach(path); context.strokeStyle = '#ff8b31'; context.setLineDash([6,4]); context.stroke();
    }
    context.restore(); canvas.hidden = false;
  }
  return { canvas, draw, clear, maskCanvas,
    destroy() { clear({release:true}); canvas.remove(); } };
}
