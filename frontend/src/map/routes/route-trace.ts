import type {
  Feature,
  LineString,
} from 'geojson';
import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from 'mapbox-gl';

import { points } from '~/map/geography/coordinates';
import {
  primaryToSecondaryRoute,
  type StoredDirectionsRouteProperties,
} from '~/map/routes';

export const routeTraceSourceId = 'primary-to-secondary-route-trace';

/**
 * Directions geometry is snapped to nearby roads. Add the canonical endpoint
 * coordinates so the visible trace terminates exactly below both waypoint
 * nodes rather than stopping a few metres away from either laser pole.
 */
export const routeTrace: Feature<
  LineString,
  StoredDirectionsRouteProperties
> = {
  ...primaryToSecondaryRoute,
  geometry: {
    type: 'LineString',
    coordinates: [
      [...points.primaryLocation.coordinates],
      ...primaryToSecondaryRoute.geometry.coordinates,
      [...points.secondaryLocation.coordinates],
    ],
  },
};

export const routeTraceSource: GeoJSONSourceSpecification = {
  type: 'geojson',
  data: routeTrace,
  lineMetrics: true,
};

const routeWidth: ExpressionSpecification = [
  'interpolate',
  ['exponential', 1.4],
  ['zoom'],
  8,
  5,
  12,
  9,
  16,
  18,
];

/** Wide indigo bloom diffused into the dark terrain. */
export const routeTraceBloomLayer: LineLayerSpecification = {
  id: 'route-trace-bloom',
  type: 'line',
  source: routeTraceSourceId,

  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },

  paint: {
    'line-color': '#381dff',
    'line-width': routeWidth,
    'line-opacity': 0.3,
    'line-blur': 7,
    'line-emissive-strength': 1,
  },
};

/** Saturated blue aura gives the route its electric edge. */
export const routeTraceAuraLayer: LineLayerSpecification = {
  id: 'route-trace-aura',
  type: 'line',
  source: routeTraceSourceId,

  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },

  paint: {
    'line-color': '#2364ff',
    'line-width': [
      'interpolate',
      ['exponential', 1.4],
      ['zoom'],
      8,
      3.5,
      12,
      6,
      16,
      12,
    ],
    'line-opacity': 0.68,
    'line-blur': 3.25,
    'line-emissive-strength': 1,
  },
};

/** Cyan sheath follows the full Directions geometry. */
export const routeTraceCyanLayer: LineLayerSpecification = {
  id: 'route-trace-cyan',
  type: 'line',
  source: routeTraceSourceId,

  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },

  paint: {
    'line-gradient': [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      '#29d8ff',
      0.45,
      '#5c7dff',
      0.72,
      '#00e5ff',
      1,
      '#7b5cff',
    ],
    'line-width': [
      'interpolate',
      ['exponential', 1.4],
      ['zoom'],
      8,
      2,
      12,
      3.5,
      16,
      7,
    ],
    'line-opacity': 0.94,
    'line-blur': 1.1,
    'line-emissive-strength': 1,
  },
};

/** Narrow white-hot center produces the neon-tube highlight. */
export const routeTraceCoreLayer: LineLayerSpecification = {
  id: 'route-trace-core',
  type: 'line',
  source: routeTraceSourceId,

  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },

  paint: {
    'line-color': '#dffcff',
    'line-width': [
      'interpolate',
      ['exponential', 1.4],
      ['zoom'],
      8,
      0.8,
      12,
      1.35,
      16,
      2.5,
    ],
    'line-opacity': 0.96,
    'line-blur': 0.15,
    'line-emissive-strength': 1,
  },
};

/** Add from broadest glow to narrowest core. */
export const routeTraceLayers = [
  routeTraceBloomLayer,
  routeTraceAuraLayer,
  routeTraceCyanLayer,
  routeTraceCoreLayer,
];
