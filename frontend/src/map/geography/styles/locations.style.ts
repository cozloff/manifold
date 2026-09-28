import type {
  CircleLayerSpecification,
  FilterSpecification,
  SymbolLayerSpecification,
} from 'mapbox-gl';

/** Apply this treatment only to waypoint features. */
const waypointFilter: FilterSpecification = [
  '==',
  ['get', 'kind'],
  'WAYPOINT',
];

const waypointBlue = '#2d8cff';
const waypointHoverHeight = 64;

export const waypointHologramImageId = 'waypoint-hologram';

/**
 * Draw the circular node and laser into one image so their connection is
 * structural.
 * The image is anchored at its bottom edge: that edge is the geographic
 * coordinate, while the node is permanently attached to the laser's top.
 */
export function createWaypointHologramImage(): ImageData {
  const pixelRatio = 2;
  const width = 32;
  const height = 84;
  const canvas = document.createElement('canvas');

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to create the waypoint hologram canvas.');
  }

  context.scale(pixelRatio, pixelRatio);

  const centerX = width / 2;
  const nodeCenterY = 12;
  const nodeRadius = 10;
  const laserTopY = nodeCenterY + nodeRadius;

  // Thin laser glow. The core starts beneath the pin and ends exactly at the
  // image anchor, keeping the pole fixed to both endpoints.
  context.beginPath();
  context.moveTo(centerX, laserTopY);
  context.lineTo(centerX, height);
  context.lineCap = 'round';
  context.lineWidth = 2.5;
  context.strokeStyle = 'rgba(45, 140, 255, 0.28)';
  context.shadowColor = 'rgba(45, 140, 255, 0.72)';
  context.shadowBlur = 4;
  context.stroke();

  context.beginPath();
  context.moveTo(centerX, laserTopY);
  context.lineTo(centerX, height);
  context.lineWidth = 0.75;
  context.strokeStyle = 'rgba(129, 218, 255, 0.92)';
  context.shadowBlur = 0;
  context.stroke();

  // Small pulses sit on the same centerline without widening the pole.
  context.fillStyle = 'rgba(225, 248, 255, 0.92)';
  for (let y = laserTopY + 9; y < height - 3; y += 10) {
    context.beginPath();
    context.arc(centerX, y, 0.8, 0, Math.PI * 2);
    context.fill();
  }

  // True circular node. It is painted last so its lower tangent cleanly caps
  // the laser without introducing a pin or pear-shaped tail.
  context.beginPath();
  context.arc(centerX, nodeCenterY, nodeRadius, 0, Math.PI * 2);
  context.fillStyle = waypointBlue;
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  context.lineWidth = 1;
  context.shadowColor = 'rgba(4, 15, 28, 0.75)';
  context.shadowBlur = 3;
  context.shadowOffsetY = 1;
  context.fill();
  context.stroke();

  context.beginPath();
  context.arc(centerX, nodeCenterY, 3.25, 0, Math.PI * 2);
  context.fillStyle = '#ffffff';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.fill();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Soft ground contact clamped to the waypoint coordinate. */
export const waypointGroundGlowLayer: CircleLayerSpecification = {
  id: 'locations-waypoint-ground-glow',
  type: 'circle',
  source: 'locations',
  filter: waypointFilter,

  paint: {
    'circle-radius': 15,
    'circle-color': waypointBlue,
    'circle-opacity': 0.16,
    'circle-blur': 0.9,
    'circle-pitch-alignment': 'map',
    'circle-pitch-scale': 'map',
  },
};

/** Bright emitter at the laser's fixed geographic endpoint. */
export const waypointGroundEmitterLayer: CircleLayerSpecification = {
  id: 'locations-waypoint-ground-emitter',
  type: 'circle',
  source: 'locations',
  filter: waypointFilter,

  paint: {
    'circle-radius': 2.5,
    'circle-color': '#c9f1ff',
    'circle-opacity': 0.95,
    'circle-stroke-width': 3,
    'circle-stroke-color': 'rgba(45, 140, 255, 0.16)',
    'circle-pitch-alignment': 'map',
    'circle-pitch-scale': 'map',
  },
};

/** One bottom-anchored symbol contains both the pin and its thin laser pole. */
export const waypointHologramLayer: SymbolLayerSpecification = {
  id: 'locations-waypoint-hologram',
  type: 'symbol',
  source: 'locations',
  filter: waypointFilter,

  layout: {
    'icon-image': waypointHologramImageId,
    'icon-size': 1,
    'icon-anchor': 'bottom',
    'icon-pitch-alignment': 'viewport',
    'icon-rotation-alignment': 'viewport',
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  },
};

/** Compact cyan heading positioned to the right of the hovering node. */
export const waypointTitleLayer: SymbolLayerSpecification = {
  id: 'locations-waypoint-title',
  type: 'symbol',
  source: 'locations',
  filter: waypointFilter,

  layout: {
    'text-field': ['get', 'name'],
    'text-size': 10,
    'text-transform': 'uppercase',
    'text-letter-spacing': 0.05,
    'text-offset': [1.5, -1.05],
    'text-anchor': 'left',
    'text-justify': 'left',
    'text-pitch-alignment': 'viewport',
    'text-rotation-alignment': 'viewport',
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },

  paint: {
    'text-color': '#56c7ff',
    'text-halo-color': 'rgba(15, 22, 28, 0.95)',
    'text-halo-width': 1,
    'text-halo-blur': 0.25,
    'text-translate': [0, -waypointHoverHeight],
    'text-translate-anchor': 'viewport',
  },
};

/** Secondary white line mirrors the compact annotation in the reference. */
export const waypointDetailLayer: SymbolLayerSpecification = {
  id: 'locations-waypoint-detail',
  type: 'symbol',
  source: 'locations',
  filter: waypointFilter,

  layout: {
    'text-field': [
      'coalesce',
      ['get', 'detail'],
      [
        'concat',
        ['get', 'kind'],
        ' • ',
        ['to-string', ['get', 'value']],
        ' ',
        ['get', 'unit'],
      ],
    ],
    'text-size': 10,
    'text-offset': [1.5, 0.15],
    'text-anchor': 'left',
    'text-justify': 'left',
    'text-pitch-alignment': 'viewport',
    'text-rotation-alignment': 'viewport',
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },

  paint: {
    'text-color': '#ffffff',
    'text-halo-color': 'rgba(15, 22, 28, 0.95)',
    'text-halo-width': 1,
    'text-halo-blur': 0.25,
    'text-translate': [0, -waypointHoverHeight],
    'text-translate-anchor': 'viewport',
  },
};

export const locationLayers = [
  waypointGroundGlowLayer,
  waypointGroundEmitterLayer,
  waypointHologramLayer,
  waypointTitleLayer,
  waypointDetailLayer,
];
