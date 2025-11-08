"use client";
import { getCachedCityCountry, fetchCityCountry } from "@/lib/geo";
import { getStoredUserId } from "@/components/AuthContext";
import { track } from "@/lib/track";

const SEGMENT_KEY = "adg_segment";
const SEGMENT_TS_KEY = "adg_segment_ts";
const SEGMENT_TTL_MS = 1000 * 60 * 60 * 24; // 24h

function parseCountry(cityCountry: string | null): string {
  if (!cityCountry) return "";
  const parts = cityCountry.split(",").map((s) => (s || "").trim());
  return (parts[parts.length - 1] || "").toLowerCase();
}

function computeSegment(cityCountry: string | null): string {
  const country = parseCountry(cityCountry);
  if (!country) return "other";
  // Very simple mapping: US → us, common EU countries → eu, else other
  const isUS = /united states|usa|us\b/.test(country);
  if (isUS) return "us";
  const eu = [
    "germany","france","spain","italy","netherlands","poland","belgium","sweden","austria","ireland",
    "portugal","czech","czechia","romania","hungary","greece","finland","denmark","bulgaria","croatia",
    "slovakia","slovenia","estonia","latvia","lithuania","luxembourg","malta","cyprus"
  ];
  if (eu.some((c) => country.includes(c))) return "eu";
  return "other";
}

export function getCurrentSegment(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const ts = Number(window.localStorage.getItem(SEGMENT_TS_KEY) || 0);
    const val = window.localStorage.getItem(SEGMENT_KEY);
    if (!val) return null;
    if (Date.now() - ts > SEGMENT_TTL_MS) return null;
    return val;
  } catch {
    return null;
  }
}

export async function assignAnonymousSegmentFromLocation(force = false): Promise<string | null> {
  try {
    if (typeof window === "undefined") return null;
    // Skip if logged in (segmenting anonymous users only)
    const userId = getStoredUserId();
    if (userId) return null;

    if (!force) {
      const existing = getCurrentSegment();
      if (existing) return existing;
    }

    let cc = getCachedCityCountry();
    if (!cc) {
      cc = await fetchCityCountry(true);
    }
    const segment = computeSegment(cc);
    window.localStorage.setItem(SEGMENT_KEY, segment);
    window.localStorage.setItem(SEGMENT_TS_KEY, String(Date.now()));
    track("segment_assigned", { segment, cityCountry: cc || "" });
    return segment;
  } catch {
    return null;
  }
}


