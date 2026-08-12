import { HomeAssistant } from "custom-card-helpers";
import { logger } from "../logger";

/**
 * Registry-based sibling discovery for sensor-backed panels.
 *
 * The air quality and pollen panels read ~44 particle_man sensors. Making the
 * user enumerate those in YAML is untenable and fragile — the integration adds
 * sensors over time (new pollen species appear seasonally), and every addition
 * would silently be missing from the card. Instead a panel is configured with a
 * single anchor entity; we resolve the device that owns it and enumerate every
 * sensor on that device.
 *
 * Because particle_man creates one device per location, the anchor also selects
 * the location, so multi-location installs work with no extra config.
 */

interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  disabled_by: string | null;
  hidden_by: string | null;
  platform: string;
  translation_key: string | null;
  original_name: string | null;
}

export interface DiscoveredEntity {
  entityId: string;
  translationKey: string | null;
  originalName: string | null;
}

export interface DiscoveryResult {
  deviceId: string | null;
  /** Sorted by entity_id for stable render order. */
  entities: DiscoveredEntity[];
}

const EMPTY_RESULT: DiscoveryResult = { deviceId: null, entities: [] };

/**
 * Discover all live sensor entities sharing the anchor's device.
 *
 * Returns the empty result rather than throwing on any failure: a panel with
 * no entities renders its "nothing configured" state, which is strictly better
 * than a card-level error wiping out the weather sections beside it.
 */
export const discoverDeviceEntities = async (
  hass: HomeAssistant,
  anchorEntityId: string
): Promise<DiscoveryResult> => {
  try {
    const anchor = await hass.callWS<EntityRegistryEntry>({
      type: "config/entity_registry/get",
      entity_id: anchorEntityId,
    });
    if (!anchor?.device_id) {
      logger.warn(
        `discovery: anchor ${anchorEntityId} has no device; ` +
          "panels need a device-backed entity to enumerate siblings"
      );
      return EMPTY_RESULT;
    }

    const all = await hass.callWS<EntityRegistryEntry[]>({
      type: "config/entity_registry/list",
    });

    const entities = all
      .filter(
        (e) =>
          e.device_id === anchor.device_id &&
          e.entity_id.startsWith("sensor.") &&
          // Disabled entities have no state and would render as permanent
          // unknowns; hidden ones were hidden on purpose.
          e.disabled_by === null &&
          e.hidden_by === null
      )
      .map((e) => ({
        entityId: e.entity_id,
        translationKey: e.translation_key,
        originalName: e.original_name,
      }))
      .sort((a, b) => a.entityId.localeCompare(b.entityId));

    return { deviceId: anchor.device_id, entities };
  } catch (err) {
    logger.warn(`discovery: failed for anchor ${anchorEntityId}: ${err}`);
    return EMPTY_RESULT;
  }
};

/**
 * Tracks the entity set a card must react to, combining statically configured
 * ids with dynamically discovered ones.
 *
 * The upstream card checks a config-derived list inside shouldUpdate, which
 * works because that list is fixed at setConfig time. Discovered entities
 * arrive later, from an async registry call, so panels built on that pattern
 * alone would render once and never update — the set has to be mutable and the
 * membership check cheap, since shouldUpdate runs on every hass mutation.
 */
export class EntityWatchSet {
  private staticIds = new Set<string>();
  private discovered = new Map<string, Set<string>>();
  private combined = new Set<string>();

  /** Replace the statically-configured ids (call from setConfig). */
  setStatic(ids: Iterable<string>): void {
    this.staticIds = new Set(ids);
    this.rebuild();
  }

  /** Replace one discovery group's ids (call when discovery resolves). */
  setDiscovered(group: string, ids: Iterable<string>): void {
    this.discovered.set(group, new Set(ids));
    this.rebuild();
  }

  clearDiscovered(group: string): void {
    this.discovered.delete(group);
    this.rebuild();
  }

  has(entityId: string): boolean {
    return this.combined.has(entityId);
  }

  get size(): number {
    return this.combined.size;
  }

  /**
   * True when any watched entity's state object changed between two hass
   * snapshots. HA replaces state objects immutably, so identity comparison is
   * both correct and the cheapest possible check.
   */
  anyChanged(
    oldStates: HomeAssistant["states"] | undefined,
    newStates: HomeAssistant["states"]
  ): boolean {
    if (!oldStates) {
      return this.combined.size > 0;
    }
    for (const id of this.combined) {
      if (oldStates[id] !== newStates[id]) {
        return true;
      }
    }
    return false;
  }

  private rebuild(): void {
    this.combined = new Set(this.staticIds);
    for (const ids of this.discovered.values()) {
      for (const id of ids) {
        this.combined.add(id);
      }
    }
  }
}
