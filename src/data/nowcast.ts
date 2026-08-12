import { HomeAssistant } from "custom-card-helpers";
import { logger } from "../logger";

/**
 * Minute-forecast (nowcast) data access.
 *
 * Primary source is a `get_minute_forecast` entity action in the convention
 * core's OpenWeatherMap integration established — the service domain is
 * resolved from the entity's registry platform, so any integration that ships
 * the action works without being hardcoded here. A `sensor.*` entity is read
 * from its attributes instead, for integrations that expose the segments that
 * way.
 */

export interface NowcastEntry {
  /** Segment start, ISO 8601. */
  datetime: string;
  /** Precipitation rate in mm/h; 0 for a dry segment. */
  precipitation: number;
  /** Optional richer fields (particle_man provides these). */
  type?: string;
  probability?: number;
  intensity?: string;
  end?: string;
}

interface RegistryEntry {
  platform?: string;
}

interface NowcastServiceResponse {
  response?: Record<string, { forecast?: unknown[] }>;
}

const toEntry = (raw: unknown): NowcastEntry | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const datetime = record.datetime ?? record.start;
  if (typeof datetime !== "string") {
    return null;
  }
  const precipitation = record.precipitation ?? record.value;
  return {
    datetime,
    precipitation:
      typeof precipitation === "number" && Number.isFinite(precipitation)
        ? Math.max(0, precipitation)
        : 0,
    type: typeof record.type === "string" ? record.type : undefined,
    probability:
      typeof record.probability === "number" ? record.probability : undefined,
    intensity:
      typeof record.intensity === "string" ? record.intensity : undefined,
    end: typeof record.end === "string" ? record.end : undefined,
  };
};

const normalize = (rawList: unknown[]): NowcastEntry[] =>
  rawList
    .map(toEntry)
    .filter((entry): entry is NowcastEntry => entry !== null)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

/** Resolve the service domain for a weather entity's nowcast action. */
export const resolveNowcastDomain = async (
  hass: HomeAssistant,
  entityId: string
): Promise<string | null> => {
  try {
    const entry = await hass.callWS<RegistryEntry>({
      type: "config/entity_registry/get",
      entity_id: entityId,
    });
    return entry?.platform ?? null;
  } catch (err) {
    logger.warn(`nowcast: cannot resolve platform for ${entityId}: ${err}`);
    return null;
  }
};

/**
 * Fetch nowcast entries for an entity.
 *
 * Weather entities are queried via their integration's get_minute_forecast
 * action; sensors are read from a forecast-shaped attribute (`forecast`,
 * `segments` or `data` — the names used by particle_man, this card's own
 * integration, and the DWD/OWM ecosystem respectively).
 */
export const fetchNowcast = async (
  hass: HomeAssistant,
  entityId: string,
  serviceDomain: string | null
): Promise<NowcastEntry[]> => {
  if (entityId.startsWith("sensor.")) {
    const stateObj = hass.states[entityId];
    if (!stateObj) {
      return [];
    }
    const attrs = stateObj.attributes as Record<string, unknown>;
    const list = attrs.forecast ?? attrs.segments ?? attrs.data;
    return Array.isArray(list) ? normalize(list) : [];
  }

  if (!serviceDomain) {
    return [];
  }
  try {
    const response = await hass.callWS<NowcastServiceResponse>({
      type: "call_service",
      domain: serviceDomain,
      service: "get_minute_forecast",
      target: { entity_id: entityId },
      return_response: true,
    });
    const forecast = response?.response?.[entityId]?.forecast;
    return Array.isArray(forecast) ? normalize(forecast) : [];
  } catch (err) {
    logger.warn(`nowcast: get_minute_forecast failed for ${entityId}: ${err}`);
    return [];
  }
};

export interface NowcastSummary {
  /** True when the first wet segment covers "now". */
  precipitating: boolean;
  /** Minutes until precipitation starts (0 while falling), or null if none. */
  startsInMinutes: number | null;
  /** Minutes until the current precipitation ends, when precipitating. */
  endsInMinutes: number | null;
  /** Dominant type of the relevant wet stretch (RAIN/SNOW/HAIL). */
  type: string | null;
  /** True when every entry is dry. */
  allDry: boolean;
}

/** Derive the headline (starting/ending/none) from normalized entries. */
export const summarizeNowcast = (
  entries: NowcastEntry[],
  now: Date = new Date()
): NowcastSummary => {
  const wet = entries.filter((e) => e.precipitation > 0);
  if (wet.length === 0) {
    return {
      precipitating: false,
      startsInMinutes: null,
      endsInMinutes: null,
      type: null,
      allDry: true,
    };
  }

  const first = wet[0]!;
  const firstStart = new Date(first.datetime);
  const type = first.type ?? null;

  if (firstStart <= now) {
    // Falling now — find the end of the contiguous wet run.
    let end: Date | null = first.end ? new Date(first.end) : null;
    for (const entry of entries) {
      const start = new Date(entry.datetime);
      if (start < firstStart) {
        continue;
      }
      if (entry.precipitation > 0) {
        end = entry.end ? new Date(entry.end) : start;
      } else if (start > now) {
        end = start;
        break;
      }
    }
    return {
      precipitating: true,
      startsInMinutes: 0,
      endsInMinutes:
        end && end > now
          ? Math.floor((end.getTime() - now.getTime()) / 60000)
          : null,
      type,
      allDry: false,
    };
  }

  return {
    precipitating: false,
    startsInMinutes: Math.max(
      0,
      Math.floor((firstStart.getTime() - now.getTime()) / 60000)
    ),
    endsInMinutes: null,
    type,
    allDry: false,
  };
};
