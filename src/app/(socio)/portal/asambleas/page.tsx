import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisAsambleas } from "@/lib/portal/data";
import { Icon } from "@/components/admin/Icon";
import { fechaHora } from "@/lib/fecha";
import type { EstadoAsistencia } from "@/generated/prisma/client";

export const metadata = { title: "Reuniones · Feria Mayorista Internacional Milagros" };
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
            {asambleas.map((a) => {
              // Instante → fecha+hora de Perú, determinista (sin desfase de TZ
              // del servidor ni discrepancia de hidratación).
              const fecha = fechaHora(a.fecha);
              const inner = (
                <>
                  <div className="pt-row__main">
                    <div className="pt-row__title">{a.titulo}</div>
                    <div className="pt-row__sub">
                      {fecha}
                      {a.lugar ? ` · ${a.lugar}` : ""}
                    </div>
                  </div>
                  <span className={`pt-badge pt-badge--${a.miEstado}`}>
                    {ASIS_LABEL[a.miEstado]}
                  </span>
                </>
              );
              return a.codigo ? (
                <Link
                  key={a.asambleaId}
                  href={`/portal/asambleas/${a.codigo}`}
                  className="pt-row"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {inner}
                </Link>
              ) : (
                <div key={a.asambleaId} className="pt-row">
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
