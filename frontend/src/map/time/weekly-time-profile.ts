import mapboxgl from 'mapbox-gl';
import type {
  CustomLayerInterface,
  IControl,
  Map as MapboxMap,
} from 'mapbox-gl';

import { routeTrace } from '~/map/routes/route-trace';

import scheduleData from './schedule.json';

type Coordinate = [longitude: number, latitude: number];
type LocationKey = 'home' | 'road' | 'work';
type RgbColor = [red: number, green: number, blue: number];

type ScheduleDocument = {
  week_minutes: number;
  activities: Record<string, {
    location: LocationKey;
    blocks: Array<{
      days: string[];
      start: string;
      end: string;
    }>;
  }>;
};

export type WeeklyActivityAggregate = {
  activity: string;
  color: string;
  hours: number;
  location: LocationKey;
  minutes: number;
  percentageOfLocation: number;
  percentageOfWeek: number;
};

export type WeeklyLocationAggregate = {
  activities: WeeklyActivityAggregate[];
  color: string;
  heightMeters: number;
  hours: number;
  label: string;
  location: LocationKey;
  minutes: number;
  percentageOfWeek: number;
};

type StackBand = {
  activity: WeeklyActivityAggregate;
  baseHeightMeters: number;
  heightMeters: number;
  projectedPercentage: number;
};

type MeshPoint = {
  bands: StackBand[];
  groundZ: number;
  mercatorUnitsPerMeter: number;
  progress: number;
  totalHeightMeters: number;
  x: number;
  y: number;
};

type HologramMesh = {
  edgeVertices: Float32Array;
  faceVertices: Float32Array;
};

type HologramProgram = {
  attributes: {
    color: number;
    height: number;
    position: number;
    progress: number;
  };
  program: WebGLProgram;
  uniforms: {
    alpha: WebGLUniformLocation | null;
    matrix: WebGLUniformLocation | null;
    textureStrength: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
  };
};

const schedule = scheduleData as unknown as ScheduleDocument;
const locationOrder: LocationKey[] = ['home', 'road', 'work'];
const meshSectionCount = 640;
const earthRadiusMeters = 6_371_008.8;
const floatsPerVertex = 8;

/** The three aggregate heights remain linearly proportional to the real week. */
export const weeklyTimeMetersPerPercentagePoint = 28;
export const weeklyTimeHologramLayerId = 'weekly-time-hologram';

const locationColors: Record<LocationKey, string> = {
  home: '#20dfff',
  road: '#ff9f32',
  work: '#16e6d2',
};

/** Cyan-spectrum bands produce one cohesive holographic material. */
const activityColors: Record<string, string> = {
  Sleep: '#216dff',
  'Get Ready': '#55e8ff',
  Commute: '#2de4ff',
  Gridies: '#00aee8',
  Lunch: '#22d9ce',
  Exercise: '#75f5ff',
  Shower: '#168fff',
  Eat: '#00c8d8',
  'Pack for next day': '#3688d8',
  'Podcast Rest': '#4cc5ff',
  'Work Lunch': '#00dbbd',
};

function parseClock(clock: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) throw new Error(`Invalid schedule time: ${clock}`);

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const isValid = hours >= 0
    && hours <= 24
    && minutes >= 0
    && minutes < 60
    && (hours !== 24 || minutes === 0);

  if (!isValid) throw new Error(`Invalid schedule time: ${clock}`);
  return (hours * 60) + minutes;
}

