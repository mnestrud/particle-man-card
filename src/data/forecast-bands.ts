import { HomeAssistant } from "custom-card-helpers";
import { DiscoveryResult } from "./entity-discovery";
import { classifyAirQuality, classifyPollen } from "./panel-entities";
import { localize } from "../localize/localize";
import { getUvIndexBandKey, getUvIndexColor } from "./uv-index";
import { ForecastAttribute } from "./weather";

/**
 * Harmonized forecast bands: category-colored strips that share the forecast
 * chart's slot grid (the approved "aligned bands" shape from the mockups).
 *
 * Colors come from the integration's per-entry `color_hex` on the AQ/pollen
 * forecast arrays (particle_man v1.7.0+); entry selection for pollen uses the
 * numeric per-entry `severity` — no thresholds or vocabularies here.
 */

export interface BandCell {
  color: string | null;
  /** Tooltip text: what is being forecast in this slot. */
  label: string | null;
}

export interface BandRow {
  key: string;
  cells: BandCell[];
}

interface SeriesEntry {
  datetime?: string;
  color_hex?: string | null;
  severity?: number | null;
  aqi?: number | null;
  category?: string | null;
  index?: number | null;
  dominant_pollutant?: string | null;
  below_action_level?: boolean | null;
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

const slotTime = (
  hass: HomeAssistant,
  iso: string | undefined,
  granularity: "hourly" | "daily"
): string => {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const language = hass.locale?.language;
  return granularity === "hourly"
    ? date.toLocaleString(language, { weekday: "short", hour: "numeric" })
    : date.toLocaleDateString(language, { weekday: "short" });
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
      const byKey = new Map<number | string, SeriesEntry>();
      for (const entry of series) {
        const key = keyOf(entry.datetime);
        if (key !== null && typeof entry.color_hex === "string") {
          byKey.set(key, entry);
        }
      }
      const cells: BandCell[] = slots.map((slot) => {
        const key = keyOf(slot.datetime);
        const entry = key === null ? undefined : byKey.get(key);
        if (!entry) {
          return { color: null, label: null };
        }
        const parts = [
          typeof entry.aqi === "number" ? `UAQI ${entry.aqi}` : null,
          entry.category ?? null,
          entry.dominant_pollutant
            ? entry.dominant_pollutant.toUpperCase()
            : null,
        ].filter(Boolean);
        return {
          color: entry.color_hex ?? null,
          label: `${slotTime(hass, slot.datetime, granularity)} — ${parts.join(" · ")}`,
        };
      });
      if (cells.some((cell) => cell.color)) {
        rows.push({ key: "air_quality", cells });
      }
    }
  }

  // Pollen forecasts are daily-only; each day is colored by the worst
  // (highest severity) type, and the tooltip lists every type forecast.
  const pollenEntities = discovery.pollen?.entities;
  if (granularity === "daily" && pollenEntities) {
    const { types } = classifyPollen(hass, pollenEntities);
    const byDay = new Map<
      string,
      {
        name: string;
        severity: number;
        color: string | null;
        category: string | null;
        belowActionLevel: boolean | null;
      }[]
    >();
    for (const type of types) {
      const attrs = type.state.attributes as Record<string, unknown>;
      const name = String(attrs.friendly_name ?? type.entityId).replace(
        /\s*Pollen$/i,
        ""
      );
      const series = seriesOf(attrs, "daily_forecast");
      for (const entry of series) {
        const key = dayKey(entry.datetime);
        const severity = typeof entry.severity === "number" ? entry.severity : null;
        if (key === null || severity === null) {
          continue;
        }
        const list = byDay.get(key) ?? [];
        list.push({
          name,
          severity,
          color: typeof entry.color_hex === "string" ? entry.color_hex : null,
          category: entry.category ?? null,
          belowActionLevel:
            typeof entry.below_action_level === "boolean"
              ? entry.below_action_level
              : null,
        });
        byDay.set(key, list);
      }
    }
    if (byDay.size) {
      const cells: BandCell[] = slots.map((slot) => {
        const key = dayKey(slot.datetime);
        const list = key === null ? undefined : byDay.get(key);
        if (!list?.length) {
          return { color: null, label: null };
        }
        const sorted = [...list].sort((a, b) => b.severity - a.severity);
        const acting = sorted.filter((t) => t.belowActionLevel !== true);
        const breakdown = acting.length
          ? acting
              .map((t) => [t.name, t.category].filter(Boolean).join(" "))
              .join(" · ")
          : `${localize(hass, "pollen.title")} ${localize(hass, "panel.all_quiet")}`;
        return {
          color: sorted[0]!.color,
          label: `${slotTime(hass, slot.datetime, granularity)} — ${breakdown}`,
        };
      });
      // The whole strip disappears on all-quiet stretches (user decision
      // 2026-08-13); it returns the day any type reaches the action level.
      const anyActing = [...byDay.values()].some((list) =>
        list.some((t) => t.belowActionLevel === false)
      );
      if (anyActing && cells.some((cell) => cell.color)) {
        rows.push({ key: "pollen", cells });
      }
    }
  }

  // UV/sun-risk band, last row: WHO ladder colors via the card's existing
  // uv-index module — same bands upstream's chart mode has always used. Reads
  // uv_index straight off the forecast slots; UV 0 (night, overcast winter
  // days) stays unpainted so the row carries ink only where risk exists.
  {
    const cells: BandCell[] = slots.map((slot) => {
      const uv = slot.uv_index;
      if (typeof uv !== "number" || Math.round(uv) < 1) {
        return { color: null, label: null };
      }
      const band = localize(hass, `uv.${getUvIndexBandKey(uv)}`);
      return {
        color: `var(${getUvIndexColor(uv)})`,
        label: `${slotTime(hass, slot.datetime, granularity)} — UV ${Math.round(uv)} · ${band}`,
      };
    });
    if (cells.some((cell) => cell.color)) {
      rows.push({ key: "uv", cells });
    }
  }

  return rows;
};
