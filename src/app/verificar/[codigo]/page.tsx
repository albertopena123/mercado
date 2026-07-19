import Link from "next/link";
import "../verificar.css";
import { prisma } from "@/lib/prisma";
import { fechaHora, fechaLargaTS } from "@/lib/fecha";
import { maskDocumento } from "@/lib/constancia/codigo";
import { ORG } from "@/lib/org";

export const metadata = { title: "Verificación de constancia" };
export const dynamic = "force-dynamic";

const TIPO_LABEL: Record<string, string> = {
  DNI: "DNI",
  CE: "Carné de Extranjería",
  PASAPORTE: "Pasaporte",
  RUC: "RUC",
};

type Estado = "valida" | "vencida" | "anulada" | "invalida";

const STATUS: Record<
  Estado,
  { title: string; sub: string; icon: "check" | "warn" | "x" }
> = {
  valida: {
    title: "Documento auténtico",
    sub: "La constancia es válida y fue emitida por la asociación.",
    icon: "check",
  },
  vencida: {
    title: "Constancia vencida",
    sub: "El documento es auténtico pero su vigencia ya expiró.",
    icon: "warn",
  },
  anulada: {
    title: "Constancia anulada",
    sub: "Este documento fue anulado y ya no es válido.",
    icon: "x",
  },
  invalida: {
    title: "Constancia no encontrada",
    sub: "Ningún documento coincide con ese código de verificación.",
    icon: "x",
  },
};

function StatusIcon({ icon }: { icon: "check" | "warn" | "x" }) {
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
  if (icon === "warn")
    return (
      <svg {...common}>
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
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

  const c = await prisma.constancia.findUnique({
    where: { codigo: code },
    include: { socio: { select: { estado: true } } },
  });

  let estado: Estado;
  if (!c) estado = "invalida";
  else if (c.anulada) estado = "anulada";
  else if (c.validoHasta && new Date() > c.validoHasta) estado = "vencida";
  else estado = "valida";

  const s = STATUS[estado];

  // ── Realidad ACTUAL (no solo el snapshot) para prevenir el uso indebido ──
  // La constancia de socio se presta a exhibirse como "prueba" para vender un
  // puesto. Por eso, además de autenticidad, mostramos el estado vigente del
  // socio y si hay una transferencia, y advertimos que NO autoriza ventas.
  const esConstanciaSocio = !!c && c.tipo !== "no_adeudo";
  const estadoSocioActual = c?.socio?.estado ?? null;
  const socioNoActivo =
    esConstanciaSocio &&
    !!estadoSocioActual &&
    estadoSocioActual !== "activo";

  let transferenciaEstado: string | null = null;
  if (c?.socioId) {
    const t = await prisma.transferencia.findFirst({
      where: {
        transferenteId: c.socioId,
        estado: { in: ["borrador", "completada"] },
      },
      orderBy: { createdAt: "desc" },
      select: { estado: true },
    });
    transferenciaEstado = t?.estado ?? null;
  }

  const ESTADO_SOCIO_LABEL: Record<string, string> = {
    activo: "ACTIVO",
    suspendido: "SUSPENDIDO",
    retirado: "RETIRADO",
    fallecido: "FALLECIDO",
  };

  return (
    <main className={`verif verif--${estado}`}>
      <div className="verif__card">
        <div className="verif__org">
          <p className="verif__org-name">{ORG.nombreLegal}</p>
          <p className="verif__org-sub">
            Verificación de autenticidad de constancia
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

        {esConstanciaSocio && (
          <div className="verif__notice">
            <b>
              Este documento NO autoriza la compra, venta ni transferencia de un
              puesto.
            </b>{" "}
            Acredita únicamente la condición de socio. Toda transferencia requiere
            el procedimiento formal ante el Consejo Directivo y la Asamblea
            General. Si le ofrecen vender un puesto mostrando esta constancia,
            confírmelo con la administración antes de entregar dinero.
          </div>
        )}

        {socioNoActivo && (
          <div className="verif__alert">
            Atención: a la fecha de esta consulta el socio figura como{" "}
            <b>{ESTADO_SOCIO_LABEL[estadoSocioActual!] ?? estadoSocioActual}</b>,
            distinto de lo que indicaba el documento al momento de emitirse.
          </div>
        )}

        {transferenciaEstado === "completada" && (
          <div className="verif__alert">
            Atención: el socio registra una{" "}
            <b>transferencia de puesto formalizada</b>. Verifique con la
            administración la titularidad vigente del puesto.
          </div>
        )}
        {transferenciaEstado === "borrador" && (
          <div className="verif__alert verif__alert--soft">
            Nota: existe un <b>expediente de transferencia en trámite</b> vinculado
            a este socio.
          </div>
        )}

        {c ? (
          <div className="verif__body">
            <div className="verif__row">
              <span>N.° de constancia</span>
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
                {TIPO_LABEL[c.tipoDocumento] ?? c.tipoDocumento}{" "}
                {maskDocumento(c.numeroDocumento)}
              </b>
            </div>
            <div className="verif__row">
              <span>Código de socio</span>
              <b>{c.socioCodigo}</b>
            </div>
            <div className="verif__row">
              <span>Tipo de constancia</span>
              <b>
                {c.tipo === "no_adeudo"
                  ? "Constancia de no adeudo"
                  : "Constancia de socio"}
              </b>
            </div>
            {c.motivo && (
              <div className="verif__row">
                <span>Se emitió para</span>
                <b>{c.motivo}</b>
              </div>
            )}
            {esConstanciaSocio && estadoSocioActual && (
              <div className="verif__row">
                <span>Estado del socio (actual)</span>
                <b>
                  {ESTADO_SOCIO_LABEL[estadoSocioActual] ?? estadoSocioActual}
                </b>
              </div>
            )}
            <div className="verif__row">
              <span>Fecha de emisión</span>
              <b>{fechaHora(c.emitidoEn)}</b>
            </div>
            <div className="verif__row">
              <span>Válida hasta</span>
              <b>{c.validoHasta ? fechaLargaTS(c.validoHasta) : "Indefinida"}</b>
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
            Verifique que copió el código completo. ¿Desea intentar con otro?{" "}
            <Link href="/verificar">Consultar otro código</Link>.
          </div>
        )}
      </div>

      <p className="verif__foot">
        Este servicio confirma únicamente la autenticidad del documento emitido
        por la asociación. Los datos mostrados corresponden al momento de la
        emisión.
      </p>
    </main>
  );
}
