/**
 * useWeather — recupera meteo in tempo reale + previsioni orarie via Open-Meteo (free, no API key).
 */
import { useState, useEffect, useRef } from 'react'

const WMO_IT = {
  0: 'Sereno', 1: 'Prevalentemente sereno', 2: 'Parzialmente nuvoloso', 3: 'Coperto',
  45: 'Nebbia', 48: 'Nebbia con brina',
  51: 'Pioggerella leggera', 53: 'Pioggerella', 55: 'Pioggerella intensa',
  61: 'Pioggia leggera', 63: 'Pioggia', 65: 'Pioggia intensa',
  71: 'Neve leggera', 73: 'Neve', 75: 'Neve intensa',
  80: 'Rovesci leggeri', 81: 'Rovesci', 82: 'Rovesci intensi',
  95: 'Temporale', 96: 'Temporale con grandine', 99: 'Temporale forte',
}

const WMO_EN = {
  0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm',
}

const WMO_ICON = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '❄️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

export function iconForCode(code) { return WMO_ICON[code] ?? '🌡️' }
export function labelForCode(code, lang) {
  const map = lang === 'en' ? WMO_EN : WMO_IT
  return map[code] ?? (lang === 'en' ? 'Unknown' : 'Sconosciuto')
}

async function fetchWeather(lat, lon, lang) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relative_humidity_2m` +
    `&hourly=temperature_2m,weathercode,precipitation_probability` +
    `&forecast_days=1&timezone=auto`

  const res = await fetch(url)
  if (!res.ok) throw new Error('Weather fetch failed')
  const data = await res.json()
  const c    = data.current
  const code = c.weathercode

  // Ora corrente per filtrare le ore future (mostra le prossime 5 ore)
  const nowHour = new Date().getHours()

  // Previsioni orarie: le 5 ore successive all'ora corrente
  const hourly = []
  if (data.hourly?.time) {
    for (let i = 0; i < data.hourly.time.length; i++) {
      const h = new Date(data.hourly.time[i]).getHours()
      if (h <= nowHour) continue              // salta l'ora corrente e precedenti
      hourly.push({
        hour: h,
        temp: Math.round(data.hourly.temperature_2m[i]),
        code: data.hourly.weathercode[i],
        icon: iconForCode(data.hourly.weathercode[i]),
        precip: data.hourly.precipitation_probability?.[i] ?? 0,
      })
      if (hourly.length >= 5) break           // massimo 5 ore in avanti
    }
  }

  return {
    temp:     Math.round(c.temperature_2m),
    feels:    Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    wind:     Math.round(c.windspeed_10m),
    code,
    icon:  iconForCode(code),
    label: labelForCode(code, lang),
    hourly,
    summary: lang === 'en'
      ? `${Math.round(c.temperature_2m)}°C, ${labelForCode(code, lang)}, feels like ${Math.round(c.apparent_temperature)}°C`
      : `${Math.round(c.temperature_2m)}°C, ${labelForCode(code, 'it')}, percepita ${Math.round(c.apparent_temperature)}°C`,
  }
}

/** Fallback: geolocalizzazione tramite IP */
async function fetchWeatherByIP(lang) {
  const geo = await fetch('http://ip-api.com/json/?fields=lat,lon,status')
  const g   = await geo.json()
  if (g.status !== 'success') throw new Error('IP geo failed')
  return fetchWeather(g.lat, g.lon, lang)
}

export default function useWeather(lang = 'it') {
  const [weather, setWeather] = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  const load = () => {
    setLoading(true)
    const tryGPS = () => new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('no geo'))
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve(fetchWeather(coords.latitude, coords.longitude, lang)),
        reject,
        { timeout: 6000 }
      )
    })

    tryGPS()
      .catch(() => fetchWeatherByIP(lang))
      .then(w => { setWeather(w); setError(null) })
      .catch(() => setError('unavailable'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 30 * 60 * 1000)
    return () => clearInterval(timerRef.current)
  }, [lang]) // eslint-disable-line

  return { weather, error, loading, refresh: load }
}
