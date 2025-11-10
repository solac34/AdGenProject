"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem, Product } from "@/lib/types";
import { getProductById } from "@/lib/data";
import { track } from "@/lib/track";

type CartContextValue = {
  items: CartItem[];
  add: (product: Product, quantity?: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  toggleGift: (productId: string, gift: boolean) => void;
  totalCents: number;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "adg_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const add = (product: Product, quantity = 1) => {
      setItems((prev) => {
        const next = [...prev];
        const idx = next.findIndex((i) => i.productId === product.id);
        if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        else next.push({ productId: product.id, quantity, giftWrap: false });
        track("cart_add", { product_id: product.id, quantity });
        return next;
      });
    };
    const remove = (productId: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.productId !== productId);
        track("cart_remove", { product_id: productId });
        return next;
      });
    };
    const clear = () => {
      setItems([]);
      track("cart_clear");
    };
    const toggleGift = (productId: string, gift: boolean) => {
      setItems((prev) => {
        const next = prev.map((i) => (i.productId === productId ? { ...i, giftWrap: gift } : i));
        track("cart_gift_toggle", { product_id: productId, gift });
        return next;
      });
    };
    const totalCents = items.reduce((sum, i) => {
      const p = getProductById(i.productId);
      return sum + (p ? p.priceCents * i.quantity : 0);
    }, 0);
    return { items, add, remove, clear, toggleGift, totalCents };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

