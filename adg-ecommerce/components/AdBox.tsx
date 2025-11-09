"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { fetchCityCountry } from "@/lib/geo";

export default function AdBox({ imageUrl: propUrl, href }: { imageUrl?: string; href?: string }) {
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | undefined>(propUrl);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (propUrl) return;
      setLoading(true);
      try {
        // Prepare payload:
        // - If user logged in → send user_id
        // - Else (anonymous) → send city/country derived on client
        let payload: Record<string, unknown> = {};
        if (user?.id) {
          payload.user_id = user.id;
        } else {
          const cc = await fetchCityCountry();
          if (cc) {
            const [cityRaw, countryRaw] = cc.split(",").map((s) => (s || "").trim());
            if (cityRaw) payload.city = cityRaw;
            if (countryRaw) payload.country = countryRaw;
          }
        }
        const res = await fetch("/api/ad-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const j = await res.json();
          if (!cancelled) setImageUrl(j?.imageUrl as string | undefined);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [propUrl, user?.id]);

  const content = imageUrl ? (
    <img src={imageUrl} alt="" />
  ) : loading ? (
    <div className="ad-fallback">Loading…</div>
  ) : (
    <div className="ad-fallback">Ad</div>
  );
  const wrapper = (
    <div className="ad-box">
      {content}
    </div>
  );
  return href ? (
    <a href={href} aria-label="Advertisement">
      {wrapper}
    </a>
  ) : (
    wrapper
  );
}


