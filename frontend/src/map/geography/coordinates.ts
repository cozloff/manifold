import type { Point } from 'geojson';

/**
 * Canonical geographic point registry.
 *
 * GeoJSON Point already gives us:
 *
 * - geometry type
 * - coordinate ordering
 * - compatibility with Mapbox
 * - compatibility with GeoJSON tooling
 * 
 */
export const points = {
  primaryLocation: {
    type: 'Point',
    coordinates: [-158.016064, 21.501808],
  },

  secondaryLocation: {
    type: 'Point',
    coordinates: [-158.0836632148755, 21.331367189521576],
  },
} as const satisfies Record<string, Point>;