function aggregateSchedule(document: ScheduleDocument): WeeklyLocationAggregate[] {
  const minutesByLocation = new Map<LocationKey, Map<string, number>>(
    locationOrder.map((location) => [location, new Map()]),
  );

  Object.entries(document.activities).forEach(([activity, definition]) => {
    const activityMinutes = definition.blocks.reduce((total, block) => {
      const duration = parseClock(block.end) - parseClock(block.start);
      if (duration <= 0) throw new Error(`${activity} must end after it starts.`);
      return total + (duration * block.days.length);
    }, 0);

    const locationActivities = minutesByLocation.get(definition.location);
    if (!locationActivities) {
      throw new Error(`Unknown schedule location: ${definition.location}`);
    }
    locationActivities.set(activity, activityMinutes);
  });

  const scheduledMinutes = [...minutesByLocation.values()].reduce(
    (weekTotal, activities) => weekTotal + [...activities.values()].reduce(
      (locationTotal, minutes) => locationTotal + minutes,
      0,
    ),
    0,
  );

  if (scheduledMinutes !== document.week_minutes) {
    throw new Error(
      `Schedule accounts for ${scheduledMinutes} of ${document.week_minutes} minutes.`,
    );
  }

  return locationOrder.map((location) => {
    const rawActivities = [...minutesByLocation.get(location)!.entries()];
    const minutes = rawActivities.reduce(
      (total, [, activityMinutes]) => total + activityMinutes,
      0,
    );
    const percentageOfWeek = (minutes / document.week_minutes) * 100;

    return {
      location,
      label: location.toUpperCase(),
      color: locationColors[location],
      minutes,
      hours: minutes / 60,
      percentageOfWeek,
      heightMeters: percentageOfWeek * weeklyTimeMetersPerPercentagePoint,
      activities: rawActivities
        .map(([activity, activityMinutes]) => ({
          activity,
          color: activityColors[activity] ?? '#36dcff',
          hours: activityMinutes / 60,
          location,
          minutes: activityMinutes,
          percentageOfLocation: (activityMinutes / minutes) * 100,
          percentageOfWeek: (activityMinutes / document.week_minutes) * 100,
        }))
        .sort((left, right) => right.minutes - left.minutes),
    };
  });
}

export const weeklyLocationSummary = aggregateSchedule(schedule);

const summaryByLocation = Object.fromEntries(
  weeklyLocationSummary.map((summary) => [summary.location, summary]),
) as Record<LocationKey, WeeklyLocationAggregate>;

