export type Category = {
  id: string;
  slug: string;
  name: string;
};

export type Product = {
  id: string;
  categoryId: string;
  title: string;
  priceCents: number;
  image?: string;
  description?: string;
};

export type CartItem = {
  productId: string;
  quantity: number;
  giftWrap?: boolean;
};

export type AnalyticsEvent = {
  event: string;
  ts: string; // 'YYYY-MM-DDTHH:mm:ss' (yerel zaman, ms ve Z olmadan)
  sessionId: string;
  userId?: string | null;
  eventLocation?: string | null; // ISO country guess (e.g., "us")
  pathname?: string;
  payload?: Record<string, unknown>;
};

