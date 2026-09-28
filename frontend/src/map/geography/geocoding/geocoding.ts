const geocodingApiUrl = 'https://api.mapbox.com/search/geocode/v6';
const maximumQueryLength = 256;
const maximumQueryWordCount = 20;
const defaultBatchSize = 500;

export type GeocodingCoordinate = {
  latitude: number;
  longitude: number;
};

export type GeocodingMatchCode = {
  address_number?: string;
  confidence?: 'exact' | 'high' | 'medium' | 'low';
  locality?: string;
  place?: string;
  postcode?: string;
  region?: string;
  street?: string;
};

export type GeocodingFeature = {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Point';
    coordinates: [longitude: number, latitude: number];
  };
  properties: {
    mapbox_id: string;
    feature_type: string;
    name: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: GeocodingCoordinate & {
      accuracy?: string;
    };
    match_code?: GeocodingMatchCode;
  };
};

export type GeocodingResponse = {
  type: 'FeatureCollection';
  features: GeocodingFeature[];
  attribution?: string;
};

type BatchGeocodingResponse = {
  batch: GeocodingResponse[];
  attribution?: string;
};

type GeocodingErrorResponse = {
  code?: string;
  message?: string;
};

export type GetGeocodingOptions = {
  /** Defaults to the existing Vite token or the matching Node environment variable. */
  accessToken?: string;
  autocomplete?: boolean;
  language?: string;
  limit?: number;
  /** Must remain true when results will be written to disk. */
  permanent?: boolean;
  signal?: AbortSignal;
};

export type TransformerFactoryCsvRow = {
  manufacturer: string;
  country: string;
  facility_location_raw: string;
  source_product_category: string;
  transmission_class_status: string;
  operational_status: string;
  max_voltage_kv: string;
  max_mva: string;
  source_url: string;
  notes: string;
  facility_address: string;
  address_precision: string;
  latitude: string;
  longitude: string;
  address_source_url: string;
};

export type FacilitySiteGeocoding = {
  address: string;
  coordinates: GeocodingCoordinate | null;
  status: 'existing_coordinates' | 'geocoded' | 'not_found';
  query?: string;
  mapbox_id?: string;
  feature_type?: string;
  matched_address?: string;
  accuracy?: string;
  match_code?: GeocodingMatchCode;
};

export type GeocodedTransformerFactory = Omit<
  TransformerFactoryCsvRow,
  'latitude' | 'longitude'
> & {
  latitude: number | null;
  longitude: number | null;
  coordinates: GeocodingCoordinate | null;
  geocoding_status: 'existing_coordinates' | 'geocoded' | 'partial' | 'not_found';
  geocoded_sites: FacilitySiteGeocoding[];
};

export class MapboxGeocodingError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(
    message: string,
    options: { code?: string; status?: number } = {},
  ) {
    super(message);
    this.name = 'MapboxGeocodingError';
    this.code = options.code;
    this.status = options.status;
  }
}

function defaultAccessToken(): string | undefined {
  return import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
}

function searchWords(query: string): string[] {
  return query.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function validateQuery(query: string): void {
  if (!query.trim()) {
    throw new RangeError('Mapbox Geocoding requires a non-empty query.');
  }

  if (query.length > maximumQueryLength) {
    throw new RangeError(
      `Mapbox Geocoding queries cannot exceed ${maximumQueryLength} characters.`,
    );
  }

  if (searchWords(query).length > maximumQueryWordCount) {
    throw new RangeError(
      `Mapbox Geocoding queries cannot exceed ${maximumQueryWordCount} words and numbers.`,
    );
  }

  if (query.includes(';')) {
    throw new RangeError('Mapbox Geocoding queries cannot contain semicolons.');
  }
}

function requestAccessToken(options: GetGeocodingOptions): string {
  const accessToken = options.accessToken ?? defaultAccessToken();
  if (!accessToken) {
    throw new MapboxGeocodingError(
      'A Mapbox access token is required. Set VITE_MAPBOX_ACCESS_TOKEN or pass accessToken.',
    );
  }
  return accessToken;
}

function requestParameters(options: GetGeocodingOptions): URLSearchParams {
  const query = new URLSearchParams({
    access_token: requestAccessToken(options),
    autocomplete: String(options.autocomplete ?? false),
    limit: String(options.limit ?? 1),
    permanent: String(options.permanent ?? true),
  });

  if (options.language) query.set('language', options.language);
  return query;
}

/** Retrieve one forward-geocoding result from Mapbox Geocoding API v6. */
export async function getMapboxGeocoding(
  searchText: string,
  options: GetGeocodingOptions = {},
): Promise<GeocodingResponse> {
  const normalizedQuery = searchText.trim();
  validateQuery(normalizedQuery);

  const query = requestParameters(options);
  query.set('q', normalizedQuery);

  const response = await fetch(`${geocodingApiUrl}/forward?${query}`, {
    signal: options.signal,
  });
  const body = await response.json() as GeocodingResponse | GeocodingErrorResponse;

  if (!response.ok || !('features' in body)) {
    const error = body as GeocodingErrorResponse;
    throw new MapboxGeocodingError(
      error.message ?? `Mapbox Geocoding request failed with HTTP ${response.status}.`,
      { code: error.code, status: response.status },
    );
  }

  return body;
}

/** Retrieve multiple forward-geocoding results while preserving query order. */
export async function getMapboxBatchGeocoding(
  searchTexts: readonly string[],
  options: GetGeocodingOptions = {},
): Promise<GeocodingResponse[]> {
  if (searchTexts.length === 0) return [];

  const normalizedQueries = searchTexts.map((searchText) => searchText.trim());
  normalizedQueries.forEach(validateQuery);
  const query = requestParameters(options);
  query.delete('autocomplete');
  query.delete('limit');

  const response = await fetch(`${geocodingApiUrl}/batch?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizedQueries.map((searchText) => ({
      q: searchText,
      autocomplete: options.autocomplete ?? false,
      limit: options.limit ?? 1,
      ...(options.language ? { language: options.language } : {}),
    }))),
    signal: options.signal,
  });
  const body = await response.json() as BatchGeocodingResponse | GeocodingErrorResponse;

  if (!response.ok || !('batch' in body)) {
    const error = body as GeocodingErrorResponse;
    throw new MapboxGeocodingError(
      error.message ?? `Mapbox batch geocoding failed with HTTP ${response.status}.`,
      { code: error.code, status: response.status },
    );
  }

  if (body.batch.length !== searchTexts.length) {
    throw new MapboxGeocodingError(
      `Mapbox returned ${body.batch.length} batch results for ${searchTexts.length} queries.`,
    );
  }

  return body.batch;
}

/** Convert a Mapbox point feature to unambiguous named coordinates. */
export function geocodingFeatureToCoordinates(
  feature: GeocodingFeature,
): GeocodingCoordinate {
  const longitude = feature.properties.coordinates?.longitude
    ?? feature.geometry.coordinates[0];
  const latitude = feature.properties.coordinates?.latitude
    ?? feature.geometry.coordinates[1];

  if (
    !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
  ) {
    throw new RangeError(`Invalid coordinates returned for ${feature.id}.`);
  }

  return { latitude, longitude };
}

/** Parse RFC 4180-style CSV text without introducing a runtime dependency. */
export function parseCsv(csv: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [rawHeaders, ...dataRows] = rows;
  if (!rawHeaders) return [];
  const headers = rawHeaders.map((header, index) => (
    index === 0 ? header.replace(/^\uFEFF/, '') : header
  ));

  return dataRows.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}.`,
      );
    }

    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    );
  });
}

