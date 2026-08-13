import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  LinearScale,
  ScatterDataPoint,
} from "chart.js";
import { HomeAssistant } from "custom-card-helpers";
import {
  NowcastEntry,
  fetchNowcast,
  resolveNowcastDomain,
  summarizeNowcast,
} from "../data/nowcast";
import { localize } from "../localize/localize";
import { logger } from "../logger";

Chart.register(BarController, BarElement, CategoryScale, LinearScale);

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Precipitation nowcast strip.
 *
 * Deliberately a sibling of pmc-forecast-chart rather than a mode of it: that
 * component is a fixed-width-per-item horizontal scroller with one header and
 * footer element per data point, which is exactly wrong for ~180 two-minute
 * segments. This strip fits its container, renders no per-item DOM, and lets
 * Chart.js derive the time axis from the data — the axis is correct for a
 * 60-minute OWM window and a 6-hour particle_man window alike, with no
 * hardcoded label table.
 */
@customElement("wfc-nowcast")
export class WfcNowcast extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property() public entityId?: string;
  @property({ type: Boolean }) public alwaysShow = false;

  @state() private entries: NowcastEntry[] = [];
  @state() private loaded = false;

  private chart: Chart | null = null;
  private serviceDomain: string | null = null;
  private domainResolved = false;
  private refreshTimer: number | undefined;

  // Light DOM, matching the repo convention — the single global stylesheet
  // styles every component (see pmc-forecast-chart et al.).
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this.refreshTimer = window.setInterval(
      () => void this.refresh(),
      REFRESH_INTERVAL_MS
    );
    void this.refresh();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.refreshTimer);
    this.chart?.destroy();
    this.chart = null;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("entityId")) {
      this.domainResolved = false;
      this.entries = [];
      this.loaded = false;
      void this.refresh();
    }
    // A sensor-backed nowcast updates through the state machine, not a
    // service; refresh when hass changes so those stay live.
    if (changed.has("hass") && this.entityId?.startsWith("sensor.")) {
      void this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    if (!this.hass || !this.entityId) {
      return;
    }
    if (!this.domainResolved && !this.entityId.startsWith("sensor.")) {
      this.serviceDomain = await resolveNowcastDomain(this.hass, this.entityId);
      this.domainResolved = true;
      if (!this.serviceDomain) {
        logger.warn(`nowcast: no platform for ${this.entityId}; strip hidden`);
      }
    }
    this.entries = await fetchNowcast(
      this.hass,
      this.entityId,
      this.serviceDomain
    );
    this.loaded = true;
  }

  private headline(): string {
    const summary = summarizeNowcast(this.entries);
    const typeName = localize(
      this.hass,
      `nowcast.type.${summary.type ?? "NONE"}`
    );
    if (summary.allDry) {
      const spanMs =
        this.entries.length > 1
          ? new Date(this.entries[this.entries.length - 1]!.datetime).getTime() -
            new Date(this.entries[0]!.datetime).getTime()
          : 0;
      const hours = Math.max(1, Math.round(spanMs / 3_600_000));
      return localize(
        this.hass,
        "nowcast.none_expected",
        "{hours}",
        String(hours)
      );
    }
    if (summary.precipitating) {
      return summary.endsInMinutes === null
        ? typeName
        : localize(this.hass, "nowcast.ends_in", "{type}", typeName).replace(
            "{minutes}",
            String(summary.endsInMinutes)
          );
    }
    return localize(this.hass, "nowcast.starts_in", "{type}", typeName).replace(
      "{minutes}",
      String(summary.startsInMinutes ?? 0)
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this.entityId || !this.loaded) {
      return nothing;
    }
    const summary = summarizeNowcast(this.entries);
    if (this.entries.length === 0) {
      return nothing;
    }
    if (summary.allDry && !this.alwaysShow) {
      return nothing;
    }

    return html`
      <div class="wfc-nowcast">
        <div class="wfc-nowcast-headline">${this.headline()}</div>
        <div class="wfc-nowcast-chart">
          <canvas></canvas>
        </div>
      </div>
    `;
  }

  protected updated(): void {
    const canvas = this.querySelector<HTMLCanvasElement>(
      ".wfc-nowcast-chart canvas"
    );
    if (!canvas) {
      this.chart?.destroy();
      this.chart = null;
      return;
    }
    const config = this.chartConfig();
    if (this.chart && this.chart.canvas === canvas) {
      this.chart.data = config.data;
      this.chart.options = config.options ?? {};
      this.chart.update("none");
      return;
    }
    this.chart?.destroy();
    this.chart = new Chart(canvas, config) as unknown as Chart;
  }

  private chartConfig(): ChartConfiguration<"bar", ScatterDataPoint[]> {
    const style = getComputedStyle(this);
    const barColor =
      style.getPropertyValue("--wfc-nowcast-bar-color").trim() ||
      style.getPropertyValue("--wfc-precipitation-color").trim() ||
      "#4fc3f7";
    const heavyColor =
      style.getPropertyValue("--wfc-nowcast-bar-heavy-color").trim() ||
      barColor;
    const gridColor = style.getPropertyValue("--wfc-chart-grid-color").trim();
    const labelColor = style
      .getPropertyValue("--wfc-chart-axis-label-color")
      .trim();
    const fontSize =
      Number.parseInt(style.getPropertyValue("--wfc-chart-font-size"), 10) ||
      12;

    const base = this.entries.length
      ? new Date(this.entries[0]!.datetime).getTime()
      : 0;
    const points = this.entries.map((entry) => ({
      x: (new Date(entry.datetime).getTime() - base) / 60000,
      y: entry.precipitation,
    }));
    const maxRate = Math.max(1, ...points.map((p) => p.y));
    const spanMinutes = points.length ? points[points.length - 1]!.x : 0;
    // Round hour ticks for long windows, 10-minute ticks for short ones —
    // derived from the data span, never a hardcoded label table.
    const stepMinutes = spanMinutes > 120 ? 60 : 10;

    return {
      type: "bar",
      data: {
        datasets: [
          {
            data: points,
            backgroundColor: points.map((p) =>
              p.y >= maxRate * 0.66 ? heavyColor : barColor
            ),
            borderRadius: 2,
            barPercentage: 1.0,
            categoryPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        events: [],
        plugins: { tooltip: { enabled: false }, legend: { display: false } },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: Math.max(spanMinutes, 1),
            grid: { display: false },
            ticks: {
              stepSize: stepMinutes,
              color: labelColor || undefined,
              font: { size: fontSize },
              callback: (value) => {
                const minutes = Number(value);
                if (minutes === 0) {
                  return localize(this.hass, "nowcast.now");
                }
                return minutes % 60 === 0
                  ? `${minutes / 60}h`
                  : `${minutes}m`;
              },
            },
          },
          y: {
            min: 0,
            suggestedMax: maxRate,
            grid: { color: gridColor || undefined, drawTicks: false },
            ticks: { display: false },
          },
        },
      },
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wfc-nowcast": WfcNowcast;
  }
}
