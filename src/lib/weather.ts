export type DayWeather = {
  date: string;
  label: string;
  tempMax: number | null;
  tempMin: number | null;
  precipProbability: number | null;
  windSpeed: number | null;
  rainWarning: boolean;
  windWarning: boolean;
};

type GeoResult = { latitude: number; longitude: number; name: string };

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

export async function geocodePlace(name: string): Promise<GeoResult | null> {
  const query = name.trim();
  if (!query) return null;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=ja&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("場所を検索できませんでした。");
  const payload = (await response.json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const first = payload.results?.[0];
  if (!first) return null;
  return { latitude: first.latitude, longitude: first.longitude, name: first.name };
}

export async function fetchDailyWeather(latitude: number, longitude: number): Promise<DayWeather[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max" +
    "&timezone=Asia%2FTokyo&forecast_days=16&wind_speed_unit=ms";
  const response = await fetch(url);
  if (!response.ok) throw new Error("天気を取得できませんでした。");
  const payload = (await response.json()) as {
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
      wind_speed_10m_max?: number[];
    };
  };
  const daily = payload.daily;
  if (!daily?.time) return [];
  return daily.time.map((date, index) => {
    const code = daily.weather_code?.[index] ?? null;
    const precip = daily.precipitation_probability_max?.[index] ?? null;
    const wind = daily.wind_speed_10m_max?.[index] ?? null;
    const rainWarning = (precip != null && precip >= 40) || (code != null && RAIN_CODES.has(code));
    const windWarning = wind != null && wind >= 8;
    return {
      date,
      label: weatherLabel(code),
      tempMax: daily.temperature_2m_max?.[index] ?? null,
      tempMin: daily.temperature_2m_min?.[index] ?? null,
      precipProbability: precip,
      windSpeed: wind,
      rainWarning,
      windWarning,
    };
  });
}

function weatherLabel(code: number | null): string {
  if (code == null) return "不明";
  if (code === 0) return "快晴";
  if (code <= 2) return "晴れ";
  if (code === 3) return "くもり";
  if (code <= 48) return "霧";
  if (code <= 57) return "霧雨";
  if (code <= 67) return "雨";
  if (code <= 77) return "雪";
  if (code <= 82) return "にわか雨";
  if (code <= 86) return "にわか雪";
  return "雷雨";
}
