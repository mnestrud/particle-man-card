import { describe, expect, it } from "vitest";
import { HomeAssistant } from "custom-card-helpers";
import { localize } from "../src/localize/localize";

const hassWith = (language: string | undefined) =>
  ({ locale: { language } }) as unknown as HomeAssistant;

describe("localize", () => {
  it("resolves dot-path keys from the English table", () => {
    expect(localize(hassWith("en"), "alerts.none")).toBe("No active alerts");
    expect(localize(hassWith("en"), "nowcast.type.HAIL")).toBe("Hail");
  });

  it("falls back to English for unknown locales", () => {
    expect(localize(hassWith("xx-YY"), "pollen.in_season")).toBe("In season");
  });

  it("returns the key itself when no table has it", () => {
    // Never throws, always renders something debuggable.
    expect(localize(hassWith("en"), "not.a.real.key")).toBe("not.a.real.key");
  });

  it("tolerates a missing hass entirely", () => {
    expect(localize(undefined, "air_quality.title")).toBe("Air Quality");
  });

  it("interpolates a search/replace pair", () => {
    expect(localize(hassWith("en"), "alerts.count", "{count}", "3")).toBe(
      "3 active alert"
    );
  });

  it("does not resolve non-leaf nodes to strings", () => {
    // A partial path lands on an object; that is a miss, not a value.
    expect(localize(hassWith("en"), "nowcast.type")).toBe("nowcast.type");
  });
});
