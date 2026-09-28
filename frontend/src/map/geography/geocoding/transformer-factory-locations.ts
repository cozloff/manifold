import type {
  Feature,
  Point,
} from 'geojson';

import type { LocationProperties } from '~/map/geography/locations';
import type {
  FacilitySiteGeocoding,
  GeocodedTransformerFactory,
} from '~/map/geography/geocoding/geocoding';

import factoryDatasetJson from './transmission_power_transformer_factories_geocoded_v23.json';

type FactoryDataset = {
  facilities: GeocodedTransformerFactory[];
};

export type TransformerFactoryLocationProperties = LocationProperties & {
  address: string;
  addressPrecision: string;
  category: 'transformer_factory';
  confidence: string;
  country: string;
  detail: string;
  featureType: string;
  manufacturer: string;
  sourceUrl: string;
};

const factoryDataset = factoryDatasetJson as unknown as FactoryDataset;

function positiveNumber(value: string): number | null {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number > 0
    ? number
    : null;
}

function facilityMetric(facility: GeocodedTransformerFactory): {
  detail: string;
  unit: string;
  value: number;
} {
  const maxMva = positiveNumber(facility.max_mva);
  const maxVoltageKv = positiveNumber(facility.max_voltage_kv);

  if (maxMva) {
    return {
      detail: `${facility.facility_location_raw} • ${maxMva} MVA`,
      unit: 'MVA',
      value: maxMva,
    };
  }

  if (maxVoltageKv) {
    return {
      detail: `${facility.facility_location_raw} • ${maxVoltageKv} kV`,
      unit: 'kV',
      value: maxVoltageKv,
    };
  }

  return {
    detail: `${facility.facility_location_raw} • ${facility.country}`,
    unit: 'SITE',
    value: 1,
  };
}

function waypointStatus(
  site: FacilitySiteGeocoding,
): LocationProperties['status'] {
  if (site.status === 'existing_coordinates') return 'nominal';
  const confidence = site.match_code?.confidence;
  return confidence === 'exact' || confidence === 'high'
    ? 'nominal'
    : 'warning';
}

/** One shared waypoint feature per physical factory site. */
export const transformerFactoryLocations: Array<
  Feature<Point, TransformerFactoryLocationProperties>
> = factoryDataset.facilities.flatMap((facility, facilityIndex) => {
  const metric = facilityMetric(facility);

  return facility.geocoded_sites.flatMap((site, siteIndex) => {
    if (!site.coordinates) return [];

    const siteSuffix = facility.geocoded_sites.length > 1
      ? ` · SITE ${siteIndex + 1}`
      : '';

    return [{
      type: 'Feature' as const,
      properties: {
        id: `transformer-factory-${facilityIndex}-${siteIndex}`,
        name: `${facility.manufacturer}${siteSuffix}`,
        kind: 'WAYPOINT',
        value: metric.value,
        unit: metric.unit,
        status: waypointStatus(site),
        detail: metric.detail,
        category: 'transformer_factory' as const,
        manufacturer: facility.manufacturer,
        country: facility.country,
        address: site.address,
        addressPrecision: facility.address_precision,
        confidence: site.match_code?.confidence ?? 'unspecified',
        featureType: site.feature_type ?? 'existing_coordinates',
        sourceUrl: facility.source_url,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [
          site.coordinates.longitude,
          site.coordinates.latitude,
        ],
      },
    }];
  });
});
