"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={logout}
      style={{
        display: "inline-block",
        padding: "10px 18px",
        borderRadius: 10,
        background: "#5128b4",
        color: "#fff",
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
      }}
    >
      Cerrar sesión
    </button>
  );
}
