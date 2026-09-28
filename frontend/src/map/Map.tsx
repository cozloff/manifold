import { useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import {
  points,
  locations,
  createWaypointHologramImage,
  locationLayers,
  waypointHologramImageId,
  terrainSource,
  terrainConfig,
  terrainHillshadeLayer,
} from '~/map/geography';
import {
  routeTraceLayers,
  routeTraceSource,
  routeTraceSourceId,
} from '~/map/routes/route-trace';
import { installWeeklyTimeProfile } from '~/map/time/weekly-time-profile';

import '~/styles/index.css';

/**
 * Mapbox GL JS requires an access token before a Map instance is created.
 */
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export default function Map() {
  /**
   * `mountMap` is a React callback ref. React will call this function
   * when the <div> below becomes attached to the real browser DOM.
   *
   * MapBox is an imperative rendering system:
   *
   * The rendering of map state (layers, camera, etc.) requires explicit
   * commands to Mapbox API. Unlike React's declarative pattern, where UI
   * is a function of state/props. It's better to memoize the command functions
   * and pass in parameters from state/props.
   *
   */
  const mountMap = useCallback(
    (container: HTMLDivElement | null) => {
        /**
         * If React calls ref with `null` on DOM removal
         * don't construct anything because Mapbox needs
         * a real HTMLDivElement to attach its rendering canvas.
         */
        if (!container) return;

        /**
         * Create the Mapbox runtime.
         *
         * React owns: <div class="map" />
         * Mapbox owns: canvas, WebGL context, camera, tiles, rendering, etc.
         * React -> DOM container -> Mapbox -> WebGL -> GPU
         */
        const map = new mapboxgl.Map({
            /**
             * Mount Mapbox's rendering system inside
             * the DOM element React gave us.
             */
            container,

            /**
             * Mapbox Style URL.
             *
             * A Mapbox style defines things such as:
             *
             * - basemap
             * - roads
             * - labels
             * - water
             * - terrain appearance
             * - default layers
             */
            style: 'mapbox://styles/mapbox/dark-v11',

            /**
             * Initial camera center.
             */
            center: points.primaryLocation.coordinates as [number, number],

            /**
             * Initial map zoom.
             * Higher number = closer to the ground.
             */
            zoom: 11,

            /**
             * Tilt the camera toward the horizon.
             */
            pitch: 60,

            /**
             * Rotate the map slightly so the terrain has
             * more visual depth.
             */
            bearing: -20,
        });

        let removeWeeklyTimeProfile: (() => void) | undefined;

        /**
         * Add Mapbox's built-in navigation UI.
         *
         * This gives the map controls such as:
         *
         * + zoom / - zoom
         * compass / bearing reset
         *
         * Mapbox handles this component itself;
         * React doesn't need to render those buttons.
         */
        map.addControl(
            new mapboxgl.NavigationControl(),
            'top-right',
        );

        /**
         * Add terrain source, configuration, and hillshade layer
         * once the style has loaded.
         */
        map.on('style.load', () => {
            map.addSource('terrain-dem', terrainSource);

            map.setTerrain(terrainConfig);

            map.addLayer(terrainHillshadeLayer);
        });

        /**
         * Mapbox styles and their internal sources load asynchronously.
         * We wait for `load` before adding our own source and layer.
         *
         * Map instance --> style loaded --> + app data --> + rendering instructions
         */
        map.on('load', () => {
            map.addSource('locations', {
                type: 'geojson',
                data: locations,
            });

            map.addSource(routeTraceSourceId, routeTraceSource);

            routeTraceLayers.forEach((layer) => {
                map.addLayer(layer);
            });

            removeWeeklyTimeProfile = installWeeklyTimeProfile(map);

            if (!map.hasImage(waypointHologramImageId)) {
                map.addImage(
                    waypointHologramImageId,
                    createWaypointHologramImage(),
                    { pixelRatio: 2 },
                );
            }

            locationLayers.forEach((layer) => {
                map.addLayer(layer);
            });
        });

        /**
         * React invokes on DOM node removal / ref lifecycle teardown.
         *
         * `map.remove()` ensures Mapbox owned resources outside React
         * are properly released.
         */
        return () => {
            removeWeeklyTimeProfile?.();
            map.remove();
        };
        },

        /**
         * Keep callback identity across renders. Could cause React to
         * detach and remount the imperative resource.
         *
         * The imported coordinate and location objects are module-level
         * constants, so they do not belong in this dependency array.
         */
        [],
  );

  return (
    <div
      ref={mountMap}
      className="map"
    />
  );
}
