import { describe, expect, it } from "vitest";
import { fixture } from "@open-wc/testing";
import { html } from "lit";
import { HomeAssistant } from "custom-card-helpers";
import { DiscoveryResult } from "../src/data/entity-discovery";
import {
  classifyAirQuality,
  classifyPollen,
} from "../src/data/panel-entities";
import { WfcPollen } from "../src/components/wfc-pollen";
import { WfcAirQuality } from "../src/components/wfc-air-quality";
import "../src/index";

/**
 * Shapes mirror the live particle_man integration: numeric index sensors with
 * category/color_hex/in_season attributes, categorical _level duplicates, and
 * an advisory whose state is the category text.
 */

const entity = (
  id: string,
  translationKey: string | null = null
): DiscoveryResult["entities"][number] => ({
  entityId: id,
  translationKey,
  originalName: null,
});

const POLLEN_DISCOVERY: DiscoveryResult = {
  deviceId: "dev-pollen",
  entities: [
    entity("sensor.home_pollen_pollen_advisory", "pollen_advisory"),
    entity("sensor.home_pollen_tree_pollen"),
    entity("sensor.home_pollen_tree_pollen_level"),
    entity("sensor.home_pollen_weed_pollen"),
    entity("sensor.home_pollen_ragweed_pollen"),
    entity("sensor.home_pollen_oak_pollen"),
  ],
};

const pollenHass = () =>
  ({
    locale: { language: "en" },
    states: {
      "sensor.home_pollen_pollen_advisory": {
        state: "Very Low",
        attributes: { friendly_name: "Pollen Advisory" },
      },
      "sensor.home_pollen_tree_pollen": {
        state: "1",
        attributes: {
          friendly_name: "Tree Pollen",
          category: "Very Low",
          color_hex: "#009E3A",
          in_season: true,
        },
      },
      "sensor.home_pollen_tree_pollen_level": {
        state: "Very Low",
        attributes: { friendly_name: "Tree Pollen Level" },
      },
      "sensor.home_pollen_weed_pollen": {
        state: "2",
        attributes: {
          friendly_name: "Weed Pollen",
          category: "Low",
          color_hex: "#84CF33",
          in_season: true,
        },
      },
      "sensor.home_pollen_ragweed_pollen": {
        state: "2",
        attributes: {
          friendly_name: "Ragweed Pollen",
          category: "Low",
          color_hex: "#84CF33",
          in_season: true,
          family: "Asteraceae",
          picture: "https://example.invalid/ragweed.jpg",
        },
      },
      // Out of season: unknown state, must not appear in the plant grid.
      "sensor.home_pollen_oak_pollen": {
        state: "unknown",
        attributes: { friendly_name: "Oak Pollen", in_season: false },
      },
    },
  }) as unknown as HomeAssistant;

describe("classifyPollen", () => {
  it("separates advisory, type tiles and in-season plants", () => {
    const { advisory, types, plants } = classifyPollen(
      pollenHass(),
      POLLEN_DISCOVERY.entities
    );
    expect(advisory?.state.state).toBe("Very Low");
    expect(types.map((t) => t.entityId)).toEqual([
      "sensor.home_pollen_tree_pollen",
      "sensor.home_pollen_weed_pollen",
    ]);
    // Ragweed in season and live; oak unknown/out-of-season is excluded.
    expect(plants.map((p) => p.entityId)).toEqual([
      "sensor.home_pollen_ragweed_pollen",
    ]);
  });

  it("excludes the categorical _level duplicates", () => {
    const { types, plants } = classifyPollen(
      pollenHass(),
      POLLEN_DISCOVERY.entities
    );
    const ids = [...types, ...plants].map((e) => e.entityId);
    expect(ids.every((id) => !id.endsWith("_level"))).toBe(true);
  });
});

const AQ_DISCOVERY: DiscoveryResult = {
  deviceId: "dev-aq",
  entities: [
    entity("sensor.home_pollution_universal_aqi", "aqi"),
    entity("sensor.home_pollution_universal_aqi_level", "aqi_level"),
    entity("sensor.home_pollution_air_quality_advisory", "aq_advisory"),
    entity("sensor.home_pollution_pm2_5"),
    entity("sensor.home_pollution_pm2_5_level"),
    entity("sensor.home_pollution_o3"),
  ],
};

