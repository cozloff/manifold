import type {
  HillshadeLayerSpecification,
  RasterDEMSourceSpecification,
  TerrainSpecification,
} from 'mapbox-gl';

/**
 * Add a terrain elevation source.
 *
 * This source is fundamentally different from the
 * GeoJSON source below.
 *
 * GeoJSON:
 *   semantic geographic features
 *
 * raster-dem:
 *   continuous physical elevation field
 */
export const terrainSource: RasterDEMSourceSpecification = {
    type: 'raster-dem',
    /**
     * Mapbox-hosted elevation tiles.
     */
    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
    /**
     * Size of each terrain tile.
     */
    tileSize: 512,
    /**
     * Highest native zoom level Mapbox requests from
     * this DEM source.
     */    
    maxzoom: 14,
};

/**
 * Tell Mapbox to use the elevation source
 * to physically displace the map surface.
 *
 * This changes the geometry of the rendered world.
 *
 * exaggeration:
 *
 * 1.0 = physically proportional elevation
 * 1.5 = 50% exaggerated
 * 2.0 = double vertical exaggeration
 */
export const terrainConfig: TerrainSpecification = {
  source: 'terrain-dem',
  exaggeration: 1,
};


/**
 * Add hillshade using the same DEM source.
 *
 * Terrain and hillshade do different things:
 *
 * terrain:
 *   modifies geometry
 *
 * hillshade:
 *   modifies visual appearance based on slope and light
 *
 * DEM
 * ├── terrain displacement
 * └── hillshade visualization
 */
export const terrainHillshadeLayer: HillshadeLayerSpecification = {
    id: 'terrain-hillshade',
    type: 'hillshade',
    source: 'terrain-dem',

    paint: {
    /**
     * Controls how dark shaded terrain can become.
     */
    'hillshade-shadow-color': '#000000',

    /**
     * Controls the lighter side of terrain slopes.
     */
    'hillshade-highlight-color': '#ffffff',

    /**
     * Controls the general accent tone of terrain.
     */
    'hillshade-accent-color': '#666666',
    },
};