const stackOrder = locationOrder.flatMap(
  (location) => summaryByLocation[location].activities,
);

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function distanceBetween(left: Coordinate, right: Coordinate): number {
  const latitudeDelta = toRadians(right[1] - left[1]);
  const longitudeDelta = toRadians(right[0] - left[0]);
  const leftLatitude = toRadians(left[1]);
  const rightLatitude = toRadians(right[1]);
  const haversine = (Math.sin(latitudeDelta / 2) ** 2)
    + Math.cos(leftLatitude)
      * Math.cos(rightLatitude)
      * (Math.sin(longitudeDelta / 2) ** 2);

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

const routeCoordinates = routeTrace.geometry.coordinates.map(
  ([longitude, latitude]) => [longitude, latitude] as Coordinate,
);

const cumulativeRouteDistances = routeCoordinates.reduce<number[]>(
  (distances, coordinate, index) => {
    if (index === 0) return [0];
    distances.push(
      distances[index - 1]
        + distanceBetween(routeCoordinates[index - 1], coordinate),
    );
    return distances;
  },
  [],
);

const routeLengthMeters = cumulativeRouteDistances.at(-1) ?? 0;

function interpolateCoordinate(
  left: Coordinate,
  right: Coordinate,
  progress: number,
): Coordinate {
  return [
    left[0] + ((right[0] - left[0]) * progress),
    left[1] + ((right[1] - left[1]) * progress),
  ];
}

function coordinateAtProgress(progress: number): Coordinate {
  const targetDistance = routeLengthMeters * progress;
  if (targetDistance <= 0) return [...routeCoordinates[0]];
  if (targetDistance >= routeLengthMeters) return [...routeCoordinates.at(-1)!];

  const rightIndex = cumulativeRouteDistances.findIndex(
    (distance) => distance >= targetDistance,
  );
  const leftIndex = rightIndex - 1;
  const segmentStart = cumulativeRouteDistances[leftIndex];
  const segmentLength = cumulativeRouteDistances[rightIndex] - segmentStart;

  return interpolateCoordinate(
    routeCoordinates[leftIndex],
    routeCoordinates[rightIndex],
    (targetDistance - segmentStart) / segmentLength,
  );
}

function smoothstep(progress: number): number {
  return progress * progress * (3 - (2 * progress));
}

/**
 * Endpoint activities remain at their waypoint towers. Seven interpolated
 * mesh sections form each short curved shoulder; the route interior is only
 * the commute value.
 */
function locationWeights(progress: number): Record<LocationKey, number> {
  const endpointPlateau = 0.004;
  const transitionEnd = 0.015;

  if (progress <= endpointPlateau) {
    return { home: 1, road: 0, work: 0 };
  }

  if (progress < transitionEnd) {
    const roadWeight = smoothstep(
      (progress - endpointPlateau) / (transitionEnd - endpointPlateau),
    );
    return { home: 1 - roadWeight, road: roadWeight, work: 0 };
  }

  if (progress <= 1 - transitionEnd) {
    return { home: 0, road: 1, work: 0 };
  }

  if (progress < 1 - endpointPlateau) {
    const workWeight = smoothstep(
      (progress - (1 - transitionEnd)) / (transitionEnd - endpointPlateau),
    );
    return { home: 0, road: 1 - workWeight, work: workWeight };
  }

  return { home: 0, road: 0, work: 1 };
}

function projectedBands(progress: number): StackBand[] {
  const weights = locationWeights(progress);
  let accumulatedHeight = 0;

  return stackOrder.map((activity) => {
    const projectedPercentage = activity.percentageOfWeek
      * weights[activity.location];
    const baseHeightMeters = accumulatedHeight;
    accumulatedHeight += projectedPercentage
      * weeklyTimeMetersPerPercentagePoint;

    return {
      activity,
      baseHeightMeters,
      heightMeters: accumulatedHeight,
      projectedPercentage,
    };
  });
}

function hexToRgb(color: string): RgbColor {
  const value = Number.parseInt(color.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function appendVertex(
  target: number[],
  point: MeshPoint,
  heightMeters: number,
  color: RgbColor,
): void {
  target.push(
    point.x,
    point.y,
    point.groundZ + (heightMeters * point.mercatorUnitsPerMeter),
    color[0],
    color[1],
    color[2],
    point.progress,
    heightMeters,
  );
}

function appendLine(
  target: number[],
  left: MeshPoint,
  leftHeight: number,
  right: MeshPoint,
  rightHeight: number,
  color: RgbColor,
): void {
  appendVertex(target, left, leftHeight, color);
  appendVertex(target, right, rightHeight, color);
}

function buildHologramMesh(map: MapboxMap): HologramMesh {
  const points: MeshPoint[] = [];

  for (let index = 0; index <= meshSectionCount; index += 1) {
    const progress = index / meshSectionCount;
    const coordinate = coordinateAtProgress(progress);
    const groundMeters = map.queryTerrainElevation(coordinate, {
      exaggerated: true,
    }) ?? 0;
    const mercator = mapboxgl.MercatorCoordinate.fromLngLat(
      coordinate,
      groundMeters + 3,
    );
    const bands = projectedBands(progress);

    points.push({
      bands,
      groundZ: mercator.z,
      mercatorUnitsPerMeter: mercator.meterInMercatorCoordinateUnits(),
      progress,
      totalHeightMeters: bands.at(-1)?.heightMeters ?? 0,
      x: mercator.x,
      y: mercator.y,
    });
  }

  const faceVertices: number[] = [];
  const edgeVertices: number[] = [];
  const roofColor: RgbColor = [0.76, 0.99, 1];
  const gridColor: RgbColor = [0.12, 0.78, 0.96];

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];

    stackOrder.forEach((activity, bandIndex) => {
      const leftBand = left.bands[bandIndex];
      const rightBand = right.bands[bandIndex];
      if (
        leftBand.projectedPercentage <= 0.0001
        && rightBand.projectedPercentage <= 0.0001
      ) return;

      const color = hexToRgb(activity.color);

      appendVertex(
        faceVertices,
        left,
        leftBand.baseHeightMeters,
        color,
      );
      appendVertex(faceVertices, left, leftBand.heightMeters, color);
      appendVertex(
        faceVertices,
        right,
        rightBand.baseHeightMeters,
        color,
      );
      appendVertex(faceVertices, left, leftBand.heightMeters, color);
      appendVertex(faceVertices, right, rightBand.heightMeters, color);
      appendVertex(
        faceVertices,
        right,
        rightBand.baseHeightMeters,
        color,
      );

      appendLine(
        edgeVertices,
        left,
        leftBand.heightMeters,
        right,
        rightBand.heightMeters,
        color,
      );
    });

    appendLine(
      edgeVertices,
      left,
      left.totalHeightMeters,
      right,
      right.totalHeightMeters,
      roofColor,
    );

    appendLine(edgeVertices, left, 0, right, 0, gridColor);
  }

  points.forEach((point, index) => {
    const isEndpointMesh = point.progress < 0.02 || point.progress > 0.98;
    const interval = isEndpointMesh ? 5 : 24;
    if (index % interval !== 0 && index !== points.length - 1) return;

    appendLine(
      edgeVertices,
      point,
      0,
      point,
      point.totalHeightMeters,
      gridColor,
    );
  });

  return {
    faceVertices: new Float32Array(faceVertices),
    edgeVertices: new Float32Array(edgeVertices),
  };
}

const vertexShaderSource = `
  precision highp float;

  attribute vec3 a_position;
  attribute vec3 a_color;
  attribute float a_progress;
  attribute float a_height;

  uniform mat4 u_matrix;

  varying vec3 v_color;
  varying float v_progress;
  varying float v_height;

  void main() {
    gl_Position = u_matrix * vec4(a_position, 1.0);
    v_color = a_color;
    v_progress = a_progress;
    v_height = a_height;
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform float u_alpha;
  uniform float u_texture_strength;
  uniform float u_time;

  varying vec3 v_color;
  varying float v_progress;
  varying float v_height;

  void main() {
    float horizontal = pow(
      0.5 + (0.5 * cos((v_height * 0.12) - (u_time * 0.9))),
      18.0
    );
    float vertical = pow(
      0.5 + (0.5 * cos((v_progress * 820.0) + (u_time * 0.35))),
      28.0
    );
    float travel = pow(
      0.5 + (0.5 * cos((v_progress * 110.0) - (u_time * 2.3))),
      42.0
    );
    float texture = clamp(
      (horizontal * 0.55) + (vertical * 0.22) + (travel * 0.7),
      0.0,
      1.0
    ) * u_texture_strength;
    vec3 energized = mix(v_color, vec3(0.72, 0.98, 1.0), texture * 0.62);
    float alpha = u_alpha * (0.68 + (texture * 0.32));

    gl_FragColor = vec4(energized * alpha, alpha);
  }
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create hologram shader.');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Unable to compile hologram shader: ${log}`);
  }
  return shader;
}

