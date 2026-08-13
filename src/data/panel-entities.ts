import { HomeAssistant } from "custom-card-helpers";
import { HassEntity } from "home-assistant-js-websocket";
import { DiscoveredEntity } from "./entity-discovery";

/**
 * Classification of discovered particle_man sensors into panel roles.
 *
 * Discovery hands back every live sensor on a device; the panels need to know
 * which is the advisory, which are the pollen types, and so on. Classification
 * keys off `translation_key` — set by the integration and stable across
 * renames — with entity_id suffix fallbacks for the dynamically-named sensors
 * (pollen types/plants and pollutants carry no per-entity translation key).
 */

export interface ClassifiedEntity {
  entityId: string;
  state: HassEntity;
}

const stateOf = (
  hass: HomeAssistant,
  entityId: string
): HassEntity | undefined => hass.states[entityId];

const live = (state: HassEntity | undefined): state is HassEntity =>
  state !== undefined &&
  state.state !== "unknown" &&
  state.state !== "unavailable";

const collect = (
  hass: HomeAssistant,
  entities: DiscoveredEntity[],
  predicate: (e: DiscoveredEntity) => boolean,
  includeUnknown = false
): ClassifiedEntity[] =>
  entities
    .filter(predicate)
    .map((e) => ({ entityId: e.entityId, state: stateOf(hass, e.entityId) }))
    .filter(
      (e): e is ClassifiedEntity =>
        e.state !== undefined && (includeUnknown || live(e.state))
    );

// --- Pollen -----------------------------------------------------------------

export interface PollenEntities {
  advisory: ClassifiedEntity | null;
  /** Tree/grass/weed index sensors (numeric state, color_hex attribute). */
  types: ClassifiedEntity[];
  /** Per-plant index sensors, in-season and live only. */
  plants: ClassifiedEntity[];
}

export const classifyPollen = (
  hass: HomeAssistant,
  entities: DiscoveredEntity[]
): PollenEntities => {
  const advisory =
    collect(hass, entities, (e) => e.translationKey === "pollen_advisory")[0] ??
    null;

  // Type sensors are named ...._{tree,grass,weed}_pollen; plants are any other
  // ..._pollen. Level sensors (categorical duplicates) are excluded — the
  // numeric sensors carry category + color_hex as attributes already.
  const isIndex = (id: string) =>
    id.endsWith("_pollen") && !id.endsWith("_level");
  const isType = (id: string) =>
    /_(tree|grass|weed)_pollen$/.test(id) && isIndex(id);

  const types = collect(hass, entities, (e) => isType(e.entityId));
  const plants = collect(
    hass,
    entities,
    (e) => isIndex(e.entityId) && !isType(e.entityId)
  ).filter((e) => e.state.attributes.in_season === true);

  return { advisory, types, plants };
};

// --- Air quality ------------------------------------------------------------

export interface AirQualityEntities {
  aqi: ClassifiedEntity | null;
  advisory: ClassifiedEntity | null;
  /** Numeric pollutant sensors (pm25, o3, ...), each with category/color. */
  pollutants: ClassifiedEntity[];
}

export const classifyAirQuality = (
  hass: HomeAssistant,
  entities: DiscoveredEntity[]
): AirQualityEntities => {
  const aqi =
    collect(hass, entities, (e) => e.translationKey === "aqi")[0] ?? null;
  const advisory =
    collect(hass, entities, (e) => e.translationKey === "aq_advisory")[0] ??
    null;

  // Pollutant ids look like sensor.<loc>_<code>; keep numeric-state sensors
  // that are neither the AQI family nor a _level duplicate.
  const excluded = new Set(
    [aqi?.entityId, advisory?.entityId].filter(Boolean) as string[]
  );
  const pollutants = collect(
    hass,
    entities,
    (e) =>
      !excluded.has(e.entityId) &&
      !e.entityId.endsWith("_level") &&
      e.translationKey !== "aqi_level" &&
      e.translationKey !== "local_aqi"
  ).filter((e) => !Number.isNaN(Number(e.state.state)));

  return { aqi, advisory, pollutants };
};

// --- Shared helpers ---------------------------------------------------------

/** The category color the integration computed (hex), if any. */
export const colorOf = (entity: ClassifiedEntity): string | null => {
  const color = entity.state.attributes.color_hex;
  return typeof color === "string" && color.length > 0 ? color : null;
};

/** Harmonized rank within the entity's own canonical scale (v1.7.0+). */
export const severityOf = (entity: ClassifiedEntity): number | null => {
  const severity = entity.state.attributes.severity;
  return typeof severity === "number" ? severity : null;
};

export const severityMaxOf = (entity: ClassifiedEntity): number | null => {
  const max = entity.state.attributes.severity_max;
  return typeof max === "number" && max > 0 ? max : null;
};

/**
 * The integration's action-level verdict. Only an explicit `true` counts as
 * quiet — absent/null (pre-1.7.0 integration, unmapped scales) keeps the row
 * visible rather than silently hiding data.
 */
export const isQuiet = (entity: ClassifiedEntity): boolean =>
  entity.state.attributes.below_action_level === true;

/** Registry original_name — the entity's own name without the device prefix. */
export const shortNameOf = (
  entity: ClassifiedEntity,
  discovered: DiscoveredEntity[]
): string => {
  const match = discovered.find((d) => d.entityId === entity.entityId);
  return match?.originalName ?? friendlyNameOf(entity);
};

export const categoryOf = (entity: ClassifiedEntity): string | null => {
  const category = entity.state.attributes.category;
  return typeof category === "string" && category.length > 0 ? category : null;
};

export const friendlyNameOf = (entity: ClassifiedEntity): string =>
  (entity.state.attributes.friendly_name as string | undefined) ??
  entity.entityId;
