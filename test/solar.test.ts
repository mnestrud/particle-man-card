import { describe, expect, it, vi } from "vitest";
import { HomeAssistant } from "custom-card-helpers";
import { fetchSolarForecast, mergeSolarForecast } from "../src/data/solar";
import { ForecastAttribute } from "../src/data/weather";

const WH_HOURS = {
  "2026-08-12T10:00:00+00:00": 500,
  "2026-08-12T11:00:00+00:00": 800,
  "2026-08-13T10:00:00+00:00": 300,
};

const hassWith = (prefs: unknown, forecasts: unknown) =>
  ({
    callWS: vi.fn(async (msg: { type: string }) => {
      if (msg.type === "energy/get_prefs") {
        return prefs;
      }
      if (msg.type === "energy/solar_forecast") {
        return forecasts;
      }
      throw new Error(`unexpected ${msg.type}`);
    }),
  }) as unknown as HomeAssistant;

describe("fetchSolarForecast", () => {
  it("resolves solar sources from energy prefs and builds lookups", async () => {
    const hass = hassWith(
      {
        energy_sources: [
          { type: "grid" },
          { type: "solar", config_entry_solar_forecast: ["entry-1"] },
        ],
      },
      { "entry-1": { wh_hours: WH_HOURS } }
    );
    const lookup = await fetchSolarForecast(hass);
    expect(lookup).not.toBeNull();
    expect(
      lookup!.hourlyWh.get(new Date("2026-08-12T10:00:00+00:00").getTime())
    ).toBe(500);
  });

  it("sums across multiple sources", async () => {
    const hass = hassWith(
      {
        energy_sources: [
          {
            type: "solar",
            config_entry_solar_forecast: ["entry-1", "entry-2"],
          },
        ],
      },
      {
        "entry-1": { wh_hours: WH_HOURS },
        "entry-2": { wh_hours: { "2026-08-12T10:00:00+00:00": 100 } },
      }
    );
    const lookup = await fetchSolarForecast(hass);
    expect(
      lookup!.hourlyWh.get(new Date("2026-08-12T10:00:00+00:00").getTime())
    ).toBe(600);
  });

  it("returns null when no solar sources are configured", async () => {
    const hass = hassWith({ energy_sources: [{ type: "grid" }] }, {});
    expect(await fetchSolarForecast(hass)).toBeNull();
  });

  it("returns null on websocket failure", async () => {
    const hass = {
      callWS: vi.fn(async () => {
        throw new Error("no energy dashboard");
      }),
    } as unknown as HomeAssistant;
    expect(await fetchSolarForecast(hass)).toBeNull();
  });
});

describe("mergeSolarForecast", () => {
  const lookup = {
    hourlyWh: new Map([[new Date("2026-08-12T10:00:00+00:00").getTime(), 500]]),
    dailyWh: new Map([["2026-08-12", 1300]]),
  };

  it("annotates hourly entries with their hour's production", () => {
    const forecast: ForecastAttribute[] = [
      { datetime: "2026-08-12T10:00:00+00:00", temperature: 20 },
      { datetime: "2026-08-12T22:00:00+00:00", temperature: 15 },
    ];
    const merged = mergeSolarForecast(forecast, lookup, "hourly");
    expect(merged[0]?.solar_wh).toBe(500);
    // No production data for that hour: field stays absent, not zero.
    expect(merged[1]?.solar_wh).toBeUndefined();
  });

  it("annotates daily entries with the day total", () => {
    const forecast: ForecastAttribute[] = [
      { datetime: "2026-08-12T04:00:00+00:00", temperature: 20 },
    ];
    // dayKey uses local time, so derive the expected key the same way.
    const local = new Date("2026-08-12T04:00:00+00:00");
    const localKey = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    const merged = mergeSolarForecast(forecast, lookup, "daily");
    if (localKey === "2026-08-12") {
      expect(merged[0]?.solar_wh).toBe(1300);
    } else {
      expect(merged[0]?.solar_wh).toBeUndefined();
    }
  });

  it("does not mutate the input entries", () => {
    const forecast: ForecastAttribute[] = [
      { datetime: "2026-08-12T10:00:00+00:00", temperature: 20 },
    ];
    mergeSolarForecast(forecast, lookup, "hourly");
    expect(forecast[0]?.solar_wh).toBeUndefined();
  });
});
