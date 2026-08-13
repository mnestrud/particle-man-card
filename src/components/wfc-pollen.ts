import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { HomeAssistant } from "custom-card-helpers";
import { DiscoveryResult } from "../data/entity-discovery";
import {
  ClassifiedEntity,
  categoryOf,
  classifyPollen,
  colorOf,
  isQuiet,
  severityMaxOf,
  severityOf,
  shortNameOf,
} from "../data/panel-entities";
import { barRow, barWidth } from "./bar";
import { localize } from "../localize/localize";

/**
 * Pollen panel, dense-bar design language (see design/full-card-*.html):
 * advisory hero, one severity bar per type/plant above its action level,
 * expandable botanical detail per plant, quiet rows collapsed into a footer.
 *
 * All colors are integration `color_hex`, bar lengths severity/severity_max —
 * no thresholds or vocabulary live here. Out-of-season plants stay hidden
 * (in-season filtering lives in classifyPollen); in-season-but-quiet rows go
 * to the footer so a Very Low day collapses to a single advisory line.
 */
@customElement("wfc-pollen")
export class WfcPollen extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public discovery?: DiscoveryResult;

  @state() private expandedPlant: string | null = null;
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
    const { advisory, types, plants } = classifyPollen(
      this.hass,
      this.discovery.entities
    );
    if (!advisory && types.length === 0) {
      return html`<div class="pmc-panel">
        <div class="pmc-panel-empty">
          ${localize(this.hass, "panel.no_entities")}
        </div>
      </div>`;
    }

    const bySeverity = (a: ClassifiedEntity, b: ClassifiedEntity) =>
      (severityOf(b) ?? -1) - (severityOf(a) ?? -1);
    const activeTypes = types.filter((t) => !isQuiet(t)).sort(bySeverity);
    const activePlants = plants.filter((p) => !isQuiet(p)).sort(bySeverity);
    const quiet = [
      ...types.filter((t) => isQuiet(t)).sort(bySeverity),
      ...plants.filter((p) => isQuiet(p)).sort(bySeverity),
    ];

    return html`
      <div class="pmc-panel pmc-pollen">
        <span class="pmc-panel-title">
          ${localize(this.hass, "pollen.title")}
        </span>
        ${advisory ? this.renderHero(advisory, quiet.length > 0) : nothing}
        ${activeTypes.length ||
        activePlants.length ||
        (this.showQuiet && quiet.length)
          ? html`<div class="pmc-rows">
              ${activeTypes.map((type) => this.renderType(type))}
              ${activePlants.map((plant) => this.renderPlant(plant))}
              ${this.showQuiet
                ? quiet.map((entity) => this.renderType(entity))
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
              ${quiet.map((entity) => this.shortName(entity)).join(" · ")}
              ${this.showQuiet ? "▴" : "▾"}
            </button>`
          : nothing}
      </div>
    `;
  }

  private renderHero(
    advisory: ClassifiedEntity,
    allQuiet: boolean
  ): TemplateResult {
    const attrs = advisory.state.attributes as Record<string, unknown>;
    const color = colorOf(advisory);
    const dominantType =
      typeof attrs.dominant_type === "string" && attrs.dominant_type
        ? localize(
            this.hass,
            "pollen.dominant_line",
            "{type}",
            attrs.dominant_type.charAt(0).toUpperCase() +
              attrs.dominant_type.slice(1)
          )
        : allQuiet
          ? localize(this.hass, "panel.all_quiet")
          : "";
    return html`
      <div
        class="pmc-hero"
        style=${styleMap({ "--row-color": color ?? "var(--disabled-color)" })}
      >
        <span class="pmc-hero-value text">${advisory.state.state}</span>
        <span class="pmc-hero-category">
          <span class="pmc-swatch"></span>${dominantType}
        </span>
      </div>
    `;
  }

  private shortName(entity: ClassifiedEntity): string {
    return shortNameOf(entity, this.discovery?.entities ?? []);
  }

  private renderType(entity: ClassifiedEntity): TemplateResult {
    return barRow({
      label: this.shortName(entity),
      color: colorOf(entity),
      severity: severityOf(entity),
      severityMax: severityMaxOf(entity),
      value: entity.state.state,
      unit: categoryOf(entity) ?? "",
    });
  }

  private renderPlant(entity: ClassifiedEntity): TemplateResult {
    const attrs = entity.state.attributes as Record<string, unknown>;
    const expanded = this.expandedPlant === entity.entityId;
    const color = colorOf(entity);
    const detailRows: Array<[string, unknown]> = [
      [localize(this.hass, "pollen.family"), attrs.family],
      [localize(this.hass, "pollen.genus"), attrs.genus],
      [localize(this.hass, "pollen.season"), attrs.season],
      [localize(this.hass, "pollen.cross_reaction"), attrs.cross_reaction],
    ];
    const hasDetail = detailRows.some(
      ([, value]) => typeof value === "string" && value
    );

    return html`
      <button
        class="pmc-row"
        style=${styleMap({ "--row-color": color ?? "var(--disabled-color)" })}
        @click=${() =>
          (this.expandedPlant = expanded ? null : entity.entityId)}
        aria-expanded=${expanded}
      >
        <span class="pmc-row-label" style="padding-left:12px">
          ${this.shortName(entity)} ${hasDetail ? (expanded ? "▴" : "▸") : ""}
        </span>
        <div class="pmc-row-bar">
          <div
            class="pmc-row-bar-fill"
            style=${styleMap({
              width: barWidth(severityOf(entity), severityMaxOf(entity)),
            })}
          ></div>
        </div>
        <span class="pmc-row-value">
          <b>${entity.state.state}</b><span class="unit">${categoryOf(entity) ?? ""}</span>
        </span>
      </button>
      ${expanded && hasDetail
        ? html`<div class="pmc-detail">
            ${typeof attrs.picture === "string" && attrs.picture
              ? html`<img
                  src=${attrs.picture}
                  alt=${this.shortName(entity)}
                  @error=${(ev: Event) => (ev.target as HTMLElement).remove()}
                />`
              : nothing}
            <dl>
              ${detailRows
                .filter(([, value]) => typeof value === "string" && value)
                .map(
                  ([label, value]) => html`
                    <dt>${label}</dt>
                    <dd>${value}</dd>
                  `
                )}
            </dl>
          </div>`
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wfc-pollen": WfcPollen;
  }
}
