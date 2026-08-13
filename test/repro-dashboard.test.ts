import { describe, expect, it } from "vitest";
import { WeatherForecastCard } from "../src/weather-forecast-card";
import "../src/index";

describe("dashboard repro", () => {
  it("accepts the exact dashboard config", () => {
    const card = document.createElement(
      "particle-man-card"
    ) as WeatherForecastCard;
    const config = {
      type: "custom:particle-man-card",
      entity: "weather.home_weather",
      forecast_types: "all",
      theme: "Graphite Auto",
      forecast: {
        mode: "chart",
        hourly_slots: 24,
        show_attribute_selector: true,
      },
      nowcast: {},
      alerts: { entity: "sensor.home_weather_weather_alert_count" },
      air_quality: { anchor_entity: "sensor.home_pollution_universal_aqi" },
      pollen: { anchor_entity: "sensor.home_pollen_pollen_advisory" },
      grid_options: { columns: "full" },
    };
    expect(() =>
      card.setConfig(config as Parameters<typeof card.setConfig>[0])
    ).not.toThrow();
  });
});
