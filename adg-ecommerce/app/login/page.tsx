"use client";

import { useAuth } from "@/components/AuthContext";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 420, margin: "64px auto" }}>
      <h1 style={{ marginBottom: 8 }}>Giriş Yap</h1>
      <p style={{ color: "#6b7280", marginTop: 0 }}>Demo: Herhangi bir email/şifre kabul edilir.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await login(email, password);
            router.push("/");
          } catch (err: any) {
            setError(err?.message || "Giriş yapılamadı");
          }
        }}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} />
        <input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} />
        {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
        <button className="button primary" type="submit">Giriş</button>
      </form>
    </div>
  );
}

