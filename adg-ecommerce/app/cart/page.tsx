"use client";

import { useCart } from "@/components/CartContext";
import { getProductById } from "@/lib/data";
import { track } from "@/lib/track";
import CheckoutModal from "@/components/CheckoutModal";
import { useState } from "react";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function CartPage() {
  const { items, remove, clear, totalCents, toggleGift } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <section className="hero">
        <h1>Cart</h1>
        <p>{items.length} items</p>
      </section>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((i) => {
          const p = getProductById(i.productId);
          if (!p) return null;
          return (
            <div key={i.productId} className="row" style={{ borderBottom: "1px solid #eee", padding: "12px 0", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="product-image" style={{ width: 96, aspectRatio: "1/1" }} />
                <div>
                  <div className="product-title">{p.title}</div>
                  <div className="product-price">{formatPrice(p.priceCents)} x {i.quantity}</div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={!!i.giftWrap}
                      onChange={(e) => toggleGift(i.productId, e.target.checked)}
                    />
                    Gift wrap
                  </label>
                </div>
              </div>
              <button
                className="button"
                onClick={() => remove(i.productId)}
              >
                Remove
              </button>
            </div>
          );
        })}
        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>Toplam: {formatPrice(totalCents)}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <a className="button" href="/" onClick={() => track("continue_shopping_click")}>Continue Shopping</a>
            <button
              className="button primary"
              onClick={() => {
                track("checkout_click", { totalCents });
                setOpen(true);
              }}
            >
              Checkout
            </button>
            <button className="button" onClick={clear}>Clear Cart</button>
          </div>
        </div>
      </div>
      <CheckoutModal open={open} onClose={() => setOpen(false)} amountCents={totalCents} />
    </div>
  );
}

