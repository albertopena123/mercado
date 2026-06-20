import Link from "next/link";
import "@/app/verificar/verificar.css";
import { prisma } from "@/lib/prisma";
import { fechaHora } from "@/lib/fecha";
import { maskDocumento } from "@/lib/constancia/codigo";
import { toNumber, formatSoles } from "@/lib/money";
import { ORG } from "@/lib/org";

export const metadata = { title: "Verificación de comprobante" };
export const dynamic = "force-dynamic";

type Estado = "valida" | "anulada" | "invalida";

const STATUS: Record<
  Estado,
  { title: string; sub: string; icon: "check" | "x" }
> = {
  valida: {
    title: "Comprobante auténtico",
    sub: "El comprobante de pago es válido y fue emitido por la asociación.",
    icon: "check",
  },
  anulada: {
    title: "Comprobante anulado",
    sub: "Este comprobante fue anulado y ya no es válido.",
    icon: "x",
  },
  invalida: {
    title: "Comprobante no encontrado",
    sub: "Ningún comprobante coincide con ese código de verificación.",
    icon: "x",
  },
};

function StatusIcon({ icon }: { icon: "check" | "x" }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (icon === "check")
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const code = decodeURIComponent(codigo).trim().toUpperCase();

  const c = await prisma.comprobante.findUnique({ where: { codigo: code } });

  const estado: Estado = !c ? "invalida" : c.anulada ? "anulada" : "valida";
  const s = STATUS[estado];

  return (
    <main className={`verif verif--${estado === "valida" ? "valida" : estado === "anulada" ? "anulada" : "invalida"}`}>
      <div className="verif__card">
        <div className="verif__org">
          <p className="verif__org-name">{ORG.nombreLegal}</p>
          <p className="verif__org-sub">
            Verificación de autenticidad de comprobante de pago
          </p>
        </div>

        <div className="verif__status">
          <span className="verif__status-icon">
            <StatusIcon icon={s.icon} />
          </span>
          <span className="verif__status-text">
            <b className="verif__status-title">{s.title}</b>
            <small>{s.sub}</small>
          </span>
        </div>

        {c ? (
          <div className="verif__body">
            <div className="verif__row">
              <span>N.° de comprobante</span>
              <b>{c.folio}</b>
            </div>
            <div className="verif__row">
              <span>Código de verificación</span>
              <b>{c.codigo}</b>
            </div>
            <div className="verif__row">
              <span>Socio</span>
              <b>{c.socioNombre}</b>
            </div>
            <div className="verif__row">
              <span>Documento</span>
              <b>
                {/^SIN-DNI-/i.test(c.numeroDocumento)
                  ? "—"
                  : maskDocumento(c.numeroDocumento)}
              </b>
            </div>
            <div className="verif__row">
              <span>Monto pagado</span>
              <b>{formatSoles(toNumber(c.monto))}</b>
            </div>
            <div className="verif__row">
              <span>Método de pago</span>
              <b>{c.metodoPago ?? "—"}</b>
            </div>
            <div className="verif__row">
              <span>Fecha de emisión</span>
              <b>{fechaHora(c.emitidoEn)}</b>
            </div>
          </div>
        ) : (
          <div className="verif__body">
            <div className="verif__row">
              <span>Código consultado</span>
              <b>{code}</b>
            </div>
          </div>
        )}

        {!c && (
          <div className="verif__intro">
            Verifique que copió el código completo del comprobante.{" "}
            <Link href="/">Volver al inicio</Link>.
          </div>
        )}
      </div>

      <p className="verif__foot">
        Este servicio confirma únicamente la autenticidad del comprobante emitido
        por la asociación. Los datos mostrados corresponden al momento del pago.
      </p>
    </main>
  );
}
