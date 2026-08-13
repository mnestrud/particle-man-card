import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { HomeAssistant } from "custom-card-helpers";
import { DiscoveryResult } from "../data/entity-discovery";
import {
  ClassifiedEntity,
  categoryOf,
  classifyAirQuality,
  colorOf,
  isQuiet,
  severityMaxOf,
  severityOf,
  shortNameOf,
} from "../data/panel-entities";
import { barRow, scaleBar } from "./bar";
import { localize } from "../localize/localize";

/**
 * Air quality panel, dense-bar design language (see design/full-card-*.html):
 * hero numeral + category + segmented UAQI scale, then one severity bar per
 * pollutant above its action level, with the quiet ones collapsed into an
 * expandable footer so absence reads as checked-and-fine.
 *
 * All colors are integration `color_hex`, bar lengths severity/severity_max —
 * no thresholds or vocabulary live here.
 */
@customElement("wfc-air-quality")
export class WfcAirQuality extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public discovery?: DiscoveryResult;

  @state() private showQuiet = false;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) {
      return nothing;
    }
    if (!this.discovery) {
      return html`<div class="pmc-panel">
        <div class="pmc-panel-empty">
          ${localize(this.hass, "panel.discovering")}
        </div>
      </div>`;
    }
    const { aqi, pollutants } = classifyAirQuality(
      this.hass,
      this.discovery.entities
    );
    if (!aqi && pollutants.length === 0) {
      return html`<div class="pmc-panel">
        <div class="pmc-panel-empty">
          ${localize(this.hass, "panel.no_entities")}
        </div>
      </div>`;
    }

    const aqiAttrs = (aqi?.state.attributes ?? {}) as Record<string, unknown>;
    const trend = typeof aqiAttrs.trend === "string" ? aqiAttrs.trend : "";

    const bySeverity = (a: ClassifiedEntity, b: ClassifiedEntity) =>
      (severityOf(b) ?? -1) - (severityOf(a) ?? -1);
    const active = pollutants.filter((p) => !isQuiet(p)).sort(bySeverity);
    const quiet = pollutants.filter((p) => isQuiet(p)).sort(bySeverity);

    return html`
      <div class="pmc-panel pmc-air-quality">
        <span class="pmc-panel-title">
          ${localize(this.hass, "air_quality.title")}
        </span>
        ${aqi ? this.renderHero(aqi, trend, pollutants) : nothing}
        ${active.length || (this.showQuiet && quiet.length)
          ? html`<div class="pmc-rows">
              ${active.map((p) => this.renderPollutant(p))}
              ${this.showQuiet
                ? quiet.map((p) => this.renderPollutant(p))
                : nothing}
            </div>`
          : nothing}
        ${quiet.length
          ? html`<button
              class="pmc-footer"
              @click=${() => (this.showQuiet = !this.showQuiet)}
              aria-expanded=${this.showQuiet}
            >
              ${localize(this.hass, "panel.quiet")}:
              ${quiet.map((p) => this.shortName(p)).join(" · ")}
              ${this.showQuiet ? "▴" : "▾"}
            </button>`
          : nothing}
      </div>
    `;
  }

  private renderHero(
    aqi: ClassifiedEntity,
    trend: string,
    pollutants: ClassifiedEntity[]
  ): TemplateResult {
    const color = colorOf(aqi);
    const dominant = pollutants.find(
      (p) => p.state.attributes.is_dominant === true
    );
    const dominantText = dominant
      ? `${this.shortName(dominant)} ${localize(this.hass, "air_quality.dominant_chip")}`
      : localize(this.hass, "air_quality.universal_aqi");
    const meta = [dominantText, trend].filter(Boolean).join(" · ");
    return html`
      <div
        class="pmc-hero"
        style=${styleMap({ "--row-color": color ?? "var(--disabled-color)" })}
      >
        <span class="pmc-hero-value">${aqi.state.state}</span>
        <span class="pmc-hero-category">
          <span class="pmc-swatch"></span>${categoryOf(aqi) ?? ""}
        </span>
        <span class="pmc-hero-meta">${meta}</span>
      </div>
      ${scaleBar(severityOf(aqi), severityMaxOf(aqi), color)}
    `;
  }

  private shortName(entity: ClassifiedEntity): string {
    return shortNameOf(entity, this.discovery?.entities ?? []);
  }

  private renderPollutant(pollutant: ClassifiedEntity): TemplateResult {
    return barRow({
      label: this.shortName(pollutant),
      color: colorOf(pollutant),
      severity: severityOf(pollutant),
      severityMax: severityMaxOf(pollutant),
      value: pollutant.state.state,
      unit: (pollutant.state.attributes.unit_of_measurement as string) ?? "",
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wfc-air-quality": WfcAirQuality;
  }
}
