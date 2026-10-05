import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AssetLibrary } from '../../../pergola-configurator/src/scene/AssetLibrary.js';
import * as stateAPI from '../../../pergola-configurator/src/state.js';
import { pergolaCases } from './pergolaCases.mjs';

export const ACCESSORY_FILES = Object.freeze({ ledStrip: 'led-strip', spotlight: 'spotlight', heater: 'heater',
  rainSensor: 'rain-sensor', windSensor: 'wind-sensor', speaker: 'speaker', wallSwitch: 'wall-switch',
  handCrank: 'hand-crank', screenCassette: 'screen-cassette' });
export async function loadPergolaMaterialAssets() {
  const loader = new GLTFLoader();
  // Use the actual source meshes and AssetLibrary's independent-clone method,
  // without constructor network requests for its unrelated environment assets.
  const assets = Object.create(AssetLibrary.prototype);
  assets.sources = new Map(); assets.errors = new Map();
  for (const [key, file] of Object.entries(ACCESSORY_FILES)) {
    const bytes = await readFile(new URL(`../../../pergola-configurator/public/assets/models/accessories/${file}.glb`, import.meta.url));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    assets.sources.set(key, gltf.scene);
  }
  return assets;
}
export function pergolaMaterialCases() {
  const cases = pergolaCases(stateAPI);
  const make = (name, modify) => { const state = structuredClone(stateAPI.DEFAULT_STATE); modify(state); cases.push({ name, state }); };
  for (const openness of [0, 50, 100]) for (const type of ['screen', 'motorized-screen']) make(`${type}-open-${openness}`, state => {
    const segment = stateAPI.getPoleGrid(state).segments[0];
    state.sideSegments[segment.id].type = type;
    state.sideSegments[segment.id].screenSettings[type] = { color: '#8f9a95', openness };
  });
  for (const type of ['speaker', 'switch', 'hand-crank']) make(`mount-${type}`, state => {
    if (type === 'hand-crank') state.automation = 'manual';
    const pole = stateAPI.getPoleGrid(state).poles[0].id;
    state.poleMounts[pole].front[type] = stateAPI.createPoleMount(type);
  });
  for (const type of ['rain', 'wind']) make(`sensor-${type}`, state => {
    state.accessories.sensors[type] = { enabled: true, pole: stateAPI.getPoleGrid(state).poles[0].id };
  });
  make('heater-pair', state => {
    const segment = stateAPI.getBoundaryHeaterSegments(state)[0];
    state.accessories.heaters[segment.id] = { first: true, second: true };
  });
  return cases;
}
