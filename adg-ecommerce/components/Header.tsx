"use client";

import Link from "next/link";
import { categories } from "@/lib/data";
import Navbar from "./Navbar";
import { track } from "@/lib/track";
import { useAuth } from "./AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  return (
    <header>
      <div className="container header-top">
        <div className="logo">
          <Link href="/" onClick={() => track("logo_click")}>ADG</Link>
        </div>
        <div className="auth-links">
          {user ? (
            <>
              <span>Hello, {user.name}</span>
              <button className="button" onClick={logout}>Sign out</button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => track("auth_login_click")}>Sign in</Link>
              <span>/</span>
              <Link href="/signup" onClick={() => track("auth_signup_click")}>Sign up</Link>
            </>
          )}
          <span style={{ color: "#e5e7eb" }}>|</span>
          <Link href="/cart" onClick={() => track("cart_open_click")}>Cart</Link>
        </div>
      </div>
      <div className="container">
        <Navbar categories={categories} />
      </div>
    </header>
  );
}

