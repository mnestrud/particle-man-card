import { describe, expect, it, vi } from "vitest";
import { HomeAssistant } from "custom-card-helpers";
import {
  EntityWatchSet,
  discoverDeviceEntities,
} from "../src/data/entity-discovery";

/**
 * The discovery + reactivity layers exist to prevent one specific failure:
 * a sensor-backed panel that renders once and never updates, because nothing
 * told Lit that a non-weather entity it reads has changed. These tests pin
 * the two halves — the registry enumeration and the mutable watch set — and
 * the failure modes at their seams.
 */

const REGISTRY = [
  // The pollen device the anchor belongs to.
  { entity_id: "sensor.home_pollen_tree_pollen", device_id: "dev-pollen", disabled_by: null, hidden_by: null, platform: "particle_man", translation_key: "pollen_type", original_name: "Tree Pollen" },
  { entity_id: "sensor.home_pollen_weed_pollen", device_id: "dev-pollen", disabled_by: null, hidden_by: null, platform: "particle_man", translation_key: "pollen_type", original_name: "Weed Pollen" },
  { entity_id: "sensor.home_pollen_advisory", device_id: "dev-pollen", disabled_by: null, hidden_by: null, platform: "particle_man", translation_key: "pollen_advisory", original_name: "Pollen Advisory" },
  // Same device but not eligible: disabled, hidden, or not a sensor.
  { entity_id: "sensor.home_pollen_oak_pollen", device_id: "dev-pollen", disabled_by: "user", hidden_by: null, platform: "particle_man", translation_key: null, original_name: "Oak Pollen" },
  { entity_id: "sensor.home_pollen_secret", device_id: "dev-pollen", disabled_by: null, hidden_by: "user", platform: "particle_man", translation_key: null, original_name: "Hidden" },
  { entity_id: "switch.home_pollen_quiet_hours", device_id: "dev-pollen", disabled_by: null, hidden_by: null, platform: "particle_man", translation_key: null, original_name: "Quiet Hours" },
  // A different device entirely.
  { entity_id: "sensor.home_pollution_universal_aqi", device_id: "dev-aq", disabled_by: null, hidden_by: null, platform: "particle_man", translation_key: "aqi", original_name: "Universal AQI" },
];

const mockHass = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    callWS: vi.fn(async (msg: { type: string; entity_id?: string }) => {
      if (msg.type === "config/entity_registry/get") {
        const entry = REGISTRY.find((e) => e.entity_id === msg.entity_id);
        if (!entry) {
          throw new Error("not found");
        }
        return entry;
      }
      if (msg.type === "config/entity_registry/list") {
        return REGISTRY;
      }
      throw new Error(`unexpected ws call ${msg.type}`);
    }),
    ...overrides,
  }) as unknown as HomeAssistant;

describe("discoverDeviceEntities", () => {
  it("enumerates live sensor siblings of the anchor's device", async () => {
    const result = await discoverDeviceEntities(
      mockHass(),
      "sensor.home_pollen_tree_pollen"
    );

    expect(result.deviceId).toBe("dev-pollen");
    expect(result.entities.map((e) => e.entityId)).toEqual([
      "sensor.home_pollen_advisory",
      "sensor.home_pollen_tree_pollen",
      "sensor.home_pollen_weed_pollen",
    ]);
  });

  it("excludes disabled and hidden entities and other domains", async () => {
    const result = await discoverDeviceEntities(
      mockHass(),
      "sensor.home_pollen_tree_pollen"
    );
    const ids = result.entities.map((e) => e.entityId);

    // Disabled entities have no state; hidden were hidden deliberately;
    // the quiet-hours switch is not renderable panel data.
    expect(ids).not.toContain("sensor.home_pollen_oak_pollen");
    expect(ids).not.toContain("sensor.home_pollen_secret");
    expect(ids).not.toContain("switch.home_pollen_quiet_hours");
  });

  it("does not leak entities from other devices", async () => {
    const result = await discoverDeviceEntities(
      mockHass(),
      "sensor.home_pollen_tree_pollen"
    );
    expect(result.entities.map((e) => e.entityId)).not.toContain(
      "sensor.home_pollution_universal_aqi"
    );
  });

  it("carries translation keys so panels can classify without name parsing", async () => {
    const result = await discoverDeviceEntities(
      mockHass(),
      "sensor.home_pollen_tree_pollen"
    );
    const advisory = result.entities.find(
      (e) => e.entityId === "sensor.home_pollen_advisory"
    );
    expect(advisory?.translationKey).toBe("pollen_advisory");
  });

  it("returns empty rather than throwing on an unknown anchor", async () => {
    // A panel with no entities beats a card-level error that would take the
    // weather sections down with it.
    const result = await discoverDeviceEntities(mockHass(), "sensor.missing");
    expect(result).toEqual({ deviceId: null, entities: [] });
  });

  it("returns empty when the websocket itself fails", async () => {
    const hass = mockHass({
      callWS: vi.fn(async () => {
        throw new Error("connection lost");
      }),
    });
    const result = await discoverDeviceEntities(
      hass,
      "sensor.home_pollen_tree_pollen"
    );
    expect(result).toEqual({ deviceId: null, entities: [] });
  });
});

