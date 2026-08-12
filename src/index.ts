import { WeatherForecastCard } from "./weather-forecast-card";
import * as pjson from "../package.json";
import "./editor/weather-forecast-card-editor";

declare global {
  interface Window {
    customCards: Array<object>;
  }
}

customElements.define("particle-man-card", WeatherForecastCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "particle-man-card",
  name: "Particle Man Card",
  description:
    "Weather, precipitation nowcast, air quality and pollen for Home Assistant",
});

console.info(
  `%cPARTICLE-MAN-CARD %c${pjson.version}`,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);
