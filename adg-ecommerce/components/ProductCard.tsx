"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import { useCart } from "./CartContext";
import { track } from "@/lib/track";
import { useToast } from "./ToastProvider";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { show } = useToast();

  const onAdd = () => {
    add(product, 1);
    show("Added to cart");
  };

  const onShare = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/product/${product.id}` : "";
    try {
      await navigator.clipboard.writeText(url);
      track("product_share", { productId: product.id });
      // eslint-disable-next-line no-alert
      alert("Link copied to clipboard");
    } catch {
      track("product_share_failed", { productId: product.id });
    }
  };

  return (
    <div className="product-card" data-testid="product-card">
      <Link
        href={`/product/${product.id}`}
        onClick={() => track("product_click", { product_id: product.id })}
      >
        <div className="product-image" aria-hidden style={{ backgroundImage: product.image ? `url(${product.image})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
      </Link>
      <div className="product-title">{product.title}</div>
      <div className="row">
        <div className="product-price">{formatPrice(product.priceCents)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button" onClick={onShare}>Share</button>
          <button className="button primary" onClick={onAdd}>Add to Cart</button>
        </div>
      </div>
    </div>
  );
}