function createHologramProgram(gl: WebGL2RenderingContext): HologramProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  );
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create hologram program.');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Unable to link hologram program: ${log}`);
  }

  return {
    program,
    attributes: {
      position: gl.getAttribLocation(program, 'a_position'),
      color: gl.getAttribLocation(program, 'a_color'),
      progress: gl.getAttribLocation(program, 'a_progress'),
      height: gl.getAttribLocation(program, 'a_height'),
    },
    uniforms: {
      matrix: gl.getUniformLocation(program, 'u_matrix'),
      alpha: gl.getUniformLocation(program, 'u_alpha'),
      textureStrength: gl.getUniformLocation(program, 'u_texture_strength'),
      time: gl.getUniformLocation(program, 'u_time'),
    },
  };
}

class WeeklyTimeHologramLayer implements CustomLayerInterface {
  readonly id = weeklyTimeHologramLayerId;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private edgeBuffer?: WebGLBuffer;
  private edgeVao?: WebGLVertexArrayObject;
  private edgeVertexCount = 0;
  private faceBuffer?: WebGLBuffer;
  private faceVao?: WebGLVertexArrayObject;
  private faceVertexCount = 0;
  private map?: MapboxMap;
  private program?: HologramProgram;
  private startedAt = performance.now();

  onAdd(map: MapboxMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.program = createHologramProgram(gl);
    const mesh = buildHologramMesh(map);

    this.faceBuffer = gl.createBuffer() ?? undefined;
    if (!this.faceBuffer) throw new Error('Unable to create hologram face buffer.');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.faceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.faceVertices, gl.STATIC_DRAW);
    this.faceVertexCount = mesh.faceVertices.length / floatsPerVertex;

