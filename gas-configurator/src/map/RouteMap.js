import { LngLatBounds, Map, Marker, NavigationControl } from 'maplibre-gl';
import {
  buildRouteSegments,
  coordinateBounds,
  interpolateRoute,
  nearestPointOnSegmentRatio,
} from '../domain/geometry.js';

const ROUTE_SOURCE_ID = 'gas-route';
const STATION_SOURCE_ID = 'gas-station';
const ROUTE_HALO_LAYER_ID = 'gas-route-halo';
const ROUTE_LAYER_ID = 'gas-route-line';
const STATION_LAYER_ID = 'gas-route-station';
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function emptyFeatureCollection() {
  return { type: 'FeatureCollection', features: [] };
}

function routeFeatureCollection(state) {
  return {
    type: 'FeatureCollection',
    features: buildRouteSegments(state.route.points).map((segment) => ({
      type: 'Feature',
      properties: {
        id: segment.id,
        index: segment.index,
        selected: segment.id === state.route.selectedSegmentId,
      },
      geometry: {
        type: 'LineString',
        coordinates: [segment.startPoint.coordinate, segment.endPoint.coordinate],
      },
    })),
  };
}

function stationFeatureCollection(state) {
  const station = interpolateRoute(state.route.points, state.route.stationM);
  return {
    type: 'FeatureCollection',
    features: station.segment ? [{
      type: 'Feature',
      properties: { segmentId: station.segment.id },
      geometry: { type: 'Point', coordinates: station.coordinate },
    }] : [],
  };
}

function makeMarkerElement(point) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `gas-route-marker${point.kind === 'waypoint' ? ' gas-route-marker--waypoint' : ''}`;
  element.dataset.pointId = point.id;
  element.setAttribute('aria-label', point.kind === 'waypoint' ? `Waypoint ${point.label}` : `Point ${point.label}`);
  const label = document.createElement('span');
  label.textContent = point.label;
  element.append(label);
  return element;
}

export class RouteMap {
  constructor(container, store, { onLoadingChange, onError } = {}) {
    if (!container) throw new Error('The route map container is missing.');
    this.container = container;
    this.store = store;
    this.onLoadingChange = onLoadingChange;
    this.onError = onError;
    this.markers = new globalThis.Map();
    this.ready = false;
    this.destroyed = false;
    this.lastState = store.get();

    onLoadingChange?.(true);
    this.map = new Map({
      container,
      style: OPENFREEMAP_STYLE,
      center: [26.1025, 44.4288],
      zoom: 13.2,
      minZoom: 2,
      maxZoom: 20,
      pitchWithRotate: false,
      dragRotate: false,
      attributionControl: true,
      cooperativeGestures: false,
    });

    this.map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');

    this.onLoad = () => {
      if (this.destroyed) return;
      this.installLayers();
      this.ready = true;
      this.sync(this.lastState);
      this.fitRoute({ animate: false });
      this.onLoadingChange?.(false);
      this.onError?.(null);
    };

    this.onMapError = (event) => {
      if (this.ready || this.destroyed) return;
      console.error('The route base map could not be initialized.', event?.error || event);
      this.onLoadingChange?.(false);
      this.onError?.(event?.error || new Error('Map initialization failed.'));
    };

    this.onMapClick = (event) => {
      const mode = this.store.get().route.editMode;
      const coordinate = [event.lngLat.lng, event.lngLat.lat];
      if (mode === 'setA') this.store.setEndpoint('a', coordinate);
      else if (mode === 'setB') this.store.setEndpoint('b', coordinate);
      else if (mode === 'addWaypoint') this.store.addWaypoint(coordinate);
    };

    this.onRouteClick = (event) => {
      const feature = event.features?.[0];
      if (!feature || this.store.get().route.editMode !== 'inspect') return;
      const segments = buildRouteSegments(this.store.get().route.points);
      const segment = segments.find((candidate) => candidate.id === feature.properties?.id);
      if (!segment) return;
      const ratio = nearestPointOnSegmentRatio([event.lngLat.lng, event.lngLat.lat], segment);
      this.store.selectSegment(segment.id, segment.startChainageM + (segment.lengthM * ratio));
    };

    this.onRouteEnter = () => { this.map.getCanvas().style.cursor = 'pointer'; };
    this.onRouteLeave = () => { this.map.getCanvas().style.cursor = ''; };

    this.map.on('load', this.onLoad);
    this.map.on('error', this.onMapError);
    this.map.on('click', this.onMapClick);
  }

