"use client";

import { useState, useEffect } from "react";
import type { WeatherResult } from "@/lib/weather";

export default function WeatherPage() {
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/weather");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Unable to load weather data.");
        } else {
          setWeather(data);
        }
      } catch {
        setError("Unable to load weather data.");
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading weather...</div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="bg-white border-[1.5px] border-rule rounded-[10px] p-6 text-center">
        <div className="font-serif text-xl text-green-dark mb-2">Weather unavailable</div>
        <div className="text-sm text-mist max-w-md mx-auto">{error}</div>
      </div>
    );
  }

  const today = new Date();
  const updated = new Date(weather.updatedAt);

  return (
    <>
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-green-forest mb-1">
            Weather Intelligence
          </div>
          <div className="font-serif text-2xl text-green-dark">
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <div className="text-[13px] text-mist mt-1">
            {weather.location.city}, {weather.location.state} ·{" "}
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-bright rounded-full animate-pulse-dot inline-block" />
              Updated{" "}
              {updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      {/* Current + Agro Metrics */}
      <div className="grid grid-cols-2 gap-4">
        {/* Current Conditions */}
        <div className="bg-green-dark rounded-[10px] p-5 text-white relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/[0.04]" />
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-2">
            Current Conditions
          </div>
          <div className="font-serif text-[52px] leading-none mb-1">
            {weather.current.tempF}
            <sup className="text-[22px]">°F</sup>
          </div>
          <div className="text-[15px] text-green-bright mb-3.5">{weather.current.description}</div>
          <div className="flex gap-3.5 flex-wrap">
            {weather.current.humidity != null && (
              <span className="text-[11px] text-white/60">
                💧 <strong className="text-white">{weather.current.humidity}%</strong> RH
              </span>
            )}
            {weather.current.windSpeed != null && (
              <span className="text-[11px] text-white/60">
                💨 <strong className="text-white">{weather.current.windSpeed} mph</strong>{" "}
                {weather.current.windDirection}
              </span>
            )}
            <span className="text-[11px] text-white/60">
              🌡 High <strong className="text-white">{weather.current.highF}°F</strong>
            </span>
            <span className="text-[11px] text-white/60">
              Low <strong className="text-white">{weather.current.lowF}°F</strong>
            </span>
          </div>
        </div>

        {/* Agronomic Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <AgroCard
            label="Today's ET"
            value={weather.agronomics.et0In.toFixed(2)}
            unit=" in"
            desc="Estimated (Hargreaves) — reference evapotranspiration"
            fill={Math.min(100, (weather.agronomics.et0In / 0.35) * 100)}
            color="var(--amber)"
          />
          <AgroCard
            label="Growing Degree Days"
            value={weather.agronomics.gddSeasonToDate.toLocaleString()}
            unit=" GDD"
            desc={`Base 50°F · +${weather.agronomics.gddToday.toFixed(1)} today · tracked since app setup`}
            fill={Math.min(100, (weather.agronomics.gddSeasonToDate / 2500) * 100)}
            color="var(--gm)"
          />
          <AgroCard
            label="Leaf Wetness (est.)"
            value={String(weather.agronomics.leafWetnessHours)}
            unit=" hrs"
            desc="Estimated from dewpoint spread · Dollar Spot threshold: 8+ hrs"
            fill={Math.min(100, (weather.agronomics.leafWetnessHours / 16) * 100)}
            color="var(--red)"
          />
          <AgroCard
            label="7-Day Rainfall"
            value={weather.agronomics.weekRainfallIn.toFixed(2)}
            unit=" in"
            desc="Forecasted total, next 7 days"
            fill={Math.min(100, (weather.agronomics.weekRainfallIn / 2) * 100)}
            color="var(--water)"
          />
        </div>
      </div>

      {/* 7-Day Forecast */}
      <div>
        <div className="font-serif text-[17px] text-green-dark mb-3">7-Day Forecast</div>
        <div className="grid grid-cols-7 gap-2">
          {weather.forecast.map((day, i) => (
            <ForecastDay
              key={i}
              dow={day.dow}
              icon={day.icon}
              hi={`${day.hiF}°`}
              lo={`${day.loF}°`}
              rain={day.precipChance != null ? `${day.precipChance}%` : "—"}
              today={day.isToday}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function AgroCard({
  label,
  value,
  unit,
  desc,
  fill,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  desc: string;
  fill: number;
  color: string;
}) {
  return (
    <div className="bg-white border-[1.5px] border-rule rounded-[7px] p-3.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-mist mb-1.5">
        {label}
      </div>
      <div className="font-mono text-2xl font-semibold text-green-mid leading-none">
        {value}
        <span className="text-xs font-normal text-mist">{unit}</span>
      </div>
      <div className="text-[11px] text-mist mt-1.5 leading-snug">{desc}</div>
      <div className="h-1 bg-rule rounded mt-2 overflow-hidden">
        <div
          className="h-full rounded transition-all duration-700"
          style={{ width: `${fill}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ForecastDay({
  dow,
  icon,
  hi,
  lo,
  rain,
  today,
}: {
  dow: string;
  icon: string;
  hi: string;
  lo: string;
  rain: string;
  today?: boolean;
}) {
  return (
    <div
      className={`border-[1.5px] rounded-[7px] px-1.5 py-2.5 text-center cursor-pointer transition-all ${
        today
          ? "bg-green-dark border-green-dark"
          : "bg-white border-rule hover:border-green-mid hover:-translate-y-px"
      }`}
    >
      <div
        className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${
          today ? "text-white/60" : "text-mist"
        }`}
      >
        {dow}
      </div>
      <div className="text-xl mb-1.5">{icon}</div>
      <div className={`text-sm font-bold ${today ? "text-white" : "text-ink"}`}>{hi}</div>
      <div className={`text-[11px] ${today ? "text-white/50" : "text-mist"}`}>{lo}</div>
      <div
        className={`text-[10px] font-mono font-semibold mt-1 ${
          today ? "text-blue/60" : "text-blue"
        }`}
      >
        {rain}
      </div>
    </div>
  );
}
