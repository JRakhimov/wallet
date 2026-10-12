import { z } from "zod/v4";
import { MAX_FORECAST_DAYS, WeatherService } from "../weather.service";
import { defineTool, Toolset } from "./tool";

export type WeatherDeps = { weather: Pick<WeatherService, "forecast"> };

const DEFAULT_DAYS = 3;

/** Weather now and the forecast anywhere. */
export function weatherTools(deps: WeatherDeps): Toolset {
  return { tools: [getWeather(deps)], actions: {} };
}

function getWeather(deps: WeatherDeps) {
  return defineTool({
    name: "get_weather",
    progress: "Смотрю погоду…",
    description:
      "Weather now and the daily forecast (temperature, sky, chance of rain, wind, sunrise and sunset) for a place. Without a place in the question use the user's city from memory, otherwise the city of their timezone. Ask for hourly when the time of day matters (e.g. «вечером будет дождь?»).",
    parameters: z.strictObject({
      place: z.string().describe("City or place, e.g. «Ташкент», «Самарканд», «Москва»"),
      days: z
        .number()
        .nullable()
        .describe(
          `Days of the forecast from today, up to ${MAX_FORECAST_DAYS}; null for ${DEFAULT_DAYS}`,
        ),
      hourly: z.boolean().describe("true to add hours of today and tomorrow"),
    }),

    async run(_context, args) {
      const days = Math.min(Math.max(Math.round(args.days ?? DEFAULT_DAYS), 1), MAX_FORECAST_DAYS);

      return deps.weather.forecast(args.place, days, args.hourly);
    },
  });
}