  installLayers() {
    if (!this.map.getSource(ROUTE_SOURCE_ID)) {
      this.map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
    }
    if (!this.map.getSource(STATION_SOURCE_ID)) {
      this.map.addSource(STATION_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
    }

    this.map.addLayer({
      id: ROUTE_HALO_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['case', ['boolean', ['get', 'selected'], false], 12, 9],
        'line-opacity': 0.92,
      },
    });

    this.map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['boolean', ['get', 'selected'], false], '#e67e22', '#0878c9'],
        'line-width': ['case', ['boolean', ['get', 'selected'], false], 7, 5],
      },
    });

    this.map.addLayer({
      id: STATION_LAYER_ID,
      type: 'circle',
      source: STATION_SOURCE_ID,
      paint: {
        'circle-radius': 7,
        'circle-color': '#ffffff',
        'circle-stroke-color': '#14212b',
        'circle-stroke-width': 3,
      },
    });

    this.map.on('click', ROUTE_LAYER_ID, this.onRouteClick);
    this.map.on('mouseenter', ROUTE_LAYER_ID, this.onRouteEnter);
    this.map.on('mouseleave', ROUTE_LAYER_ID, this.onRouteLeave);
  }

  syncMarkers(state) {
    const currentIds = new Set(state.route.points.map((point) => point.id));
    this.markers.forEach((entry, id) => {
      if (currentIds.has(id)) return;
      entry.marker.remove();
      this.markers.delete(id);
    });

    state.route.points.forEach((point) => {
      let entry = this.markers.get(point.id);
      if (!entry) {
        const element = makeMarkerElement(point);
        const marker = new Marker({ element, anchor: 'bottom', draggable: true })
          .setLngLat(point.coordinate)
          .addTo(this.map);
        const onClick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.store.selectPoint(point.id);
          if (point.kind === 'waypoint') {
            const segments = buildRouteSegments(this.store.get().route.points);
            const adjacent = segments.find((segment) => segment.endPoint.id === point.id)
              || segments.find((segment) => segment.startPoint.id === point.id);
            if (adjacent) this.store.selectSegment(adjacent.id, adjacent.endChainageM);
          }
        };
        const onDragEnd = () => {
          const location = marker.getLngLat();
          this.store.movePoint(point.id, [location.lng, location.lat]);
        };
        element.addEventListener('click', onClick);
        marker.on('dragend', onDragEnd);
        entry = { marker, element, onClick, onDragEnd };
        this.markers.set(point.id, entry);
      }
      entry.marker.setLngLat(point.coordinate);
      entry.element.classList.toggle('is-selected', state.route.selectedPointId === point.id);
      const label = entry.element.querySelector('span');
      if (label) label.textContent = point.label;
    });
  }

  sync(state) {
    this.lastState = state;
    if (!this.ready || this.destroyed) return;
    this.map.getSource(ROUTE_SOURCE_ID)?.setData(routeFeatureCollection(state));
    this.map.getSource(STATION_SOURCE_ID)?.setData(stationFeatureCollection(state));
    this.syncMarkers(state);
    const mode = state.route.editMode;
    this.map.getCanvas().style.cursor = mode === 'inspect' ? '' : 'crosshair';
  }

  fitRoute({ animate = true } = {}) {
    const state = this.store.get();
    const bounds = coordinateBounds(state.route.points);
    if (!bounds || !this.ready) return;
    const mapBounds = new LngLatBounds(
      [bounds.minLon, bounds.minLat],
      [bounds.maxLon, bounds.maxLat],
    );
    const samePoint = bounds.minLon === bounds.maxLon && bounds.minLat === bounds.maxLat;
    if (samePoint) {
      this.map.easeTo({ center: [bounds.minLon, bounds.minLat], zoom: 17, duration: animate ? 450 : 0 });
      return;
    }
    this.map.fitBounds(mapBounds, { padding: 72, maxZoom: 17, duration: animate ? 450 : 0 });
  }

  resize() {
    this.map?.resize();
  }

  destroy() {
    this.destroyed = true;
    this.markers.forEach(({ marker }) => marker.remove());
    this.markers.clear();
    if (this.ready) {
      this.map.off('click', ROUTE_LAYER_ID, this.onRouteClick);
      this.map.off('mouseenter', ROUTE_LAYER_ID, this.onRouteEnter);
      this.map.off('mouseleave', ROUTE_LAYER_ID, this.onRouteLeave);
    }
    this.map.off('load', this.onLoad);
    this.map.off('error', this.onMapError);
    this.map.off('click', this.onMapClick);
    this.map.remove();
  }
}
