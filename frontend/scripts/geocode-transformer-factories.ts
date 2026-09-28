import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  geocodeTransformerFactories,
  parseCsv,
  type TransformerFactoryCsvRow,
} from '../src/map/geography/geocoding/geocoding.ts';

const sourceUrl = new URL(
  '../src/map/geography/geocoding/transmission_power_transformer_factories_enriched_v22.csv',
  import.meta.url,
);
const outputUrl = new URL(
  '../src/map/geography/geocoding/transmission_power_transformer_factories_geocoded_v23.json',
  import.meta.url,
);
const environmentUrl = new URL('../.env.local', import.meta.url);

function loadEnvironment(text: string): void {
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator < 1) return;

    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    process.env[name] ??= value;
  });
}

try {
  loadEnvironment(await readFile(environmentUrl, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const csv = await readFile(sourceUrl, 'utf8');
const rows = parseCsv(csv) as TransformerFactoryCsvRow[];
const facilities = await geocodeTransformerFactories(rows, {
  accessToken: process.env.VITE_MAPBOX_ACCESS_TOKEN,
  onProgress(completed, total) {
    console.log(`Geocoded ${completed}/${total} missing facility sites.`);
  },
});

const counts = facilities.reduce<Record<string, number>>((summary, facility) => {
  summary[facility.geocoding_status] = (summary[facility.geocoding_status] ?? 0) + 1;
  return summary;
}, {});

const output = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source_file: 'transmission_power_transformer_factories_enriched_v22.csv',
  geocoding_provider: 'Mapbox Geocoding API v6',
  permanent_storage: true,
  facility_count: facilities.length,
  status_counts: counts,
  facilities,
};

await writeFile(outputUrl, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote ${facilities.length} facilities to ${fileURLToPath(outputUrl)}.`);
