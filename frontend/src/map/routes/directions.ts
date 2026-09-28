import type {
  Feature,
  LineString,
  Position,
} from 'geojson';

const directionsApiUrl = 'https://api.mapbox.com/directions/v5';
const minimumCoordinateCount = 2;
const maximumCoordinateCount = 25;

export type DirectionsCoordinate = readonly [
  longitude: number,
  latitude: number,
];

export type DirectionsProfile =
  | 'mapbox/cycling'
  | 'mapbox/driving'
  | 'mapbox/driving-traffic'
  | 'mapbox/walking';

export type DirectionsOverview = 'false' | 'full' | 'simplified';

export type GetDirectionsOptions = {
  /** Defaults to the frontend's existing public Mapbox token. */
  accessToken?: string;
  alternatives?: boolean;
  profile?: DirectionsProfile;
  signal?: AbortSignal;
  steps?: boolean;
  overview?: DirectionsOverview;
};

export type DirectionsManeuver = {
  bearing_after: number;
  bearing_before: number;
  instruction?: string;
  location: Position;
  modifier?: string;
  type: string;
};

export type DirectionsStep = {
  distance: number;
  duration: number;
  geometry: LineString;
  maneuver: DirectionsManeuver;
  name: string;
};

export type DirectionsLeg = {
  distance: number;
  duration: number;
  steps: DirectionsStep[];
  summary: string;
  weight: number;
};

export type DirectionsRoute = {
  distance: number;
  duration: number;
  geometry: LineString;
  legs: DirectionsLeg[];
  weight: number;
  weight_name: string;
};

export type DirectionsWaypoint = {
  distance: number;
  location: Position;
  name: string;
};

export type DirectionsResponse = {
  code: 'Ok';
  routes: DirectionsRoute[];
  uuid?: string;
  waypoints: DirectionsWaypoint[];
};

type DirectionsErrorResponse = {
  code?: string;
  message?: string;
};

export class MapboxDirectionsError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(
    message: string,
    options: { code?: string; status?: number } = {},
  ) {
    super(message);
    this.name = 'MapboxDirectionsError';
    this.code = options.code;
    this.status = options.status;
  }
}

function validateCoordinates(
  coordinates: readonly DirectionsCoordinate[],
): void {
  if (
    coordinates.length < minimumCoordinateCount
    || coordinates.length > maximumCoordinateCount
  ) {
    throw new RangeError(
      `Mapbox Directions requires ${minimumCoordinateCount}–${maximumCoordinateCount} coordinates.`,
    );
  }

  coordinates.forEach(([longitude, latitude], index) => {
    const isValid = Number.isFinite(longitude)
      && longitude >= -180
      && longitude <= 180
      && Number.isFinite(latitude)
      && latitude >= -90
      && latitude <= 90;

    if (!isValid) {
      throw new RangeError(
        `Invalid longitude/latitude at coordinate index ${index}.`,
      );
    }
  });
}

/**
 * Retrieve a route from Mapbox Directions API v5.
 *
 * @example
 * const directions = await getMapboxDirections([
 *   points.primaryLocation.coordinates,
 *   points.secondaryLocation.coordinates,
 * ], { profile: 'mapbox/walking' });
 *
 * const route = directionsRouteToFeature(directions.routes[0]);
 */
export async function getMapboxDirections(
  coordinates: readonly DirectionsCoordinate[],
  options: GetDirectionsOptions = {},
): Promise<DirectionsResponse> {
  validateCoordinates(coordinates);

  const accessToken = options.accessToken
    ?? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  if (!accessToken) {
    throw new MapboxDirectionsError(
      'A Mapbox access token is required. Set VITE_MAPBOX_ACCESS_TOKEN or pass accessToken.',
    );
  }

  const profile = options.profile ?? 'mapbox/driving';
  const coordinatePath = coordinates
    .map(([longitude, latitude]) => `${longitude},${latitude}`)
    .join(';');
  const query = new URLSearchParams({
    access_token: accessToken,
    alternatives: String(options.alternatives ?? false),
    geometries: 'geojson',
    overview: options.overview ?? 'full',
    steps: String(options.steps ?? false),
  });
  const url = `${directionsApiUrl}/${profile}/${coordinatePath}?${query}`;

  const response = await fetch(url, { signal: options.signal });
  const body = await response.json() as DirectionsResponse | DirectionsErrorResponse;

  if (!response.ok || body.code !== 'Ok') {
    const error = body as DirectionsErrorResponse;

    throw new MapboxDirectionsError(
      error.message ?? `Mapbox Directions request failed with HTTP ${response.status}.`,
      { code: error.code, status: response.status },
    );
  }

  return body as DirectionsResponse;
}

export type DirectionsRouteFeatureProperties = {
  distance: number;
  duration: number;
  weight: number;
  weightName: string;
};

/** Convert a returned route into data that can be passed to a GeoJSON source. */
export function directionsRouteToFeature(
  route: DirectionsRoute,
): Feature<LineString, DirectionsRouteFeatureProperties> {
  return {
    type: 'Feature',
    properties: {
      distance: route.distance,
      duration: route.duration,
      weight: route.weight,
      weightName: route.weight_name,
    },
    geometry: route.geometry,
  };
}
