import { HomeAssistant } from "custom-card-helpers";
import { DiscoveryResult } from "./entity-discovery";
import { classifyAirQuality, classifyPollen } from "./panel-entities";
import { ForecastAttribute } from "./weather";

/**
 * Harmonized forecast bands: category-colored strips that share the forecast
 * chart's slot grid (the approved "aligned bands" shape from the mockups).
 *
 * Colors come from the integration's per-entry `color_hex` on the AQ/pollen
 * forecast arrays (particle_man v1.7.0+); entry selection for pollen uses the
 * numeric per-entry `severity` — no thresholds or vocabularies here.
 */

export interface BandRow {
  key: string;
  colors: (string | null)[];
}

interface SeriesEntry {
  datetime?: string;
  color_hex?: string | null;
  severity?: number | null;
}

const hourKey = (iso: string | undefined): number | null => {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setMinutes(0, 0, 0);
  return date.getTime();
};

const dayKey = (iso: string | undefined): string | null => {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const seriesOf = (
  attributes: Record<string, unknown>,
  key: string
): SeriesEntry[] => {
  const series = attributes[key];
  return Array.isArray(series) ? (series as SeriesEntry[]) : [];
};

export const buildForecastBands = (
  hass: HomeAssistant,
  discovery: Record<string, DiscoveryResult>,
  slots: ForecastAttribute[],
  granularity: "hourly" | "daily"
): BandRow[] => {
  const rows: BandRow[] = [];
  if (!slots.length) {
    return rows;
  }
  const keyOf = granularity === "hourly" ? hourKey : dayKey;

  const aqEntities = discovery.air_quality?.entities;
  if (aqEntities) {
    const { aqi } = classifyAirQuality(hass, aqEntities);
    if (aqi) {
      const series = seriesOf(
        aqi.state.attributes as Record<string, unknown>,
        granularity === "hourly" ? "hourly_forecast" : "daily_forecast"
      );
      const byKey = new Map<number | string, string | null>();
      for (const entry of series) {
        const key = keyOf(entry.datetime);
        if (key !== null && typeof entry.color_hex === "string") {
          byKey.set(key, entry.color_hex);
        }
      }
      const colors = slots.map((slot) => {
        const key = keyOf(slot.datetime);
        return key === null ? null : (byKey.get(key) ?? null);
      });
      if (colors.some(Boolean)) {
        rows.push({ key: "air_quality", colors });
      }
    }
  }

  // Pollen forecasts are daily-only; each day shows the worst (highest
  // severity) entry across the tree/grass/weed type sensors.
  const pollenEntities = discovery.pollen?.entities;
  if (granularity === "daily" && pollenEntities) {
    const { types } = classifyPollen(hass, pollenEntities);
    const worst = new Map<string, { severity: number; color: string | null }>();
    for (const type of types) {
      const series = seriesOf(
        type.state.attributes as Record<string, unknown>,
        "daily_forecast"
      );
      for (const entry of series) {
        const key = dayKey(entry.datetime);
        const severity = typeof entry.severity === "number" ? entry.severity : null;
        if (key === null || severity === null) {
          continue;
        }
        const current = worst.get(key);
        if (!current || severity > current.severity) {
          worst.set(key, {
            severity,
            color: typeof entry.color_hex === "string" ? entry.color_hex : null,
          });
        }
      }
    }
    if (worst.size) {
      const colors = slots.map((slot) => {
        const key = dayKey(slot.datetime);
        return key === null ? null : (worst.get(key)?.color ?? null);
      });
      if (colors.some(Boolean)) {
        rows.push({ key: "pollen", colors });
      }
    }
  }

  return rows;
};
