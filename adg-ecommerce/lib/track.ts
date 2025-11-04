"use client";

import { AnalyticsEvent } from "./types";
import { getStoredUserId } from "@/components/AuthContext";
import { useEffect } from "react";
import { getCachedCityCountry } from "@/lib/geo";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "adg_session_id";
const QUEUE_KEY = "adg_event_queue";

function formatLocalIsoSeconds(date = new Date()): string {
  // Convert to local time without timezone suffix and milliseconds
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const sid = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, sid);
  return sid;
}

function getSessionLocation(): string {
  try {
    const cc = getCachedCityCountry();
    if (cc) return cc;
    const lang = navigator?.language || "en-US";
    const part = lang.split("-")[1] || "US";
    return String(part).toLowerCase();
  } catch {
    return "unknown";
  }
}

function enqueueLocal(e: AnalyticsEvent) {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const arr = raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
    arr.push(e);
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(arr));
  } catch {}
}

async function flushQueue() {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as AnalyticsEvent[];
    if (!Array.isArray(arr) || arr.length === 0) return;
    await sendBatch(arr);
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {}
}

async function sendBatch(events: AnalyticsEvent[]) {
  try {
    if (navigator?.sendBeacon) {
      const blob = new Blob([JSON.stringify({ events })], { type: "application/json" });
      navigator.sendBeacon("/api/events", blob);
      return;
    }
  } catch {}
  await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events })
  });
}

export function track(event: string, payload?: Record<string, unknown>) {
  try {
    const sessionId = getOrCreateSessionId();
    const pathname = typeof window !== "undefined" ? window.location.pathname : undefined;
    const userId = getStoredUserId();
    const eventLocation = getSessionLocation();
    const e: AnalyticsEvent = { event, ts: formatLocalIsoSeconds(), sessionId, userId: userId ?? "anonymous", eventLocation, pathname, payload };
    // Console for quick local debugging
    // eslint-disable-next-line no-console
    console.log("[track]", e);
    if (typeof window === "undefined") return;
    enqueueLocal(e);
    // Best effort flush without spamming network
    void flushQueue();
  } catch {}
}

export function getSessionId(): string {
  return getOrCreateSessionId();
}

export function usePageViewTracking() {
  const pathname = usePathname();
  useEffect(() => {
    track("page_view", { pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}

