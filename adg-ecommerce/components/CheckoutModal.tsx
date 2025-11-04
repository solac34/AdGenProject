"use client";

import { useState } from "react";
import { useToast } from "./ToastProvider";
import { track, getSessionId } from "@/lib/track";
import { useCart } from "./CartContext";
import { getStoredUserId } from "./AuthContext";
import { fetchCityCountry } from "@/lib/geo";

export default function CheckoutModal({
  open,
  onClose,
  amountCents
}: {
  open: boolean;
  onClose: () => void;
  amountCents: number;
}) {
  const { show } = useToast();
  const { items, clear } = useCart();
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = card.replace(/\D/g, "");
    const cvvDigits = cvv.replace(/\D/g, "");
    const expOk = /^\d{2}\/\d{2}$/.test(exp);
    if (!name || digits.length !== 16 || !expOk || cvvDigits.length !== 3) {
      setError("Kart bilgileri geçersiz. Lütfen kontrol edin.");
      track("checkout_validation_failed");
      return;
    }
    // Build products payload { product_id: { quantity } }
    const productsPayload: Record<string, { quantity: number; gift?: boolean }> = {};
    for (const it of items) productsPayload[it.productId] = { quantity: it.quantity, gift: !!it.giftWrap };

    // Send order to backend (BigQuery)
    try {
      const cc = await fetchCityCountry();
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: getSessionId(),
          user_id: getStoredUserId() || "anonymous",
          products_payload: productsPayload,
          paid_amount: amountCents,
          order_date: new Date().toISOString(),
          session_location: cc || ""
        })
      });
      
      const result = await response.json();
      // eslint-disable-next-line no-console
      console.log("[order API response]", result);
      
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error("[order API failed]", result);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[order API error]", err);
    }

    show("Ödeme onaylandı ✔");
    track("checkout_success", { amountCents, products: productsPayload });
    clear();
    onClose();
  };

  const formatPrice = (cents: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Ödeme</h2>
        <p style={{ color: "#6b7280" }}>Bu bir demo ödemesidir. Rastgele bilgiler kullanılabilir.</p>
        <form onSubmit={onPay} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input placeholder="Kart Sahibinin Adı" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} />
          <input placeholder="Kart Numarası (16 hane)" value={card} onChange={(e) => setCard(e.target.value)} style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} />
          <div style={{ display: "flex", gap: 12 }}>
            <input placeholder="SKT (MM/YY)" value={exp} onChange={(e) => setExp(e.target.value)} style={{ flex: 1, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} />
            <input placeholder="CVV (3)" value={cvv} onChange={(e) => setCvv(e.target.value)} style={{ width: 120, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} />
          </div>
          <div className="row" style={{ marginTop: 4 }}>
            <div>Ödenecek Tutar</div>
            <strong>{formatPrice(amountCents)}</strong>
          </div>
          {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="button" onClick={onClose}>İptal</button>
            <button type="submit" className="button primary">Ödemeyi Tamamla</button>
          </div>
        </form>
      </div>
    </div>
  );
}

