import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisAsambleas } from "@/lib/portal/data";
import { Icon } from "@/components/admin/Icon";
import type { EstadoAsistencia } from "@/generated/prisma/client";

export const metadata = { title: "Reuniones · Mercado Milagros" };
export const dynamic = "force-dynamic";

const ASIS_LABEL: Record<EstadoAsistencia, string> = {
  presente: "Presente",
  tardanza: "Tardanza",
  justificado: "Justificado",
  ausente: "Sin registrar",
};

export default async function AsambleasPage() {
  const { socio } = await requireSocio();
  const asambleas = await getMisAsambleas(socio.id);

  return (
    <>
      <Link href="/portal" className="pt-back">
        <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Reuniones</h1>
        <p>Tus asambleas y tu asistencia. En la reunión, escanea el QR para registrarte.</p>
      </div>

      {asambleas.length === 0 ? (
        <div className="pt-panel">
          <p className="pt-empty">No tienes reuniones registradas.</p>
        </div>
      ) : (
        <section className="pt-panel">
          <div className="pt-list">
            {asambleas.map((a) => (
              <div key={a.asambleaId} className="pt-row">
                <div className="pt-row__main">
                  <div className="pt-row__title">{a.titulo}</div>
                  <div className="pt-row__sub">
                    {new Date(a.fecha).toLocaleString("es-PE", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {a.lugar ? ` · ${a.lugar}` : ""}
                  </div>
                </div>
                <span className={`pt-badge pt-badge--${a.miEstado}`}>
                  {ASIS_LABEL[a.miEstado]}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
