import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/admin/Icon";
import { fechaHora } from "@/lib/fecha";
import { CheckinButton } from "./CheckinButton";

export const metadata = { title: "Asistencia · Mercado Milagros" };
export const dynamic = "force-dynamic";

const ASIS_LABEL: Record<string, string> = {
  presente: "Presente",
  tardanza: "Tardanza",
  justificado: "Justificado",
  ausente: "Sin registrar",
};

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const { socio } = await requireSocio();

  const asamblea = await prisma.asamblea.findUnique({
    where: { codigoVerificacion: codigo },
    select: { id: true, titulo: true, fecha: true, lugar: true, estado: true },
  });

  const back = (
    <Link href="/portal/asambleas" className="pt-back">
      <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
      Volver a reuniones
    </Link>
  );

  if (!asamblea) {
    return (
      <>
        {back}
        <div className="pt-panel">
          <p className="pt-empty">Esta reunión no existe o el código no es válido.</p>
        </div>
      </>
    );
  }

  const asis = await prisma.asistencia.findUnique({
    where: {
      asambleaId_socioId: { asambleaId: asamblea.id, socioId: socio.id },
    },
    select: { estado: true },
  });

  const yaRegistrado =
    asis?.estado === "presente" || asis?.estado === "tardanza";

  return (
    <>
      {back}
      <div className="pt-hello">
        <h1>{asamblea.titulo}</h1>
        <p>
          {fechaHora(asamblea.fecha)}
          {asamblea.lugar ? ` · ${asamblea.lugar}` : ""}
        </p>
      </div>

      <div className="pt-panel" style={{ textAlign: "center" }}>
        {!asis ? (
          <p className="pt-empty">
            No figuras en la lista de esta reunión. Acércate a la mesa de
            registro.
          </p>
        ) : yaRegistrado ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 6 }}>✅</div>
            <h2 style={{ marginBottom: 6 }}>Asistencia registrada</h2>
            <p style={{ color: "var(--text-muted)" }}>
              Quedaste como{" "}
              <span className={`pt-badge pt-badge--${asis.estado}`}>
                {ASIS_LABEL[asis.estado]}
              </span>
            </p>
          </>
        ) : (
          <>
            <p style={{ marginBottom: 14, color: "var(--text-muted)" }}>
              Confirma tu asistencia a esta reunión.
            </p>
            <CheckinButton codigo={codigo} />
          </>
        )}
      </div>
    </>
  );
}
