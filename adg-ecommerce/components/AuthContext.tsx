"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { track } from "@/lib/track";
import { fetchCityCountry } from "@/lib/geo";

export type AdgUser = {
  id: string; // stable user identifier
  name: string;
  email: string;
};

type AuthContextValue = {
  user: AdgUser | null;
  login: (email: string, password: string) => Promise<void>; // demo: accept anything
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "adg_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdgUser | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as AdgUser);
    } catch {}
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const login = async (email: string, password: string) => {
      if (!email || !password) throw new Error("Please enter email and password");
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error === "user_not_found" ? "Kullanıcı bulunamadı" : "Geçersiz e-posta veya şifre");
      }
      const j = await res.json();
      const next: AdgUser = j.user;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setUser(next);
      track("auth_login_success", { userId: next.id });
      try {
        const cc = await fetchCityCountry();
        if (cc) {
          await fetch("/api/users/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: next.id, user_location: cc }) });
        }
      } catch {}
    };

    const signup = async (name: string, email: string, password: string) => {
      if (!name || !email || !password) throw new Error("Please fill all fields");
      const next: AdgUser = { id: `user_${crypto.randomUUID()}`, name, email };
      const cc = await fetchCityCountry();
      const up = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: next.id, name: next.name, email: next.email, password, user_location: cc || "" })
        });
      if (!up.ok) {
        const j = await up.json().catch(() => ({}));
        if (j?.error === "email_exists") throw new Error("Bu e‑posta ile bir hesap zaten var");
        throw new Error("Kayıt başarısız");
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setUser(next);
      track("auth_signup_success", { userId: next.id });
    };

    const logout = () => {
      window.localStorage.removeItem(STORAGE_KEY);
      setUser(null);
      track("auth_logout");
    };

    return { user, login, signup, logout };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth sadece AuthProvider içinde kullanılabilir");
  return ctx;
}

// Helper to read userId for non-react modules
export function getStoredUserId(): string | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    const u = JSON.parse(raw) as AdgUser;
    return u?.id || null;
  } catch {
    return null;
  }
}