    this.edgeBuffer = gl.createBuffer() ?? undefined;
    if (!this.edgeBuffer) throw new Error('Unable to create hologram edge buffer.');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.edgeVertices, gl.STATIC_DRAW);
    this.edgeVertexCount = mesh.edgeVertices.length / floatsPerVertex;

    this.faceVao = gl.createVertexArray() ?? undefined;
    if (!this.faceVao) throw new Error('Unable to create hologram face VAO.');
    gl.bindVertexArray(this.faceVao);
    this.bindAttributes(gl, this.faceBuffer);

    this.edgeVao = gl.createVertexArray() ?? undefined;
    if (!this.edgeVao) throw new Error('Unable to create hologram edge VAO.');
    gl.bindVertexArray(this.edgeVao);
    this.bindAttributes(gl, this.edgeBuffer);
    gl.bindVertexArray(null);
  }

  private bindAttributes(gl: WebGL2RenderingContext, buffer: WebGLBuffer): void {
    const program = this.program!;
    const stride = floatsPerVertex * Float32Array.BYTES_PER_ELEMENT;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.enableVertexAttribArray(program.attributes.position);
    gl.vertexAttribPointer(
      program.attributes.position,
      3,
      gl.FLOAT,
      false,
      stride,
      0,
    );
    gl.enableVertexAttribArray(program.attributes.color);
    gl.vertexAttribPointer(
      program.attributes.color,
      3,
      gl.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.enableVertexAttribArray(program.attributes.progress);
    gl.vertexAttribPointer(
      program.attributes.progress,
      1,
      gl.FLOAT,
      false,
      stride,
      6 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.enableVertexAttribArray(program.attributes.height);
    gl.vertexAttribPointer(
      program.attributes.height,
      1,
      gl.FLOAT,
      false,
      stride,
      7 * Float32Array.BYTES_PER_ELEMENT,
    );
  }

  render(gl: WebGL2RenderingContext, matrix: Array<number>): void {
    if (!this.program || !this.faceVao || !this.edgeVao) return;

    gl.useProgram(this.program.program);
    gl.uniformMatrix4fv(this.program.uniforms.matrix, false, matrix);
    gl.uniform1f(
      this.program.uniforms.time,
      (performance.now() - this.startedAt) / 1_000,
    );

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    gl.bindVertexArray(this.faceVao);
    gl.uniform1f(this.program.uniforms.alpha, 0.24);
    gl.uniform1f(this.program.uniforms.textureStrength, 1);
    gl.drawArrays(gl.TRIANGLES, 0, this.faceVertexCount);

    gl.bindVertexArray(this.edgeVao);
    gl.uniform1f(this.program.uniforms.alpha, 0.72);
    gl.uniform1f(this.program.uniforms.textureStrength, 0.35);
    gl.drawArrays(gl.LINES, 0, this.edgeVertexCount);

    gl.bindVertexArray(null);
    gl.depthMask(true);
    this.map?.triggerRepaint();
  }

  onRemove(_map: MapboxMap, gl: WebGL2RenderingContext): void {
    if (this.faceBuffer) gl.deleteBuffer(this.faceBuffer);
    if (this.edgeBuffer) gl.deleteBuffer(this.edgeBuffer);
    if (this.faceVao) gl.deleteVertexArray(this.faceVao);
    if (this.edgeVao) gl.deleteVertexArray(this.edgeVao);
    if (this.program) gl.deleteProgram(this.program.program);
    this.faceBuffer = undefined;
    this.edgeBuffer = undefined;
    this.faceVao = undefined;
    this.edgeVao = undefined;
    this.program = undefined;
    this.map = undefined;
  }
}

export const weeklyTimeSummary = {
  coveragePercentage: weeklyLocationSummary.reduce(
    (total, location) => total + location.percentageOfWeek,
    0,
  ),
  weekHours: schedule.week_minutes / 60,
  metersPerPercentagePoint: weeklyTimeMetersPerPercentagePoint,
  locations: weeklyLocationSummary,
};

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1);
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

