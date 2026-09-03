import L from 'leaflet';
import {
  buildRouteSegments,
  coordinateBounds,
  crossingLineCoordinates,
  interpolateRoute,
  nearestPointOnSegmentRatio,
} from '../domain/geometry.js';
import { toLeafletBounds, toLeafletLatLng } from './leafletCoordinates.js';

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILE_URL = import.meta.env.VITE_GAS_TILE_URL?.trim() || DEFAULT_TILE_URL;
const TILE_ATTRIBUTION = import.meta.env.VITE_GAS_TILE_ATTRIBUTION?.trim()
  || DEFAULT_TILE_ATTRIBUTION;

function markerSize(point) {
  return point.kind === 'waypoint' ? 24 : 29;
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
    this.routeLayers = new globalThis.Map();
    this.stationLayer = null;
    this.crossingLayerGroup = null;
    this.ready = false;
    this.destroyed = false;
    this.lastState = store.get();
    this.tileErrorReported = false;

    onLoadingChange?.(true);

    // Leaflet renders the route as SVG and does not require WebGL. That keeps
    // route editing available on browsers where a GPU context cannot be kept.
    this.map = L.map(container, {
      center: [44.4288, 26.1025],
      zoom: 13,
      minZoom: 2,
      maxZoom: 19,
      zoomControl: false,
      preferCanvas: false,
      attributionControl: true,
    });

    this.onTileError = (event) => {
      if (this.destroyed || this.tileErrorReported) return;
      this.tileErrorReported = true;
      console.warn(
        'A base-map tile could not be loaded. Route editing remains available.',
        event?.error || event,
      );
    };

    this.zoomControl = L.control.zoom({ position: 'topright' }).addTo(this.map);
    this.baseLayer = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: TILE_ATTRIBUTION,
      updateWhenIdle: true,
      keepBuffer: 2,
    });
    this.baseLayer.on('tileerror', this.onTileError);
    this.baseLayer.addTo(this.map);
    this.routeLayerGroup = L.layerGroup().addTo(this.map);
    this.crossingLayerGroup = L.layerGroup().addTo(this.map);

    this.onMapClick = (event) => {
      const mode = this.store.get().route.editMode;
      const coordinate = [event.latlng.lng, event.latlng.lat];
      if (mode === 'setA') this.store.setEndpoint('a', coordinate);
      else if (mode === 'setB') this.store.setEndpoint('b', coordinate);
      else if (mode === 'addWaypoint') this.store.addWaypoint(coordinate);
    };

    this.map.on('click', this.onMapClick);
    this.ready = true;
    this.sync(this.lastState);
    this.fitRoute({ animate: false });
    this.onLoadingChange?.(false);
    this.onError?.(null);
  }

  applyCursor() {
    const mode = this.store.get().route.editMode;
    this.container.style.cursor = mode === 'inspect' ? '' : 'crosshair';
  }

  syncRouteLayers(state) {
    this.routeLayerGroup.clearLayers();
    this.routeLayers.clear();

    buildRouteSegments(state.route.points).forEach((segment) => {
      const selected = segment.id === state.route.selectedSegmentId;
      const coordinates = [
        toLeafletLatLng(segment.startPoint.coordinate),
        toLeafletLatLng(segment.endPoint.coordinate),
      ];
      const halo = L.polyline(coordinates, {
        color: '#ffffff',
        weight: selected ? 12 : 9,
        opacity: 0.92,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(this.routeLayerGroup);
      const line = L.polyline(coordinates, {
        color: selected ? '#e67e22' : '#0878c9',
        weight: selected ? 7 : 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true,
        bubblingMouseEvents: true,
      }).addTo(this.routeLayerGroup);

      const onClick = (event) => {
        if (this.store.get().route.editMode !== 'inspect') return;
        const ratio = nearestPointOnSegmentRatio(
          [event.latlng.lng, event.latlng.lat],
          segment,
        );
        this.store.selectSegment(
          segment.id,
          segment.startChainageM + (segment.lengthM * ratio),
        );
      };
      const onMouseOver = () => { this.container.style.cursor = 'pointer'; };
      const onMouseOut = () => this.applyCursor();
      line.on('click', onClick);
      line.on('mouseover', onMouseOver);
      line.on('mouseout', onMouseOut);
      this.routeLayers.set(segment.id, {
        halo,
        line,
        onClick,
        onMouseOver,
        onMouseOut,
      });
    });
  }

  syncStation(state) {
    const station = interpolateRoute(state.route.points, state.route.stationM);
    if (!station.segment) {
      this.stationLayer?.remove();
      this.stationLayer = null;
      return;
    }

    const position = toLeafletLatLng(station.coordinate);
    if (!this.stationLayer) {
      this.stationLayer = L.circleMarker(position, {
        radius: 7,
        color: '#14212b',
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 1,
        interactive: false,
      }).addTo(this.map);
      return;
    }
    this.stationLayer.setLatLng(position);
    this.stationLayer.bringToFront();
  }

  syncCrossing(state) {
    this.crossingLayerGroup.clearLayers();
    if (!state.crossing?.enabled) return;

    const crossing = crossingLineCoordinates(
      state.route.points,
      state.crossing.stationM,
      state.crossing.angleDeg,
    );
    if (!crossing) return;
    const coordinates = [
      toLeafletLatLng(crossing.start),
      toLeafletLatLng(crossing.end),
    ];
    L.polyline(coordinates, {
      color: '#ffffff',
      weight: 8,
      opacity: 0.94,
      interactive: false,
    }).addTo(this.crossingLayerGroup);
    L.polyline(coordinates, {
      color: '#9b3fa8',
      weight: 4,
      opacity: 1,
      dashArray: '7 6',
      interactive: false,
    }).addTo(this.crossingLayerGroup);
    const marker = L.circleMarker(toLeafletLatLng(crossing.center), {
      radius: 6,
      color: '#6c2478',
      weight: 2,
      fillColor: '#ffffff',
      fillOpacity: 1,
      interactive: true,
      bubblingMouseEvents: false,
    }).addTo(this.crossingLayerGroup);
    marker.on('click', () => {
      this.store.selectSegment(crossing.station.segment.id, crossing.station.chainageM);
    });
  }

  syncMarkers(state) {
    const currentIds = new Set(state.route.points.map((point) => point.id));
    this.markers.forEach((entry, id) => {
      if (currentIds.has(id)) return;
      entry.element.removeEventListener('click', entry.onClick);
      entry.marker.off('dragend', entry.onDragEnd);
      entry.marker.remove();
      this.markers.delete(id);
    });

    state.route.points.forEach((point) => {
      let entry = this.markers.get(point.id);
      if (!entry) {
        const element = makeMarkerElement(point);
        const size = markerSize(point);
        const icon = L.divIcon({
          className: 'gas-route-marker-host',
          html: element,
          iconSize: [size, size],
          iconAnchor: [size / 2, size],
        });
        const marker = L.marker(toLeafletLatLng(point.coordinate), {
          icon,
          draggable: true,
          keyboard: false,
          riseOnHover: true,
        }).addTo(this.map);
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
          const location = marker.getLatLng();
          this.store.movePoint(point.id, [location.lng, location.lat]);
        };
        element.addEventListener('click', onClick);
        marker.on('dragend', onDragEnd);
        entry = { marker, element, onClick, onDragEnd };
        this.markers.set(point.id, entry);
      }
      entry.marker.setLatLng(toLeafletLatLng(point.coordinate));
      entry.marker.setZIndexOffset(state.route.selectedPointId === point.id ? 1000 : 0);
      entry.element.classList.toggle('is-selected', state.route.selectedPointId === point.id);
      const label = entry.element.querySelector('span');
      if (label) label.textContent = point.label;
    });
  }

  sync(state) {
    this.lastState = state;
    if (!this.ready || this.destroyed) return;
    this.syncRouteLayers(state);
    this.syncCrossing(state);
    this.syncStation(state);
    this.syncMarkers(state);
    this.applyCursor();
  }

  fitRoute({ animate = true } = {}) {
    const state = this.store.get();
    const bounds = coordinateBounds(state.route.points);
    if (!bounds || !this.ready) return;
    const samePoint = bounds.minLon === bounds.maxLon && bounds.minLat === bounds.maxLat;
    if (samePoint) {
      this.map.setView([bounds.minLat, bounds.minLon], 17, { animate });
      return;
    }
    this.map.fitBounds(
      toLeafletBounds(bounds),
      {
        padding: [72, 72],
        maxZoom: 17,
        animate,
        duration: animate ? 0.45 : 0,
      },
    );
  }

  resize() {
    this.map?.invalidateSize({ animate: false, pan: false });
  }

  destroy() {
    this.destroyed = true;
    this.baseLayer?.off('tileerror', this.onTileError);
    this.map?.off('click', this.onMapClick);
    this.markers.forEach((entry) => {
      entry.element.removeEventListener('click', entry.onClick);
      entry.marker.off('dragend', entry.onDragEnd);
      entry.marker.remove();
    });
    this.markers.clear();
    this.routeLayers.clear();
    this.map?.remove();
  }
}
