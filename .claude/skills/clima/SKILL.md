---
name: clima
description: Consulta el clima actual y el pronóstico de Atlanta, Georgia (EE. UU.) usando wttr.in / Open-Meteo, sin API key. Usar cuando el usuario pida el clima, el tiempo, temperatura, lluvia o pronóstico, o invoque /clima.
argument-hint: "[hoy|mañana|3dias]"
---

# Clima — Atlanta, Georgia

Ubicación fija: **Atlanta, Georgia, EE. UU.** (lat `33.749`, lon `-84.388`). Ignorar cualquier otra ciudad o la ubicación por IP. Argumentos: `$ARGUMENTS` (opcional: rango).

## Pasos

1. **Consulta** (Bash, `curl -s -m 10`):
   - Actual: `curl -s -m 10 "https://wttr.in/Atlanta,Georgia?format=%l:+%c+%t+(sensacion+%f),+humedad+%h,+viento+%w,+lluvia+%p&lang=es&m"`
   - Pronóstico 3 días: `curl -s -m 10 "https://wttr.in/Atlanta,Georgia?format=j1&lang=es"` y extraer de `weather[]`: `date`, `mintempC`, `maxtempC`, `hourly[4].lang_es[0].value` (descripción a mediodía), `hourly[].chanceofrain` (máx).
2. **Respaldo** si wttr.in falla o tarda:
   - `curl -s -m 10 "https://api.open-meteo.com/v1/forecast?latitude=33.749&longitude=-84.388&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=America/New_York&forecast_days=3"`
   - Traducir `weather_code` (WMO): 0 despejado, 1-3 parcialmente nublado, 45/48 niebla, 51-57 llovizna, 61-67 lluvia, 71-77 nieve, 80-82 chubascos, 95-99 tormenta.
3. **Respuesta**: breve, en español, unidades métricas (°C, km/h). Formato:

```
📍 Atlanta, Georgia
Ahora: <icono> <temp>°C (sensación <f>°C) · <descripción>
Humedad <h>% · Viento <w> km/h
Pronóstico:
- <día>: <min>–<max>°C, <descripción>, lluvia <p>%
```

Solo incluir el pronóstico si se pide (`mañana`, `3dias`). Si todas las fuentes fallan, decirlo y sugerir revisar la conexión.
