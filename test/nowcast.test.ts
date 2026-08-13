import { describe, expect, it, vi } from "vitest";
import { HomeAssistant } from "custom-card-helpers";
import {
  fetchNowcast,
  resolveNowcastDomain,
  summarizeNowcast,
} from "../src/data/nowcast";

/**
 * The nowcast data layer bridges two source shapes — the get_minute_forecast
 * action convention and sensor attributes — into one normalized series, and
 * derives the headline from it. These pin the seams: domain resolution from
 * the registry, tolerant parsing, and the starting/ending/none derivation.
 */

const T0 = new Date("2026-08-12T12:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60000).toISOString();

describe("resolveNowcastDomain", () => {
  it("reads the platform from the entity registry", async () => {
    const hass = {
      callWS: vi.fn(async () => ({ platform: "particle_man" })),
    } as unknown as HomeAssistant;
    expect(await resolveNowcastDomain(hass, "weather.home")).toBe(
      "particle_man"
    );
  });

  it("returns null on failure rather than throwing", async () => {
    const hass = {
      callWS: vi.fn(async () => {
        throw new Error("nope");
      }),
    } as unknown as HomeAssistant;
    expect(await resolveNowcastDomain(hass, "weather.home")).toBeNull();
  });
});

describe("fetchNowcast", () => {
  it("calls the action for weather entities and unwraps the response", async () => {
    const hass = {
      callWS: vi.fn(async () => ({
        response: {
          "weather.home": {
            forecast: [
              { datetime: at(0), precipitation: 1.5 },
              { datetime: at(2), precipitation: 0 },
            ],
          },
        },
      })),
    } as unknown as HomeAssistant;

    const entries = await fetchNowcast(hass, "weather.home", "particle_man");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.precipitation).toBe(1.5);
    expect(hass.callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "call_service",
        domain: "particle_man",
        service: "get_minute_forecast",
        return_response: true,
      })
    );
  });

  it("reads sensor entities from attributes without any service call", async () => {
    const hass = {
      callWS: vi.fn(),
      states: {
        "sensor.nowcast": {
          attributes: {
            segments: [{ start: at(4), precipitation: 2 }],
          },
        },
      },
    } as unknown as HomeAssistant;

    const entries = await fetchNowcast(hass, "sensor.nowcast", null);
    expect(entries).toHaveLength(1);
    // `start` is accepted as the datetime alias used by segment attributes.
    expect(entries[0]?.datetime).toBe(at(4));
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("drops malformed entries instead of failing the batch", async () => {
    const hass = {
      callWS: vi.fn(async () => ({
        response: {
          "weather.home": {
            forecast: [
              { datetime: at(0), precipitation: 1 },
              { precipitation: 5 },          // no datetime
              "garbage",
              { datetime: at(2), precipitation: "wet" }, // NaN → 0
            ],
          },
        },
      })),
    } as unknown as HomeAssistant;

    const entries = await fetchNowcast(hass, "weather.home", "particle_man");
    expect(entries.map((e) => e.precipitation)).toEqual([1, 0]);
  });

  it("returns empty when the action errors", async () => {
    const hass = {
      callWS: vi.fn(async () => {
        throw new Error("service not found");
      }),
    } as unknown as HomeAssistant;
    expect(await fetchNowcast(hass, "weather.home", "particle_man")).toEqual(
      []
    );
  });
});

describe("summarizeNowcast", () => {
  const dry = (min: number) => ({ datetime: at(min), precipitation: 0 });
  const wet = (min: number, rate = 2) => ({
    datetime: at(min),
    precipitation: rate,
    end: at(min + 2),
    type: "RAIN",
  });

  it("reports minutes until the first wet segment", () => {
    const summary = summarizeNowcast([dry(0), dry(2), wet(30)], T0);
    expect(summary.precipitating).toBe(false);
    expect(summary.startsInMinutes).toBe(30);
    expect(summary.type).toBe("RAIN");
  });

  it("reports zero and an end time while precipitation falls", () => {
    const summary = summarizeNowcast(
      [wet(-2), wet(0), wet(2), dry(4), dry(6)],
      T0
    );
    expect(summary.precipitating).toBe(true);
    expect(summary.startsInMinutes).toBe(0);
    expect(summary.endsInMinutes).toBe(4);
  });

  it("reports all-dry when nothing is coming", () => {
    const summary = summarizeNowcast([dry(0), dry(2), dry(4)], T0);
    expect(summary.allDry).toBe(true);
    expect(summary.startsInMinutes).toBeNull();
  });

  it("handles an empty series", () => {
    expect(summarizeNowcast([], T0).allDry).toBe(true);
  });
});

describe("summarizeNowcast probability", () => {
  const now = new Date("2026-08-13T20:00:00Z");
  it("quotes the peak probability of the upcoming wet run", () => {
    const summary = summarizeNowcast(
      [
        { datetime: "2026-08-13T20:00:00Z", precipitation: 0 },
        { datetime: "2026-08-13T20:05:00Z", precipitation: 0.5, probability: 30 },
        { datetime: "2026-08-13T20:07:00Z", precipitation: 1.1, probability: 52 },
        { datetime: "2026-08-13T20:09:00Z", precipitation: 0 },
        // A later, separate run must not contribute its probability.
        { datetime: "2026-08-13T20:30:00Z", precipitation: 2.0, probability: 90 },
      ],
      now
    );
    expect(summary.probability).toBe(52);
  });

  it("is null when entries carry no probability (sensor-path data)", () => {
    const summary = summarizeNowcast(
      [{ datetime: "2026-08-13T20:05:00Z", precipitation: 0.5 }],
      now
    );
    expect(summary.probability).toBeNull();
  });
});
