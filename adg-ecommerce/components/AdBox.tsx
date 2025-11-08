"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";

export default function AdBox({ imageUrl: propUrl, href }: { imageUrl?: string; href?: string }) {
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | undefined>(propUrl);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (propUrl || !user?.id) return;
      setLoading(true);
      try {
        const res = await fetch("/api/ad-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id })
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


