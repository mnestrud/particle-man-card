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
  friendlyNameOf,
} from "../data/panel-entities";
import { localize } from "../localize/localize";

/**
 * Pollen panel: advisory header, tree/grass/weed tiles, and an in-season
 * plant grid with expandable botanical detail.
 *
 * All category colors come from the integration's `color_hex` attribute —
 * Google's own UPI palette — so there is no threshold logic here. The hexes
 * are fixed brand colors that don't adapt to theme, so they are used only as
 * swatches and chips, never as text or backgrounds that must meet contrast.
 *
 * Out-of-season plants read `unknown` most of the year; showing them would
 * render a mostly-empty grid, so only in-season plants appear.
 */
@customElement("wfc-pollen")
export class WfcPollen extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public discovery?: DiscoveryResult;

  @state() private expandedPlant: string | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) {
      return nothing;
    }
    if (!this.discovery) {
      return html`<div class="wfc-panel wfc-pollen">
        <div class="wfc-panel-empty">
          ${localize(this.hass, "panel.discovering")}
        </div>
      </div>`;
    }
    const { advisory, types, plants } = classifyPollen(
      this.hass,
      this.discovery.entities
    );
    if (!advisory && types.length === 0) {
      return html`<div class="wfc-panel wfc-pollen">
        <div class="wfc-panel-empty">
          ${localize(this.hass, "panel.no_entities")}
        </div>
      </div>`;
    }

    return html`
      <div class="wfc-panel wfc-pollen">
        <div class="wfc-panel-header">
          <span class="wfc-panel-title">
            ${localize(this.hass, "pollen.title")}
          </span>
          ${advisory
            ? html`<span class="wfc-panel-headline">
                ${advisory.state.state}
              </span>`
            : nothing}
        </div>
        ${types.length
          ? html`<div class="wfc-pollen-types">
              ${types.map((type) => this.renderTile(type))}
            </div>`
          : nothing}
        ${plants.length
          ? html`<div class="wfc-pollen-plants">
              ${plants.map((plant) => this.renderPlant(plant))}
            </div>`
          : nothing}
      </div>
    `;
  }

  private renderTile(entity: ClassifiedEntity): TemplateResult {
    const color = colorOf(entity);
    const category = categoryOf(entity);
    return html`
      <div class="wfc-pollen-tile">
        <span
          class="wfc-swatch"
          style=${styleMap({ background: color ?? "var(--disabled-color)" })}
        ></span>
        <div class="wfc-pollen-tile-body">
          <span class="wfc-pollen-tile-name">${friendlyNameOf(entity)}</span>
          <span class="wfc-pollen-tile-value">
            ${entity.state.state}${category ? html` · ${category}` : nothing}
          </span>
        </div>
      </div>
    `;
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

    return html`
      <div class="wfc-pollen-plant">
        <button
          class="wfc-pollen-plant-row"
          @click=${() =>
            (this.expandedPlant = expanded ? null : entity.entityId)}
          aria-expanded=${expanded}
        >
          <span
            class="wfc-swatch"
            style=${styleMap({ background: color ?? "var(--disabled-color)" })}
          ></span>
          <span class="wfc-pollen-plant-name">${friendlyNameOf(entity)}</span>
          <span class="wfc-pollen-plant-value">
            ${entity.state.state}${categoryOf(entity)
              ? html` · ${categoryOf(entity)}`
              : nothing}
          </span>
        </button>
        ${expanded
          ? html`<div class="wfc-pollen-plant-detail">
              ${typeof attrs.picture === "string" && attrs.picture
                ? html`<img
                    class="wfc-pollen-plant-picture"
                    src=${attrs.picture}
                    alt=${friendlyNameOf(entity)}
                    @error=${(ev: Event) =>
                      (ev.target as HTMLElement).remove()}
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
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wfc-pollen": WfcPollen;
  }
}
