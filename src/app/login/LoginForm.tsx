"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/admin/Icon";

function EyeIcon({ off }: { off: boolean }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  return off ? (
    <svg {...common}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.4 5.2A9.2 9.2 0 0 1 12 5c5 0 9 4.5 9 7 0 1-.7 2.3-1.9 3.5M6.1 6.1C3.8 7.6 3 9.8 3 12c0 2.5 4 7 9 7 1.3 0 2.5-.3 3.6-.8" />
    </svg>
  ) : (
    <svg {...common}>
      <path d="M2.5 12C4 8.5 7.7 5.5 12 5.5S20 8.5 21.5 12C20 15.5 16.3 18.5 12 18.5S4 15.5 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/usuarios";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
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
      <div
        className={`login__error ${error ? "is-visible" : ""}`}
        role="alert"
        aria-live="polite"
      >
        {error && (
          <>
            <Icon name="info" size={16} />
            <span>{error}</span>
          </>
        )}
      </div>

      <div className="login__field">
        <label className="login__label" htmlFor="login-id">
          Correo o número de documento
        </label>
        <div className="login__input">
          <Icon name="user" size={18} className="login__input-icon" />
          <input
            id="login-id"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="correo@ejemplo.com o 12345678"
            autoFocus
          />
        </div>
      </div>

      <div className="login__field">
        <label className="login__label" htmlFor="login-password">
          Contraseña
        </label>
        <div className="login__input">
          <Icon name="lock" size={18} className="login__input-icon" />
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            placeholder="••••••••"
          />
          <button
            type="button"
            className="login__toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            tabIndex={-1}
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>
        <span className={`login__caps ${capsLock ? "is-visible" : ""}`}>
          <Icon name="info" size={13} /> Bloq Mayús activado
        </span>
      </div>

      <button
        type="submit"
        className="login__submit"
        disabled={loading || !identifier || !password}
      >
        {loading ? (
          <>
            <span className="login__spinner" aria-hidden="true" />
            Verificando…
          </>
        ) : (
          "Iniciar sesión"
        )}
      </button>
    </form>
  );
}