describe("EntityWatchSet", () => {
  // HA's state store is immutable: an entity that did not change keeps the
  // *same* state object across snapshots. Model that by interning objects per
  // (id, version) — two snapshots share the object unless the version moved.
  const interned = new Map<string, object>();
  const states = (versions: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(versions).map(([id, v]) => {
        const key = `${id}#${v}`;
        if (!interned.has(key)) {
          interned.set(key, { v });
        }
        return [id, interned.get(key)];
      })
    ) as unknown as HomeAssistant["states"];

  it("reacts to statically configured entities", () => {
    const set = new EntityWatchSet();
    set.setStatic(["sensor.a"]);

    const before = states({ "sensor.a": 1, "sensor.b": 1 });
    const after = states({ "sensor.a": 2, "sensor.b": 1 });
    expect(set.anyChanged(before, after)).toBe(true);
  });

  it("ignores changes to unwatched entities", () => {
    const set = new EntityWatchSet();
    set.setStatic(["sensor.a"]);

    const before = states({ "sensor.a": 1, "sensor.b": 1 });
    const after = states({ "sensor.a": 1, "sensor.b": 2 });
    expect(set.anyChanged(before, after)).toBe(false);
  });

  it("reacts to discovered entities added after construction", () => {
    // The core of the bug this layer prevents: discovery resolves *after*
    // setConfig, so a set fixed at config time would never see these.
    const set = new EntityWatchSet();
    set.setStatic([]);

    const before = states({ "sensor.pollen": 1 });
    const after = states({ "sensor.pollen": 2 });
    expect(set.anyChanged(before, after)).toBe(false);

    set.setDiscovered("pollen", ["sensor.pollen"]);
    expect(set.anyChanged(before, after)).toBe(true);
  });

  it("stops reacting when a discovery group is cleared", () => {
    const set = new EntityWatchSet();
    set.setDiscovered("pollen", ["sensor.pollen"]);
    set.clearDiscovered("pollen");

    const before = states({ "sensor.pollen": 1 });
    const after = states({ "sensor.pollen": 2 });
    expect(set.anyChanged(before, after)).toBe(false);
  });

  it("keeps static and discovered groups independent", () => {
    const set = new EntityWatchSet();
    set.setStatic(["sensor.static"]);
    set.setDiscovered("aq", ["sensor.aqi"]);
    set.setDiscovered("pollen", ["sensor.pollen"]);
    expect(set.size).toBe(3);

    // Re-running setConfig replaces the static list without touching
    // discovery, and vice versa.
    set.setStatic([]);
    expect(set.size).toBe(2);
    set.setDiscovered("aq", []);
    expect(set.has("sensor.pollen")).toBe(true);
    expect(set.has("sensor.aqi")).toBe(false);
  });

  it("treats a missing old snapshot as changed when anything is watched", () => {
    const set = new EntityWatchSet();
    set.setStatic(["sensor.a"]);
    expect(set.anyChanged(undefined, states({ "sensor.a": 1 }))).toBe(true);

    const empty = new EntityWatchSet();
    expect(empty.anyChanged(undefined, states({}))).toBe(false);
  });
});
