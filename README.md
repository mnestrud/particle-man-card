# Particle Man Card

An all-in-one Home Assistant dashboard card for the
[Particle Man](https://github.com/mnestrud/particle-man) integration: current
conditions, hourly / daily / twice-daily forecasts, a minute-by-minute
precipitation nowcast, weather alerts, air quality and pollen — in one card.

A hard fork of the excellent
[troinine/ha-weather-forecast-card](https://github.com/troinine/ha-weather-forecast-card)
(MIT), keeping its chart mode, attribute selector, condition effects and
visual editor, and adding the panels above. It works with **any** weather
entity — the nowcast, alerts, air-quality and pollen panels are optional and
simply need entities that provide the data (Particle Man provides all of
them).

## Installation

### HACS (custom repository)

1. HACS → three-dot menu → **Custom repositories**
2. Add `https://github.com/mnestrud/particle-man-card`, category **Dashboard**
3. Install **Particle Man Card** and reload your browser

### Manual

Download `particle-man-card.js` from the latest release and register it as a
dashboard resource:

```yaml
url: /local/particle-man-card.js
type: module
```

## Quick start

```yaml
type: custom:particle-man-card
entity: weather.home_weather
forecast_types: all            # hourly + daily + twice-daily views
nowcast: {}                    # minute forecast from the same entity
alerts:
  entity: sensor.home_weather_weather_alert_count
air_quality:
  anchor_entity: sensor.home_pollution_universal_aqi
pollen:
  anchor_entity: sensor.home_pollen_pollen_advisory
```

Everything below `entity` is optional — omit any block you don't want.

## Configuration

All upstream options are unchanged; see the
[upstream reference](docs/UPSTREAM_README.md) for the full weather-section
documentation (`current`, `forecast`, `forecast_action`, header chips,
condition effects, chart mode, …).

### New options in this fork

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `forecast_types` | string | `both` | Adds `all`: subscribe hourly, daily **and** twice-daily; the forecast tap-action cycles through every view that has data. |
| `default_forecast` | string | `daily` | Now also accepts `twice_daily`. |
| `forecast.extra_attribute` | string | — | Now also accepts `solar_wh` (see Solar). |
| `nowcast` | object | — | Minute-by-minute precipitation strip. |
| `alerts` | object | — | Weather alert banner. |
| `air_quality` | object | — | Air quality panel. |
| `pollen` | object | — | Pollen panel. |
| `solar` | object | — | Solar production forecast annotations. |

#### `nowcast`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | the card's `entity` | A weather entity whose integration provides the `get_minute_forecast` action (Particle Man, OpenWeatherMap, DWD Nowcast, …), or a `sensor.*` exposing nowcast segments as a `forecast`/`segments` attribute. |
| `always_show` | boolean | `false` | Keep the strip visible when nothing is expected. |

The strip's time axis is derived from the data, so a 60-minute OpenWeatherMap
window and Particle Man's 6-hour window both label correctly. It refreshes
every minute and hides itself while dry (unless `always_show`).

#### `alerts`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | required | An alert-count sensor whose `alerts` attribute carries the active alert list (Particle Man's **Alert Count**). |

Collapsed: a one-line banner colored by the worst active severity. Tap to
expand titles, areas, expiry times, descriptions and instructions. Hidden
entirely when nothing is active. Severity colors follow your theme
(`--error-color`, `--warning-color`, `--info-color`) and can be overridden via
`--weather-forecast-card-alert-{extreme,severe,moderate,minor}-color`.

#### `air_quality` and `pollen`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `anchor_entity` | string | required | **Any** sensor belonging to the target device. |

You configure one entity; the card resolves its device from the entity
registry and discovers every sensor on it — so new sensors (seasonal pollen
species, added pollutants) appear without touching the config, and
multi-location installs pick the location by the anchor.

- **Air quality** shows the Universal AQI with its category color, the
  dominant pollutant, a pollutant grid, and health recommendations behind a
  toggle.
- **Pollen** shows the advisory, tree/grass/weed tiles, and the in-season
  plants with expandable botanical detail (family, genus, season,
  cross-reactions, photo). Category colors come from the integration's own
  `color_hex` attributes.

#### `solar`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `config_entries` | list | all solar sources | Energy-dashboard config entry ids to include. |

Requires solar forecast sources configured in the HA Energy dashboard. Adds
`solar_wh` to forecast entries (hourly entries get their hour, daily entries
the day total); show it with `forecast.extra_attribute: solar_wh`.

## Full example

```yaml
type: custom:particle-man-card
entity: weather.home_weather
default_forecast: hourly
forecast_types: all
show_condition_effects: true
forecast:
  mode: chart
  hourly_slots: 24
  extra_attribute: solar_wh
  show_attribute_selector: true
nowcast:
  always_show: false
alerts:
  entity: sensor.home_weather_weather_alert_count
air_quality:
  anchor_entity: sensor.home_pollution_universal_aqi
pollen:
  anchor_entity: sensor.home_pollen_pollen_advisory
solar: {}
```

## Development

```bash
pnpm install
pnpm run dev        # test app with live reload
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build      # dist/particle-man-card.js
```

Upstream is tracked as a git remote; fixes to components this fork does not
touch are cherry-picked.

## Credits

- [troinine/ha-weather-forecast-card](https://github.com/troinine/ha-weather-forecast-card) — the base card
- [Thyraz/weather-forecast-extended](https://github.com/Thyraz/weather-forecast-extended) and
  [tobiasb80/detailed-weather-forecast](https://github.com/tobiasb80/detailed-weather-forecast) —
  the `get_minute_forecast` card convention and the solar/localize patterns

## License

MIT — see [LICENSE](LICENSE). Copyright the upstream authors and contributors.