const aqHass = () =>
  ({
    locale: { language: "en" },
    states: {
      "sensor.home_pollution_universal_aqi": {
        state: "65",
        attributes: {
          friendly_name: "Universal AQI",
          category: "Good air quality",
          color_hex: "#00e400",
          dominant_pollutant: "o3",
          health_recommendations: { general_population: "Enjoy the outdoors." },
        },
      },
      "sensor.home_pollution_universal_aqi_level": {
        state: "Good air quality",
        attributes: {},
      },
      "sensor.home_pollution_air_quality_advisory": {
        state: "Good",
        attributes: {},
      },
      "sensor.home_pollution_pm2_5": {
        state: "4.5",
        attributes: {
          friendly_name: "PM2.5",
          category: "Good",
          color_hex: "#00e400",
          unit_of_measurement: "µg/m³",
        },
      },
      "sensor.home_pollution_pm2_5_level": {
        state: "Good",
        attributes: {},
      },
      "sensor.home_pollution_o3": {
        state: "31",
        attributes: {
          friendly_name: "Ozone",
          category: "Good",
          color_hex: "#00e400",
          unit_of_measurement: "ppb",
        },
      },
    },
  }) as unknown as HomeAssistant;

describe("classifyAirQuality", () => {
  it("finds the AQI, advisory and numeric pollutants", () => {
    const { aqi, advisory, pollutants } = classifyAirQuality(
      aqHass(),
      AQ_DISCOVERY.entities
    );
    expect(aqi?.state.state).toBe("65");
    expect(advisory?.state.state).toBe("Good");
    // Order follows the discovery list (which real discovery pre-sorts).
    expect(pollutants.map((p) => p.entityId).sort()).toEqual([
      "sensor.home_pollution_o3",
      "sensor.home_pollution_pm2_5",
    ]);
  });
});

describe("wfc-pollen", () => {
  it("renders tiles from color_hex with no local color logic", async () => {
    const el = await fixture<WfcPollen>(
      html`<wfc-pollen
        .hass=${pollenHass()}
        .discovery=${POLLEN_DISCOVERY}
      ></wfc-pollen>`
    );
    await el.updateComplete;

    const swatch = el.querySelector<HTMLElement>(
      ".wfc-pollen-tile .wfc-swatch"
    );
    // happy-dom stores the raw value; the point is it came from color_hex.
    expect(swatch?.style.background.toLowerCase()).toBe("#009e3a");
    expect(el.textContent).toContain("Very Low");
  });

  it("expands a plant to its botanical detail", async () => {
    const el = await fixture<WfcPollen>(
      html`<wfc-pollen
        .hass=${pollenHass()}
        .discovery=${POLLEN_DISCOVERY}
      ></wfc-pollen>`
    );
    await el.updateComplete;

    el.querySelector<HTMLButtonElement>(".wfc-pollen-plant-row")?.click();
    await el.updateComplete;

    expect(el.querySelector(".wfc-pollen-plant-detail")?.textContent).toContain(
      "Asteraceae"
    );
    expect(
      el.querySelector<HTMLImageElement>(".wfc-pollen-plant-picture")?.src
    ).toContain("ragweed.jpg");
  });

  it("shows the discovering placeholder before discovery resolves", async () => {
    const el = await fixture<WfcPollen>(
      html`<wfc-pollen .hass=${pollenHass()}></wfc-pollen>`
    );
    await el.updateComplete;
    expect(el.querySelector(".wfc-panel-empty")?.textContent).toContain(
      "Finding sensors"
    );
  });
});

describe("wfc-air-quality", () => {
  it("renders the AQI headline, dominant pollutant and grid", async () => {
    const el = await fixture<WfcAirQuality>(
      html`<wfc-air-quality
        .hass=${aqHass()}
        .discovery=${AQ_DISCOVERY}
      ></wfc-air-quality>`
    );
    await el.updateComplete;

    expect(el.querySelector(".wfc-panel-headline")?.textContent).toContain(
      "65"
    );
    expect(el.querySelector(".wfc-aq-dominant")?.textContent).toContain("O3");
    expect(el.querySelectorAll(".wfc-aq-pollutant")).toHaveLength(2);
  });

  it("expands health recommendations on demand", async () => {
    const el = await fixture<WfcAirQuality>(
      html`<wfc-air-quality
        .hass=${aqHass()}
        .discovery=${AQ_DISCOVERY}
      ></wfc-air-quality>`
    );
    await el.updateComplete;

    expect(el.querySelector(".wfc-aq-health")).toBeNull();
    el.querySelector<HTMLButtonElement>(".wfc-aq-health-toggle")?.click();
    await el.updateComplete;
    expect(el.querySelector(".wfc-aq-health")?.textContent).toContain(
      "Enjoy the outdoors"
    );
  });
});
