import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { HomeAssistant } from "custom-card-helpers";
import { localize } from "../localize/localize";

/**
 * Weather alerts panel.
 *
 * Reads a single alert-count sensor whose `alerts` attribute carries the full
 * alert list (particle_man's Alert Count sensor). Collapsed it is a one-line
 * severity-colored banner; tapping expands per-alert detail with description
 * and instructions. Hidden entirely when there are no active alerts — an empty
 * warning panel is noise on a card people glance at.
 */

interface WeatherAlert {
  title?: string;
  event_type?: string;
  severity?: string;
  /** Integration-computed rank, 0 = least severe (particle_man v1.7.0+). */
  severity_rank?: number | null;
  area?: string;
  start_time?: string;
  expiration_time?: string;
  description?: string;
  instruction?: string;
}

/**
 * Numeric rank from the integration; unknown/absent ranks sort least-severe.
 * No vocabulary lookup — the enum-string fallback exists only for pre-1.7.0
 * integrations and treats every alert as minor rather than guessing.
 */
const rankOf = (alert: WeatherAlert): number =>
  typeof alert.severity_rank === "number" ? alert.severity_rank : -1;

/** CSS class chosen by rank position, worst rank 3 → extreme. */
const severityClass = (alert: WeatherAlert): string => {
  switch (rankOf(alert)) {
    case 3:
      return "pmc-alerts-extreme";
    case 2:
      return "pmc-alerts-severe";
    case 1:
      return "pmc-alerts-moderate";
    default:
      return "pmc-alerts-minor";
  }
};

@customElement("wfc-alerts")
export class WfcAlerts extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property() public entityId?: string;

  @state() private expanded = false;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private alerts(): WeatherAlert[] {
    if (!this.hass || !this.entityId) {
      return [];
    }
    const stateObj = this.hass.states[this.entityId];
    if (!stateObj) {
      return [];
    }
    const list = (stateObj.attributes as Record<string, unknown>).alerts;
    if (!Array.isArray(list)) {
      return [];
    }
    return [...(list as WeatherAlert[])].sort((a, b) => rankOf(b) - rankOf(a));
  }

  private formatTime(iso: string | undefined): string {
    if (!iso) {
      return "";
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString(this.hass?.locale?.language ?? undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  protected render(): TemplateResult | typeof nothing {
    const alerts = this.alerts();
    if (alerts.length === 0) {
      return nothing;
    }

    const worst = alerts[0]!;
    const countKey = alerts.length === 1 ? "alerts.count" : "alerts.count_plural";
    const banner =
      alerts.length === 1
        ? (worst.title ?? worst.event_type ?? "")
        : localize(this.hass, countKey, "{count}", String(alerts.length));
    const worstUntil =
      alerts.length === 1 ? this.formatTime(worst.expiration_time) : "";

    return html`
      <div
        class=${classMap({
          "pmc-alerts": true,
          [severityClass(worst)]: true,
        })}
      >
        <button
          class="pmc-alerts-banner"
          @click=${() => (this.expanded = !this.expanded)}
          aria-expanded=${this.expanded}
        >
          ${worst.severity
            ? html`<span class="pmc-chip">
                ${localize(
                  this.hass,
                  `alerts.severity.${worst.severity.toUpperCase()}`
                )}
              </span>`
            : nothing}
          <span class="pmc-alerts-banner-text">${banner}</span>
          ${worstUntil
            ? html`<span class="pmc-alerts-banner-until">
                ${localize(this.hass, "alerts.until")} ${worstUntil}
              </span>`
            : nothing}
          <ha-icon
            icon=${this.expanded ? "mdi:chevron-up" : "mdi:chevron-down"}
          ></ha-icon>
        </button>
        ${this.expanded
          ? html`<div class="pmc-alerts-list">
              ${alerts.map((alert) => this.renderAlert(alert))}
            </div>`
          : nothing}
      </div>
    `;
  }

  private renderAlert(alert: WeatherAlert): TemplateResult {
    const until = this.formatTime(alert.expiration_time);
    return html`
      <div class=${classMap({
        "pmc-alerts-item": true,
        [severityClass(alert)]: true,
      })}>
        <div class="pmc-alerts-item-header">
          <span class="pmc-alerts-item-title">
            ${alert.title ?? alert.event_type ?? ""}
          </span>
          ${until
            ? html`<span class="pmc-alerts-item-until">
                ${localize(this.hass, "alerts.until")} ${until}
              </span>`
            : nothing}
        </div>
        ${alert.area
          ? html`<div class="pmc-alerts-item-area">${alert.area}</div>`
          : nothing}
        ${alert.description
          ? html`<div class="pmc-alerts-item-description">
              ${alert.description}
            </div>`
          : nothing}
        ${alert.instruction
          ? html`<div class="pmc-alerts-item-instruction">
              <span class="pmc-alerts-item-instruction-label">
                ${localize(this.hass, "alerts.instructions")}:
              </span>
              ${alert.instruction}
            </div>`
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wfc-alerts": WfcAlerts;
  }
}
