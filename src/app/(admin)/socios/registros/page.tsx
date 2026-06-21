import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { listRegistrosPublicos } from "./actions";
import { RegistrosList } from "./RegistrosList";

export const metadata = { title: "Registros públicos · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("socios.write");
  const res = await listRegistrosPublicos();
  const items = res.ok ? res.data! : [];

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Registros públicos pendientes</h1>
          <span className="socios-page__sub">
            {items.length}{" "}
            {items.length === 1 ? "registro pendiente" : "registros pendientes"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/socios" className="btn btn--ghost">
            Volver al padrón
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="socios-empty">
          <p>No hay registros públicos pendientes.</p>
        </div>
      ) : (
        <RegistrosList items={items} />
      )}
    </div>
  );
}
