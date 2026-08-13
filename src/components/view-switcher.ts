import { html, nothing, TemplateResult } from "lit";
import { HomeAssistant } from "custom-card-helpers";
import { ForecastType } from "../data/weather";
import { localize } from "../localize/localize";

/**
 * Forecast view switcher: the active view lit, the others demoted. A template
 * function (not an element) shared by the chart settings row and the
 * simple-mode panel header. Anything daily-like (daily, twice_daily fallback)
 * labels as "Daily".
 */
export const renderViewSwitcher = (
  hass: HomeAssistant | undefined,
  views: ForecastType[],
  current: ForecastType,
  onSelect: (view: ForecastType) => void
): TemplateResult | typeof nothing => {
  if (views.length < 2) {
    return nothing;
  }
  const labelFor = (view: ForecastType): string =>
    localize(hass, view === "hourly" ? "forecast.hourly" : "forecast.daily");
  return html`
    <span class="pmc-views">
      ${views.map(
        (view) => html`<span
          class="view ${view === current ? "active" : ""}"
          role="button"
          tabindex="0"
          @click=${(ev: Event) => {
            ev.stopPropagation();
            onSelect(view);
          }}
          >${labelFor(view)}</span
        >`
      )}
    </span>
  `;
};
