"use client";

const GEO_KEY = "adg_geo_city_country"; // e.g., "Istanbul, Türkiye" or "San Francisco, United States"
const GEO_TS_KEY = "adg_geo_cached_at";
const GEO_IP_KEY = "adg_geo_ip";

export async function fetchCityCountry(force = false): Promise<string | null> {
  try {
    if (typeof window === "undefined") return null;
    const cached = window.localStorage.getItem(GEO_KEY);
    const ts = Number(window.localStorage.getItem(GEO_TS_KEY) || 0);
    const fresh = Date.now() - ts < 1000 * 60 * 60 * 12; // 12h cache

    // if cached and fresh, verify IP; if IP changed, force refresh
    if (!force && cached && fresh) {
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
        const ipJson: any = await ipRes.json().catch(() => null);
        const currentIp = ipJson?.ip as string | undefined;
        const storedIp = window.localStorage.getItem(GEO_IP_KEY) || undefined;
        if (currentIp && storedIp && currentIp === storedIp) {
          return cached;
        }
      } catch {}
    }

    // try ipapi.co first
    const endpoints = [
      "https://ipapi.co/json/",
      "https://ipwho.is/",
      "https://ipinfo.io/json?token=",
    ];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep, { cache: "no-store" });
        if (!r.ok) continue;
        const j: any = await r.json();
        let city: string | undefined;
        let country: string | undefined;
        let ip: string | undefined = j?.ip || j?.query;
        if (j && (j.city || j.country_name)) {
          city = j.city || j.town || j.region || j.timezone;
          country = j.country_name || j.country || j.countryCode || j.country_code;
        } else if (j && j.loc) {
          // ipinfo basic fallback; country may be present
          city = j.city;
          country = j.country;
        }
        if (city || country) {
          const val = `${(city || "").toString()}${city && country ? ", " : ""}${(country || "").toString()}`.trim();
          if (val) {
            window.localStorage.setItem(GEO_KEY, val);
            window.localStorage.setItem(GEO_TS_KEY, String(Date.now()));
            if (ip) window.localStorage.setItem(GEO_IP_KEY, ip);
            return val;
          }
        }
      } catch {}
    }
  } catch {}
  return null;
}

export function getCachedCityCountry(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(GEO_KEY);
  } catch {
    return null;
  }
}

