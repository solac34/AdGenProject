"use client";

import { ReactNode, useEffect } from "react";
import { usePageViewTracking } from "@/lib/track";
import { fetchCityCountry } from "@/lib/geo";

export default function TrackerProvider({ children }: { children: ReactNode }) {
  usePageViewTracking();
  useEffect(() => {
    // Force refresh geo (handles IP changes)
    void fetchCityCountry(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // placeholder to allow sendBeacon in some browsers
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return <>{children}</>;
}

