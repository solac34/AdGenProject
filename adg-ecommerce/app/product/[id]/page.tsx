"use client";

import { useParams } from "next/navigation";
import { getProductById } from "@/lib/data";
import { useCart } from "@/components/CartContext";
import { track } from "@/lib/track";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const product = getProductById(params.id);
  const { add } = useCart();

  if (!product) return <div>Ürün bulunamadı.</div>;

  return (
    <div>
      <section className="hero">
        <h1>{product.title}</h1>
        <p>{product.description}</p>
      </section>
      <div className="grid" style={{ marginTop: 16 }}>
        <div style={{ gridColumn: "span 6" }}>
          <div className="product-image" style={{ backgroundImage: product.image ? `url(${product.image})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
        </div>
        <div style={{ gridColumn: "span 6", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{formatPrice(product.priceCents)}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="button primary"
              onClick={() => {
                add(product, 1);
                track("product_add_from_detail", { product_id: product.id });
              }}
            >
              Sepete Ekle
            </button>
            <button
              className="button"
              onClick={async () => {
                const url = `${window.location.origin}/product/${product.id}`;
                try {
                  await navigator.clipboard.writeText(url);
                  track("product_share", { product_id: product.id });
                  // eslint-disable-next-line no-alert
                  alert("Bağlantı panoya kopyalandı");
                } catch {
                  track("product_share_failed", { product_id: product.id });
                }
              }}
            >
              Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

