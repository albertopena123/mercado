import Link from "next/link";

export const metadata = { title: "Acceso denegado" };

export default function ForbiddenPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: "#5128b4" }}>403</div>
        <h1 style={{ fontSize: 22, margin: "8px 0 6px" }}>Acceso denegado</h1>
        <p style={{ color: "#5c5872", marginBottom: 20 }}>
          No tienes permiso para ver esta página con tu cuenta.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 10,
            background: "#5128b4",
            color: "#fff",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Ir a iniciar sesión
        </Link>
      </div>
    </main>
  );
}
