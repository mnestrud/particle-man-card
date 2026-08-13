import { HomeAssistant } from "custom-card-helpers";
import { ForecastAttribute } from "./weather";
import { logger } from "../logger";

/**
 * Solar production forecast from the HA Energy dashboard.
 *
 * Ported from tobiasb80/detailed-weather-forecast (MIT): two websocket calls —
 * energy/get_prefs to find the config entries flagged as solar_forecast
 * sources, then energy/solar_forecast for their wh_hours — merged into the
 * forecast entries so the existing renderers can show production alongside
 * temperature. Values are summed across sources.
 */

interface EnergyPreferences {
  energy_sources?: Array<{
    type?: string;
    config_entry_solar_forecast?: string[] | null;
  }>;
}

type SolarForecasts = Record<string, { wh_hours?: Record<string, number> }>;

export interface SolarLookup {
  /** ISO hour (UTC ms rounded down to the hour) -> Wh produced that hour. */
  hourlyWh: Map<number, number>;
  /** Local date (YYYY-MM-DD) -> Wh for the day. */
  dailyWh: Map<string, number>;
}

const hourKey = (iso: string): number => {
  const date = new Date(iso);
  date.setMinutes(0, 0, 0);
  return date.getTime();
};

const dayKey = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const fetchSolarForecast = async (
  hass: HomeAssistant,
  configEntryIds?: string[]
): Promise<SolarLookup | null> => {
  try {
    let entryIds = configEntryIds;
    if (!entryIds || entryIds.length === 0) {
      const prefs = await hass.callWS<EnergyPreferences>({
        type: "energy/get_prefs",
      });
      entryIds = (prefs.energy_sources ?? [])
        .filter((source) => source.type === "solar")
        .flatMap((source) => source.config_entry_solar_forecast ?? []);
    }
    if (entryIds.length === 0) {
      return null;
    }

    const forecasts = await hass.callWS<SolarForecasts>({
      type: "energy/solar_forecast",
    });

    const hourlyWh = new Map<number, number>();
    const dailyWh = new Map<string, number>();
    for (const entryId of entryIds) {
      const whHours = forecasts[entryId]?.wh_hours ?? {};
      for (const [iso, wh] of Object.entries(whHours)) {
        if (typeof wh !== "number" || !Number.isFinite(wh)) {
          continue;
        }
        const hour = hourKey(iso);
        hourlyWh.set(hour, (hourlyWh.get(hour) ?? 0) + wh);
        const day = dayKey(iso);
        dailyWh.set(day, (dailyWh.get(day) ?? 0) + wh);
      }
    }
    return { hourlyWh, dailyWh };
  } catch (err) {
    logger.warn(`solar: forecast fetch failed: ${err}`);
    return null;
  }
};

/**
 * Annotate forecast entries with `solar_wh` so renderers can treat it like
 * any other attribute. Hourly entries get their hour's Wh; daily and
 * twice-daily entries get the day total (halved day/night splits would imply
 * a precision the source does not have).
 */
export const mergeSolarForecast = (
  forecast: ForecastAttribute[],
  lookup: SolarLookup,
  granularity: "hourly" | "daily"
): ForecastAttribute[] =>
  forecast.map((entry) => {
    if (!entry.datetime) {
      return entry;
    }
    const wh =
      granularity === "hourly"
        ? lookup.hourlyWh.get(hourKey(entry.datetime))
        : lookup.dailyWh.get(dayKey(entry.datetime));
    return wh === undefined ? entry : { ...entry, solar_wh: Math.round(wh) };
  });
