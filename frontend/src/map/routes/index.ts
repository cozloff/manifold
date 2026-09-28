import type { Feature, LineString } from 'geojson';

import routeData from './primary-to-secondary.route.json';

export type StoredDirectionsRouteProperties = {
  id: string;
  profile: string;
  distanceMeters: number;
  durationSeconds: number;
};

/** Driving route fetched from Mapbox Directions for the two project waypoints. */
export const primaryToSecondaryRoute = routeData as Feature<
  LineString,
  StoredDirectionsRouteProperties
>;