function searchQueryForAddress(address: string): string {
  const normalized = address.replace(/\s+/g, ' ').trim();
  const words = searchWords(normalized);
  if (words.length <= maximumQueryWordCount) return normalized;

  // Preserve the street/site lead and the geographic tail (city/region/postcode/country).
  return [...words.slice(0, 12), ...words.slice(-8)].join(' ');
}

function existingCoordinates(
  row: TransformerFactoryCsvRow,
): GeocodingCoordinate | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (
    !row.latitude.trim()
    || !row.longitude.trim()
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
  ) return null;

  return geocodingFeatureToCoordinates({
    type: 'Feature',
    id: 'existing-coordinate',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: {
      mapbox_id: 'existing-coordinate',
      feature_type: 'existing-coordinate',
      name: row.manufacturer,
    },
  });
}

function matchedSite(
  address: string,
  query: string,
  response: GeocodingResponse,
): FacilitySiteGeocoding {
  const feature = response.features[0];
  if (!feature) {
    return { address, query, coordinates: null, status: 'not_found' };
  }

  return {
    address,
    query,
    coordinates: geocodingFeatureToCoordinates(feature),
    status: 'geocoded',
    mapbox_id: feature.properties.mapbox_id,
    feature_type: feature.properties.feature_type,
    matched_address: feature.properties.full_address
      ?? feature.properties.place_formatted
      ?? feature.properties.name,
    accuracy: feature.properties.coordinates?.accuracy,
    match_code: feature.properties.match_code,
  };
}

/**
 * Add coordinates to transformer-factory CSV records. Existing coordinates
 * are retained; only missing sites are sent to permanent Mapbox geocoding.
 */
export async function geocodeTransformerFactories(
  rows: readonly TransformerFactoryCsvRow[],
  options: GetGeocodingOptions & {
    batchSize?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<GeocodedTransformerFactory[]> {
  const siteResults = rows.map<FacilitySiteGeocoding[]>(() => []);
  const pending: Array<{
    address: string;
    query: string;
    rowIndex: number;
  }> = [];

  rows.forEach((row, rowIndex) => {
    const coordinates = existingCoordinates(row);
    const addresses = row.facility_address
      .split(';')
      .map((address) => address.trim())
      .filter(Boolean);

    if (coordinates && addresses.length === 1) {
      siteResults[rowIndex].push({
        address: addresses[0],
        coordinates,
        status: 'existing_coordinates',
      });
      return;
    }

    addresses.forEach((address) => {
      pending.push({
        address,
        query: searchQueryForAddress(address),
        rowIndex,
      });
    });
  });

  const batchSize = options.batchSize ?? defaultBatchSize;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a positive integer.');
  }

  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize);
    const responses = await getMapboxBatchGeocoding(
      batch.map((item) => item.query),
      { ...options, permanent: true },
    );

    batch.forEach((item, index) => {
      siteResults[item.rowIndex].push(
        matchedSite(item.address, item.query, responses[index]),
      );
    });
    options.onProgress?.(Math.min(start + batch.length, pending.length), pending.length);
  }

  return rows.map((row, rowIndex) => {
    const sites = siteResults[rowIndex];
    const foundSites = sites.filter((site) => site.coordinates);
    const primary = foundSites[0]?.coordinates ?? null;
    const existing = sites.length === 1 && sites[0]?.status === 'existing_coordinates';
    const geocodingStatus = existing
      ? 'existing_coordinates'
      : foundSites.length === 0
        ? 'not_found'
        : foundSites.length === sites.length
          ? 'geocoded'
          : 'partial';

    return {
      ...row,
      latitude: primary?.latitude ?? null,
      longitude: primary?.longitude ?? null,
      coordinates: primary,
      geocoding_status: geocodingStatus,
      geocoded_sites: sites,
    };
  });
}
