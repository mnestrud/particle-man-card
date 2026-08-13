import { html, nothing, TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";

/**
 * Shared severity-bar row: `label | bar | value` on the card-wide column grid
 * (see the .pmc-row styles). A template function, deliberately NOT a custom
 * element — no registry surface, no collision risk with the upstream card.
 *
 * Bar length is severity / severity_max from integration attributes and the
 * fill is the entity's color_hex; this module owns geometry, never thresholds.
 */

export interface BarRow {
  label: string | TemplateResult;
  /** Entity color_hex; null falls back to --disabled-color. */
  color: string | null;
  severity: number | null;
  severityMax: number | null;
  /** Raw value text — always shown; color never replaces the number. */
  value: string;
  unit?: string;
  chip?: string;
}

export const barWidth = (
  severity: number | null,
  severityMax: number | null
): string => {
  if (severity === null || !severityMax) {
    return "0%";
  }
  return `${Math.max(0, Math.min(1, severity / severityMax)) * 100}%`;
};

export const barRow = (row: BarRow): TemplateResult => html`
  <div
    class="pmc-row"
    style=${styleMap({ "--row-color": row.color ?? "var(--disabled-color)" })}
  >
    <span class="pmc-row-label">
      ${row.label}${row.chip
        ? html`<span class="pmc-chip">${row.chip}</span>`
        : nothing}
    </span>
    <div class="pmc-row-bar">
      <div
        class="pmc-row-bar-fill"
        style=${styleMap({ width: barWidth(row.severity, row.severityMax) })}
      ></div>
    </div>
    <span class="pmc-row-value">
      <b>${row.value}</b>${row.unit
        ? html`<span class="unit">${row.unit}</span>`
        : nothing}
    </span>
  </div>
`;

/** Segmented scale: severity_max + 1 segments, 0..severity lit. */
export const scaleBar = (
  severity: number | null,
  severityMax: number | null,
  color: string | null
): TemplateResult | typeof nothing => {
  if (severity === null || severityMax === null) {
    return nothing;
  }
  const segments = [];
  for (let i = 0; i <= severityMax; i += 1) {
    segments.push(
      html`<div class="pmc-scale-seg ${i <= severity ? "on" : ""}"></div>`
    );
  }
  return html`
    <div
      class="pmc-scale"
      style=${styleMap({ "--row-color": color ?? "var(--disabled-color)" })}
    >
      ${segments}
    </div>
  `;
};
