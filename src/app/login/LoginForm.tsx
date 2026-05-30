"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/admin/Icon";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/usuarios";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "No se pudo iniciar sesión.");
        setLoading(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
      setLoading(false);
    }
  };

  return (
    <form className="login__form" onSubmit={submit} noValidate>
      {error && (
        <div className="login__error" role="alert">
          <Icon name="info" size={16} />
          <span>{error}</span>
        </div>
      )}

      <label className="field">
        <span className="field__label">Correo institucional</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@unamad.edu.pe"
          autoFocus
        />
      </label>

      <label className="field">
        <span className="field__label">Contraseña</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </label>

      <button
        type="submit"
        className="login__submit"
        disabled={loading || !email || !password}
      >
        {loading ? "Verificando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
