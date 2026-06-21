import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { listSolicitudesPendientes } from "./actions";
import { SolicitudesList } from "./SolicitudesList";

export const metadata = { title: "Solicitudes de actualización · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("socios.write");
  const res = await listSolicitudesPendientes();
  const items = res.ok ? res.data! : [];

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Solicitudes de actualización de datos</h1>
          <span className="socios-page__sub">
            {items.length} {items.length === 1 ? "solicitud pendiente" : "solicitudes pendientes"}
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
          <p>No hay solicitudes pendientes.</p>
        </div>
      ) : (
        <SolicitudesList items={items} />
      )}
    </div>
  );
}
