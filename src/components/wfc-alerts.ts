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
  area?: string;
  start_time?: string;
  expiration_time?: string;
  description?: string;
  instruction?: string;
}

/**
 * Ordered worst-first; index doubles as the ranking for the banner color.
 * Maps onto HA theme variables the way the UV bands do — no hex literals.
 */
const SEVERITY_RANK: Record<string, number> = {
  EXTREME: 0,
  SEVERE: 1,
  MODERATE: 2,
  MINOR: 3,
};

const severityClass = (severity: string | undefined): string => {
  switch ((severity ?? "").toUpperCase()) {
    case "EXTREME":
      return "wfc-alerts-extreme";
    case "SEVERE":
      return "wfc-alerts-severe";
    case "MODERATE":
      return "wfc-alerts-moderate";
    default:
      return "wfc-alerts-minor";
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
    return [...(list as WeatherAlert[])].sort(
      (a, b) =>
        (SEVERITY_RANK[(a.severity ?? "").toUpperCase()] ?? 9) -
        (SEVERITY_RANK[(b.severity ?? "").toUpperCase()] ?? 9)
    );
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

    return html`
      <div
        class=${classMap({
          "wfc-alerts": true,
          [severityClass(worst.severity)]: true,
        })}
      >
        <button
          class="wfc-alerts-banner"
          @click=${() => (this.expanded = !this.expanded)}
          aria-expanded=${this.expanded}
        >
          <ha-icon icon="mdi:alert"></ha-icon>
          <span class="wfc-alerts-banner-text">${banner}</span>
          <span class="wfc-alerts-severity-label">
            ${localize(
              this.hass,
              `alerts.severity.${(worst.severity ?? "MINOR").toUpperCase()}`
            )}
          </span>
          <ha-icon
            icon=${this.expanded ? "mdi:chevron-up" : "mdi:chevron-down"}
          ></ha-icon>
        </button>
        ${this.expanded
          ? html`<div class="wfc-alerts-list">
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
        "wfc-alerts-item": true,
        [severityClass(alert.severity)]: true,
      })}>
        <div class="wfc-alerts-item-header">
          <span class="wfc-alerts-item-title">
            ${alert.title ?? alert.event_type ?? ""}
          </span>
          ${until
            ? html`<span class="wfc-alerts-item-until">
                ${localize(this.hass, "alerts.until")} ${until}
              </span>`
            : nothing}
        </div>
        ${alert.area
          ? html`<div class="wfc-alerts-item-area">${alert.area}</div>`
          : nothing}
        ${alert.description
          ? html`<div class="wfc-alerts-item-description">
              ${alert.description}
            </div>`
          : nothing}
        ${alert.instruction
          ? html`<div class="wfc-alerts-item-instruction">
              <span class="wfc-alerts-item-instruction-label">
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
