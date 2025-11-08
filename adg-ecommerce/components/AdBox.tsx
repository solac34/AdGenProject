import React from "react";

export default function AdBox({ imageUrl, href }: { imageUrl?: string; href?: string }) {
  const content = imageUrl ? (
    <img src={imageUrl} alt="" />
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


