import { HomeAssistant } from "custom-card-helpers";
import * as en from "./languages/en.json";

/**
 * Card-local string table with locale fallback.
 *
 * Upstream leans entirely on hass.localize / formatEntityAttributeName, which
 * covers standard weather attributes and nothing else — HA's frontend has no
 * keys for AQI categories, pollen types, alert severities or nowcast copy, so
 * every string in the new panels needs a home of its own. Pattern lifted from
 * tobiasb80/detailed-weather-forecast (MIT).
 *
 * Keys are dot paths into the language JSON. Lookup order: user language →
 * English → the key itself (never throws, always renders something).
 */

const LANGUAGES: Record<string, unknown> = { en };

const lookup = (table: unknown, key: string): string | undefined => {
  let node: unknown = table;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
};

export const localize = (
  hass: HomeAssistant | undefined,
  key: string,
  search?: string,
  replace?: string
): string => {
  const lang = (hass?.locale?.language ?? "en").replace("-", "_").toLowerCase();
  const base = lang.split("_")[0];

  let result =
    lookup(LANGUAGES[lang], key) ??
    (base !== undefined ? lookup(LANGUAGES[base], key) : undefined) ??
    lookup(LANGUAGES.en, key) ??
    key;

  if (search !== undefined && replace !== undefined) {
    result = result.replace(search, replace);
  }
  return result;
};
