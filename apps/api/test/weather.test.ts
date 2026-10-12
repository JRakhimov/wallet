import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { DateTime } from "luxon";
import { buildTools, ToolboxDeps } from "../src/assistant/tools/toolbox";
import { ToolContext } from "../src/assistant/tools/tool";
import { WeatherService } from "../src/assistant/weather.service";

const tashkent = {
  results: [
    {
      name: "Ташкент",
      admin1: "Ташкент",
      country: "Узбекистан",
      latitude: 41.26,
      longitude: 69.22,
    },
  ],
};
const forecast = {
  timezone: "Asia/Tashkent",
  current: {
    time: "2026-10-12T15:00",
    temperature_2m: 20.1,
    apparent_temperature: 19.1,
    relative_humidity_2m: 53,
    precipitation: 0.1,
    weather_code: 51,
    wind_speed_10m: 1.95,
  },
  daily: {
    time: ["2026-10-12"],
    weather_code: [0],
    temperature_2m_max: [23.1],
    temperature_2m_min: [11.2],
    precipitation_probability_max: [0],
    precipitation_sum: [0],
    wind_speed_10m_max: [2.27],
    sunrise: ["2026-10-12T06:31"],
    sunset: ["2026-10-12T17:47"],
  },
};

function mockOpenMeteo(t: TestContext, places: unknown = tashkent) {
  const urls: URL[] = [];

  t.mock.method(globalThis, "fetch", async (url: string) => {
    const parsed = new URL(url);
    urls.push(parsed);

    return Response.json(parsed.hostname.startsWith("geocoding") ? places : forecast);
  });

  return urls;
}

test("the forecast names the place and the sky in words, in metric units", async (t) => {
  const urls = mockOpenMeteo(t);
  const weather = new WeatherService();

  const result = await weather.forecast("Ташкент", 3, false);

  assert.equal(result.place, "Ташкент, Узбекистан");
  assert.deepEqual(result.now, {
    time: "2026-10-12T15:00",
    temperature: 20.1,
    feelsLike: 19.1,
    humidity: 53,
    precipitation: 0.1,
    wind: 1.95,
    sky: "слабая морось",
  });
  assert.equal(result.days[0].sky, "ясно");
  assert.equal(result.days[0].max, 23.1);

  const request = urls[1].searchParams;
  assert.equal(request.get("latitude"), "41.26");
  assert.equal(request.get("forecast_days"), "3");
  assert.equal(request.get("wind_speed_unit"), "ms");
  assert.equal(request.get("hourly"), null);
});

test("a place is looked up once, and an unknown one is reported", async (t) => {
  const urls = mockOpenMeteo(t);
  const weather = new WeatherService();

  await weather.forecast("Ташкент", 1, false);
  await weather.forecast(" ташкент ", 1, true);

  assert.equal(urls.filter((url) => url.hostname.startsWith("geocoding")).length, 1);
  assert.equal(
    urls.at(-1)!.searchParams.get("hourly"),
    "temperature_2m,precipitation_probability,weather_code",
  );

  t.mock.restoreAll();
  mockOpenMeteo(t, {});
  await assert.rejects(weather.forecast("Нигдеград", 1, false), /Не нашёл место «Нигдеград»/);
});

test("the tool keeps the forecast between one and sixteen days", async () => {
  const asked: unknown[][] = [];
  const deps = {
    weather: {
      forecast: async (...args: unknown[]) => {
        asked.push(args);
        return {};
      },
    },
  };
  const tool = buildTools(deps as unknown as ToolboxDeps).tools.get("get_weather")!;
  const context = { now: DateTime.now() } as ToolContext;

  await tool.run(context, tool.parameters.parse({ place: "Ташкент", days: null, hourly: false }));
  await tool.run(context, tool.parameters.parse({ place: "Ташкент", days: 40, hourly: true }));

  assert.deepEqual(asked, [
    ["Ташкент", 3, false],
    ["Ташкент", 16, true],
  ]);
});