class WeeklyTimeProfileControl implements IControl {
  private container?: HTMLElement;

  onAdd(_map: MapboxMap): HTMLElement {
    const panel = createElement('section', 'time-profile mapboxgl-ctrl');
    panel.setAttribute('aria-label', 'Weekly accumulated time by location');
    panel.append(
      createElement('div', 'time-profile__eyebrow', 'HOLO TIME TOPOLOGY'),
      createElement('h2', 'time-profile__title', 'ACCUMULATED TIME COST'),
    );

    const metrics = createElement('div', 'time-profile__metrics');
    weeklyLocationSummary.forEach((location) => {
      const metric = createElement('div', 'time-profile__metric');
      metric.append(
        createElement(
          'span',
          'time-profile__metric-value',
          `${location.percentageOfWeek.toFixed(1)}%`,
        ),
        createElement('span', 'time-profile__metric-label', location.label),
      );
      metrics.append(metric);
    });
    panel.append(metrics);
    panel.append(createElement(
      'div',
      'time-profile__scale',
      `TRUE RELATIVE HEIGHT  ·  ${weeklyTimeMetersPerPercentagePoint}M / 1%`,
    ));

    const locationList = createElement('div', 'time-profile__locations');
    weeklyLocationSummary.forEach((location) => {
      const row = createElement('div', 'time-profile__location');
      const heading = createElement('div', 'time-profile__location-heading');
      const identity = createElement('span', 'time-profile__location-name');
      const swatch = createElement('i', 'time-profile__swatch');
      swatch.style.backgroundColor = location.color;
      identity.append(swatch, document.createTextNode(location.label));
      heading.append(
        identity,
        createElement(
          'span',
          'time-profile__location-hours',
          `${formatHours(location.hours)}H / WEEK`,
        ),
      );

      const stack = createElement('div', 'time-profile__stack');
      location.activities.forEach((activity) => {
        const band = createElement('span', 'time-profile__stack-band');
        band.style.width = `${activity.percentageOfLocation}%`;
        band.style.backgroundColor = activity.color;
        band.title = `${activity.activity}: ${formatHours(activity.hours)} hours`;
        stack.append(band);
      });

      row.append(
        heading,
        stack,
        createElement(
          'div',
          'time-profile__activity-names',
          location.activities.map((activity) => activity.activity).join('  ·  '),
        ),
      );
      locationList.append(row);
    });
    panel.append(locationList);

    this.container = panel;
    return panel;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = undefined;
  }
}

/** Install the continuous WebGL area mesh and three-location summary. */
export function installWeeklyTimeProfile(map: MapboxMap): () => void {
  const layer = new WeeklyTimeHologramLayer();
  const control = new WeeklyTimeProfileControl();
  map.addLayer(layer);
  map.addControl(control, 'top-left');

  return () => {
    if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    if (map.hasControl(control)) map.removeControl(control);
  };
}
