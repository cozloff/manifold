// import type {
//   FeatureCollection,
//   Point,
// } from 'geojson';

// import { points } from './coordinates';

// /**
//  * Semantic geographic data is constructed from points.
//  *
//  * Point:
//  *   describes WHERE something exists.
//  *
//  * Feature:
//  *   describes WHAT exists at that location.
//  *
//  * GeoJSON:
//  *   provides the geographic projection Mapbox understands.
//  *
//  * Point --> Domain Feature --> GeoJSON FeatureCollection --> Mapbox Source
//  */
// export const locations: FeatureCollection<Point> = {
//   /**
//    * A GeoJSON FeatureCollection is simply a collection
//    * of geographic features.
//    *
//    * FeatureCollection
//    * └── features[]
//    *     ├── Feature
//    *     ├── Feature
//    *     └── ...
//    */
//   type: 'FeatureCollection',

//   features: [
//       /**
//        * A Feature combines:
//        *
//        * 1. geometry
//        * 2. arbitrary semantic/domain properties
//        *
//        */
//     {
//       type: 'Feature',
//       properties: {
//         id: 'primary-location',
//       },
//       geometry: points.primaryLocation,
//     },

//     {
//       type: 'Feature',
//       properties: {
//         id: 'secondary-location',
//       },
//       geometry: points.secondaryLocation,
//     },
//   ],
// };
import type {
  FeatureCollection,
  Point,
} from 'geojson';

import { points } from './coordinates';
import { transformerFactoryLocations } from './geocoding/transformer-factory-locations';

/**
 * Semantic properties associated with each geographic feature.
 *
 * Geometry answers:
 *   WHERE is it?
 *
 * Properties answer:
 *   WHAT is it?
 *   HOW should it be described?
 *   WHAT telemetry should the HUD display?
 */
export type LocationProperties = {
  detail?: string;
  id: string;
  name: string;
  kind: string;
  value: number;
  unit: string;
  status: 'nominal' | 'warning' | 'critical';
};

/**
 * Semantic geographic data is constructed from points.
 *
 * Point:
 *   describes WHERE something exists.
 *
 * Feature:
 *   describes WHAT exists at that location.
 *
 * GeoJSON:
 *   provides the geographic projection Mapbox understands.
 *
 * Point --> Domain Feature --> GeoJSON FeatureCollection --> Mapbox Source
 */
export const locations: FeatureCollection<
  Point,
  LocationProperties
> = {
  type: 'FeatureCollection',

  features: [
    {
      type: 'Feature',
      properties: {
        id: 'primary-location',
        name: 'Primary Node',
        kind: 'WAYPOINT',
        value: 530,
        unit: 'kW',
        status: 'nominal',
      },
      geometry: points.primaryLocation,
    },

    {
      type: 'Feature',
      properties: {
        id: 'secondary-location',
        name: 'Secondary Node',
        kind: 'WAYPOINT',
        value: 117,
        unit: 'kW',
        status: 'warning',
      },
      geometry: points.secondaryLocation,
    },

    ...transformerFactoryLocations,
  ],
};
