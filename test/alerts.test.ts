import { beforeEach, describe, expect, it } from "vitest";
import { fixture } from "@open-wc/testing";
import { html } from "lit";
import { HomeAssistant } from "custom-card-helpers";
import { WfcAlerts } from "../src/components/wfc-alerts";
import "../src/index";

const ALERT = {
  title: "Tornado Warning",
  event_type: "TORNADO_WARNING",
  severity: "EXTREME",
  area: "King County",
  expiration_time: "2026-08-12T20:00:00Z",
  description: "A tornado has been sighted.",
  instruction: "Take shelter now.",
};

const hassWith = (alerts: unknown) =>
  ({
    locale: { language: "en" },
    states: {
      "sensor.alerts": { entity_id: "sensor.alerts", attributes: { alerts } },
    },
  }) as unknown as HomeAssistant;

const mount = async (alerts: unknown): Promise<WfcAlerts> => {
  const el = await fixture<WfcAlerts>(
    html`<wfc-alerts
      .hass=${hassWith(alerts)}
      .entityId=${"sensor.alerts"}
    ></wfc-alerts>`
  );
  await el.updateComplete;
  return el;
};

describe("wfc-alerts", () => {
  beforeEach(() => {
    // Guards against the silent failure mode of a lit template referencing an
    // element nobody imported: it renders as an inert unknown tag.
    expect(customElements.get("wfc-alerts")).toBeDefined();
    expect(customElements.get("wfc-nowcast")).toBeDefined();
    expect(customElements.get("particle-man-card")).toBeDefined();
  });

  it("renders nothing when there are no alerts", async () => {
    const el = await mount([]);
    expect(el.querySelector(".wfc-alerts")).toBeNull();
  });

  it("renders a banner with the alert title and severity", async () => {
    const el = await mount([ALERT]);
    expect(el.querySelector(".wfc-alerts")).not.toBeNull();
    expect(el.querySelector(".wfc-alerts-banner-text")?.textContent).toContain(
      "Tornado Warning"
    );
    expect(
      el.querySelector(".wfc-alerts-severity-label")?.textContent?.trim()
    ).toBe("Extreme");
    expect(el.querySelector(".wfc-alerts")?.classList.contains(
      "wfc-alerts-extreme"
    )).toBe(true);
  });

  it("shows a count when multiple alerts are active", async () => {
    const el = await mount([
      ALERT,
      { ...ALERT, title: "Flood Watch", severity: "MODERATE" },
    ]);
    expect(el.querySelector(".wfc-alerts-banner-text")?.textContent).toContain(
      "2 active alerts"
    );
  });

  it("colors by the worst severity when multiple are active", async () => {
    const el = await mount([
      { ...ALERT, title: "Flood Watch", severity: "MODERATE" },
      ALERT, // EXTREME, listed second — must still win
    ]);
    expect(
      el.querySelector(".wfc-alerts")?.classList.contains("wfc-alerts-extreme")
    ).toBe(true);
  });

  it("expands to show description and instructions on tap", async () => {
    const el = await mount([ALERT]);
    expect(el.querySelector(".wfc-alerts-list")).toBeNull();

    el.querySelector<HTMLButtonElement>(".wfc-alerts-banner")?.click();
    await el.updateComplete;

    expect(
      el.querySelector(".wfc-alerts-item-description")?.textContent
    ).toContain("tornado has been sighted");
    expect(
      el.querySelector(".wfc-alerts-item-instruction")?.textContent
    ).toContain("Take shelter now");
  });

  it("survives a malformed alerts attribute", async () => {
    const el = await mount("not-a-list");
    expect(el.querySelector(".wfc-alerts")).toBeNull();
  });
});
