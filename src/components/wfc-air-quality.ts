import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { HomeAssistant } from "custom-card-helpers";
import { DiscoveryResult } from "../data/entity-discovery";
import {
  categoryOf,
  classifyAirQuality,
  colorOf,
  friendlyNameOf,
} from "../data/panel-entities";
import { localize } from "../localize/localize";

/**
 * Air quality panel: Universal AQI headline with category color, dominant
 * pollutant, a pollutant grid, and expandable health recommendations.
 *
 * Category colors come from the integration's `color_hex` attributes (EPA
 * palette) — swatches only, never text/background, since fixed hexes ignore
 * the theme.
 */
@customElement("wfc-air-quality")
export class WfcAirQuality extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public discovery?: DiscoveryResult;

  @state() private showHealth = false;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) {
      return nothing;
    }
    if (!this.discovery) {
      return html`<div class="wfc-panel wfc-air-quality">
        <div class="wfc-panel-empty">
          ${localize(this.hass, "panel.discovering")}
        </div>
      </div>`;
    }
    const { aqi, advisory, pollutants } = classifyAirQuality(
      this.hass,
      this.discovery.entities
    );
    if (!aqi && pollutants.length === 0) {
      return html`<div class="wfc-panel wfc-air-quality">
        <div class="wfc-panel-empty">
          ${localize(this.hass, "panel.no_entities")}
        </div>
      </div>`;
    }

    const aqiAttrs = (aqi?.state.attributes ?? {}) as Record<string, unknown>;
    const dominant = aqiAttrs.dominant_pollutant;
    const health = aqiAttrs.health_recommendations;
    const healthText =
      typeof health === "string"
        ? health
        : typeof health === "object" && health !== null
          ? String(
              (health as Record<string, unknown>).general_population ?? ""
            )
          : "";

    return html`
      <div class="wfc-panel wfc-air-quality">
        <div class="wfc-panel-header">
          <span class="wfc-panel-title">
            ${localize(this.hass, "air_quality.title")}
          </span>
          ${aqi
            ? html`<span class="wfc-panel-headline">
                <span
                  class="wfc-swatch"
                  style=${styleMap({
                    background:
                      colorOf(aqi) ?? "var(--disabled-color)",
                  })}
                ></span>
                ${localize(this.hass, "air_quality.aqi")}
                ${aqi.state.state}${categoryOf(aqi)
                  ? html` · ${categoryOf(aqi)}`
                  : nothing}
              </span>`
            : nothing}
        </div>
        ${advisory
          ? html`<div class="wfc-aq-advisory">${advisory.state.state}</div>`
          : nothing}
        ${typeof dominant === "string" && dominant
          ? html`<div class="wfc-aq-dominant">
              ${localize(this.hass, "air_quality.dominant")}:
              <b>${dominant.toUpperCase()}</b>
            </div>`
          : nothing}
        ${pollutants.length
          ? html`<div class="wfc-aq-pollutants">
              ${pollutants.map(
                (pollutant) => html`
                  <div class="wfc-aq-pollutant">
                    <span
                      class="wfc-swatch"
                      style=${styleMap({
                        background:
                          colorOf(pollutant) ?? "var(--disabled-color)",
                      })}
                    ></span>
                    <span class="wfc-aq-pollutant-name">
                      ${friendlyNameOf(pollutant)}
                    </span>
                    <span class="wfc-aq-pollutant-value">
                      ${pollutant.state.state}
                      ${pollutant.state.attributes.unit_of_measurement ?? ""}
                    </span>
                  </div>
                `
              )}
            </div>`
          : nothing}
        ${healthText
          ? html`
              <button
                class="wfc-aq-health-toggle"
                @click=${() => (this.showHealth = !this.showHealth)}
                aria-expanded=${this.showHealth}
              >
                ${localize(this.hass, "air_quality.health")}
                <ha-icon
                  icon=${this.showHealth
                    ? "mdi:chevron-up"
                    : "mdi:chevron-down"}
                ></ha-icon>
              </button>
              ${this.showHealth
                ? html`<div class="wfc-aq-health">${healthText}</div>`
                : nothing}
            `
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wfc-air-quality": WfcAirQuality;
  }
}
