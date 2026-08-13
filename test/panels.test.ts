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
        state: "Low",
        attributes: {
          friendly_name: "Pollen Advisory",
          color_hex: "#84CF33",
          dominant_type: "weed",
          severity: 2,
          severity_max: 5,
        },
      },
      "sensor.home_pollen_tree_pollen": {
        state: "1",
        attributes: {
          friendly_name: "Tree Pollen",
          category: "Very Low",
          color_hex: "#009E3A",
          in_season: true,
          severity: 1,
          severity_max: 5,
          below_action_level: true,
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
          severity: 2,
          severity_max: 5,
          below_action_level: false,
        },
      },
      "sensor.home_pollen_ragweed_pollen": {
        state: "2",
        attributes: {
          friendly_name: "Ragweed Pollen",
          category: "Low",
          color_hex: "#84CF33",
          in_season: true,
          severity: 2,
          severity_max: 5,
          below_action_level: false,
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
    expect(advisory?.state.state).toBe("Low");
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
          severity: 1,
          severity_max: 4,
          below_action_level: true,
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
        state: "18.1",
        attributes: {
          friendly_name: "PM2.5",
          category: "Moderate",
          color_hex: "#ffff00",
          severity: 1,
          severity_max: 5,
          below_action_level: false,
          is_dominant: true,
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
          severity: 0,
          severity_max: 5,
          below_action_level: true,
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
  it("draws severity bars from integration attributes, no local color logic", async () => {
    const el = await fixture<WfcPollen>(
      html`<wfc-pollen
        .hass=${pollenHass()}
        .discovery=${POLLEN_DISCOVERY}
      ></wfc-pollen>`
    );
    await el.updateComplete;

    // Active rows: weed type (UPI 2) + ragweed plant; tree (UPI 1) is quiet.
    const rows = el.querySelectorAll(".pmc-row");
    expect(rows.length).toBe(2);
    const row = rows[0] as HTMLElement;
    // happy-dom stores raw custom-property values; the point is the fill
    // color came from color_hex and the width from severity/severity_max.
    expect(row.style.getPropertyValue("--row-color").toLowerCase()).toBe(
      "#84cf33"
    );
    const fill = row.querySelector<HTMLElement>(".pmc-row-bar-fill");
    expect(fill?.style.width).toBe("40%");
    // Raw number always shown alongside the category word.
    expect(row.textContent).toContain("2");
    expect(row.textContent).toContain("Low");
  });

  it("collapses quiet rows into the footer and expands them on demand", async () => {
    const el = await fixture<WfcPollen>(
      html`<wfc-pollen
        .hass=${pollenHass()}
        .discovery=${POLLEN_DISCOVERY}
      ></wfc-pollen>`
    );
    await el.updateComplete;

    const footer = el.querySelector<HTMLButtonElement>("button.pmc-footer");
    expect(footer?.textContent).toContain("Quiet");
    expect(footer?.textContent).toContain("Tree Pollen");

    footer?.click();
    await el.updateComplete;
    expect(el.querySelectorAll(".pmc-row").length).toBe(3);
  });

  it("expands a plant to its botanical detail", async () => {
    const el = await fixture<WfcPollen>(
      html`<wfc-pollen
        .hass=${pollenHass()}
        .discovery=${POLLEN_DISCOVERY}
      ></wfc-pollen>`
    );
    await el.updateComplete;

    el.querySelector<HTMLButtonElement>("button.pmc-row")?.click();
    await el.updateComplete;

    expect(el.querySelector(".pmc-detail")?.textContent).toContain(
      "Asteraceae"
    );
    expect(
      el.querySelector<HTMLImageElement>(".pmc-detail img")?.src
    ).toContain("ragweed.jpg");
  });

  it("shows the discovering placeholder before discovery resolves", async () => {
    const el = await fixture<WfcPollen>(
      html`<wfc-pollen .hass=${pollenHass()}></wfc-pollen>`
    );
    await el.updateComplete;
    expect(el.querySelector(".pmc-panel-empty")?.textContent).toContain(
      "Finding sensors"
    );
  });
});

describe("wfc-air-quality", () => {
  it("renders the hero numeral, segmented scale and active pollutant bars", async () => {
    const el = await fixture<WfcAirQuality>(
      html`<wfc-air-quality
        .hass=${aqHass()}
        .discovery=${AQ_DISCOVERY}
      ></wfc-air-quality>`
    );
    await el.updateComplete;

    expect(el.querySelector(".pmc-hero-value")?.textContent).toContain("65");
    // The UAQI segmented scale was removed by review — category text only.
    expect(el.querySelectorAll(".pmc-scale-seg")).toHaveLength(0);
    expect(el.textContent).toContain("Good air quality");
    // Only the elevated PM2.5 gets a bar; Good ozone is quiet.
    const rows = el.querySelectorAll(".pmc-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("PM2.5");
    // Dominance lives in the hero meta line, not a row chip (chips overflow
    // the fixed label column).
    expect(el.querySelector(".pmc-hero-meta")?.textContent).toContain(
      "PM2.5 dominant"
    );
    const footer = el.querySelector("button.pmc-footer");
    expect(footer?.textContent).toContain("Ozone");
  });

});
