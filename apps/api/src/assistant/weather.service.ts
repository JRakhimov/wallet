import { BadGatewayException, Injectable, NotFoundException } from "@nestjs/common";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 10_000;
/** Open-Meteo forecasts up to 16 days ahead. */
export const MAX_FORECAST_DAYS = 16;
/** Hours of the hourly forecast: today and tomorrow are enough for "вечером будет дождь?". */
const HOURLY_HOURS = 48;

const CURRENT_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
];
const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max",
  "precipitation_sum",
  "wind_speed_10m_max",
  "sunrise",
  "sunset",
];
const HOURLY_FIELDS = ["temperature_2m", "precipitation_probability", "weather_code"];

/** WMO weather codes, as Open-Meteo returns them. */
const WEATHER_CODES: Record<number, string> = {
  0: "ясно",
  1: "преимущественно ясно",
  2: "переменная облачность",
  3: "пасмурно",
  45: "туман",
  48: "туман с изморозью",
  51: "слабая морось",
  53: "морось",
  55: "сильная морось",
  56: "слабая ледяная морось",
  57: "ледяная морось",
  61: "небольшой дождь",
  63: "дождь",
  65: "сильный дождь",
  66: "ледяной дождь",
  67: "сильный ледяной дождь",
  71: "небольшой снег",
  73: "снег",
  75: "сильный снег",
  77: "снежная крупа",
  80: "небольшой ливень",
  81: "ливень",
  82: "сильный ливень",
  85: "небольшой снегопад",
  86: "сильный снегопад",
  95: "гроза",
  96: "гроза с градом",
  99: "сильная гроза с градом",
};

type Place = { name: string; country: string; region: string; latitude: number; longitude: number };

type Series = Record<string, (number | string | null)[]>;

type Forecast = {
  timezone: string;
  current: Record<string, number | string>;
  daily: Series & { time: string[] };
  hourly?: Series & { time: string[] };
};

/** Weather from Open-Meteo: free, no key, with search of places in Russian. */
@Injectable()
export class WeatherService {
  /** Places do not move: one lookup per name is enough while the API runs. */
  private readonly places = new Map<string, Place>();

  async forecast(placeName: string, days: number, hourly: boolean) {
    const place = await this.place(placeName);
    const forecast = await this.get<Forecast>(FORECAST_URL, {
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: CURRENT_FIELDS.join(","),
      daily: DAILY_FIELDS.join(","),
      ...(hourly && { hourly: HOURLY_FIELDS.join(",") }),
      timezone: "auto",
      forecast_days: String(days),
      wind_speed_unit: "ms",
    });

    return {
      place: [place.name, place.region, place.country].filter(Boolean).join(", "),
      timezone: forecast.timezone,
      units: { temperature: "°C", precipitation: "мм", wind: "м/с" },
      now: currentWeather(forecast.current),
      days: dailyWeather(forecast.daily),
      ...(forecast.hourly && { hours: hourlyWeather(forecast.hourly) }),
    };
  }

  private async place(name: string) {
    const key = name.trim().toLowerCase();
    const known = this.places.get(key);
    if (known) {
      return known;
    }

    const found = await this.get<{ results?: Record<string, string | number>[] }>(GEOCODING_URL, {
      name: name.trim(),
      count: "1",
      language: "ru",
      format: "json",
    });

    const result = found.results?.[0];
    if (!result) {
      throw new NotFoundException(`Не нашёл место «${name}». Уточните город`);
    }

    const place: Place = {
      name: String(result.name),
      country: String(result.country ?? ""),
      region: result.admin1 && result.admin1 !== result.name ? String(result.admin1) : "",
      latitude: Number(result.latitude),
      longitude: Number(result.longitude),
    };

    this.places.set(key, place);

    return place;
  }

  private async get<T>(url: string, params: Record<string, string>) {
    let response: Response;

    try {
      response = await fetch(`${url}?${new URLSearchParams(params)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException("Сервис погоды не отвечает. Попробуйте позже");
    }

    if (!response.ok) {
      throw new BadGatewayException("Сервис погоды не ответил. Попробуйте позже");
    }

    return (await response.json()) as T;
  }
}

/** An emoji for a WMO code: clear, clouds, fog, drizzle and rain, snow, thunderstorm. */
function icon(code: number | string | null) {
  const value = Number(code);

  if (value === 0 || value === 1) {
    return "☀️";
  }

  if (value === 2) {
    return "⛅";
  }

  if (value === 3) {
    return "☁️";
  }

  if (value === 45 || value === 48) {
    return "🌫";
  }

  if ((value >= 71 && value <= 77) || value === 85 || value === 86) {
    return "❄️";
  }

  if (value >= 95) {
    return "⛈";
  }

  return "🌧";
}

function describe(code: number | string | null) {
  return WEATHER_CODES[Number(code)] ?? "неизвестно";
}

function currentWeather(current: Record<string, number | string>) {
  return {
    time: current.time,
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    precipitation: current.precipitation,
    wind: current.wind_speed_10m,
    sky: describe(current.weather_code),
  };
}

function dailyWeather(daily: Series & { time: string[] }) {
  return daily.time.map((date, index) => ({
    date,
    sky: describe(daily.weather_code[index]),
    icon: icon(daily.weather_code[index]),
    min: daily.temperature_2m_min[index],
    max: daily.temperature_2m_max[index],
    precipitationChance: daily.precipitation_probability_max[index],
    precipitation: daily.precipitation_sum[index],
    wind: daily.wind_speed_10m_max[index],
    sunrise: daily.sunrise[index],
    sunset: daily.sunset[index],
  }));
}

function hourlyWeather(hourly: Series & { time: string[] }) {
  return hourly.time.slice(0, HOURLY_HOURS).map((time, index) => ({
    time,
    temperature: hourly.temperature_2m[index],
    precipitationChance: hourly.precipitation_probability[index],
    sky: describe(hourly.weather_code[index]),
  }));
}
