import { describe, expect, it } from "vitest";
import { HomeAssistant } from "custom-card-helpers";
import { WeatherForecastCard } from "../src/weather-forecast-card";
import { WeatherEntityFeature } from "../src/data/weather";
import "../src/index";

/**
 * Deterministic tests for the two-view forecast cycle (the twice-daily third
 * view was removed with the redesign; "all" remains a legacy config alias for
 * "both"). The subscription flow is timing-dependent in happy-dom, so these
 * drive the state machine directly: seed the per-view data slots and assert
 * on the transitions.
 */

const FEATURES_ALL =
  WeatherEntityFeature.FORECAST_DAILY |
  WeatherEntityFeature.FORECAST_HOURLY |
  WeatherEntityFeature.FORECAST_TWICE_DAILY;

const makeCard = (
  features: number,
  slots: {
    daily?: number;
    hourly?: number;
  }
): WeatherForecastCard => {
  const card = document.createElement(
    "particle-man-card"
  ) as WeatherForecastCard;
  card.setConfig({
    type: "custom:particle-man-card",
    entity: "weather.demo",
    forecast_types: "all",
  });
  card.hass = {
    states: {
      "weather.demo": {
        entity_id: "weather.demo",
        state: "sunny",
        attributes: { supported_features: features },
      },
    },
  } as unknown as WeatherForecastCard["hass"] as HomeAssistant;

  const entry = { datetime: "2026-08-12T12:00:00Z", temperature: 20 };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  if (slots.daily) {
    (card as any)._dailyForecastData = Array(slots.daily).fill(entry);
  }
  if (slots.hourly) {
    (card as any)._hourlyForecastData = Array(slots.hourly).fill(entry);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return card;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const viewOf = (card: WeatherForecastCard): string =>
  (card as any)._currentForecastType;
const toggle = (card: WeatherForecastCard): void =>
  (card as any)._toggleForecastView();
const setView = (card: WeatherForecastCard, view: string): void => {
  (card as any)._currentForecastType = view;
};
const currentForecast = (card: WeatherForecastCard): unknown[] =>
  (card as any).getCurrentForecast();
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("forecast view cycle", () => {
  it("cycles daily -> hourly -> daily (legacy forecast_types: all config)", () => {
    const card = makeCard(FEATURES_ALL, { daily: 5, hourly: 24 });
    expect(viewOf(card)).toBe("daily");

    toggle(card);
    expect(viewOf(card)).toBe("hourly");
    toggle(card);
    expect(viewOf(card)).toBe("daily");
  });

  it("degrades to the classic two-view toggle without a third subscription", () => {
    const card = makeCard(FEATURES_ALL, { daily: 5, hourly: 24 });

    toggle(card);
    expect(viewOf(card)).toBe("hourly");
    toggle(card);
    expect(viewOf(card)).toBe("daily");
  });

  it("skips views that have no data", () => {
    const card = makeCard(FEATURES_ALL, { hourly: 24 });

    setView(card, "hourly");
    toggle(card);
    expect(viewOf(card)).toBe("hourly"); // daily slot empty, nothing to cycle
  });

  it("does not toggle at all with a single populated view", () => {
    const card = makeCard(FEATURES_ALL, { daily: 5 });
    toggle(card);
    expect(viewOf(card)).toBe("daily");
  });

  it("falls back to the daily slot for twice_daily-only entities", () => {
    // Entity with no daily support: the daily slot carries twice_daily data
    // and no separate subscription exists.
    const card = makeCard(
      WeatherEntityFeature.FORECAST_HOURLY |
        WeatherEntityFeature.FORECAST_TWICE_DAILY,
      { daily: 10, hourly: 24 }
    );
    setView(card, "twice_daily");
    expect(currentForecast(card)).toHaveLength(10);

    // And the cycle offers exactly the two real views.
    toggle(card);
    expect(viewOf(card)).toBe("hourly");
    toggle(card);
    expect(viewOf(card)).toBe("twice_daily");
  });
});
