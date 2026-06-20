"use client";

import "./comprobante.css";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { formatSoles } from "@/lib/money";
import { ORG } from "@/lib/org";
import { fechaLargaTS, fechaHora } from "@/lib/fecha";

export type ComprobanteData = {
  folio: string;
  codigo: string;
  socioNombre: string;
  socioCodigo: string;
  numeroDocumento: string;
  monto: number;
  metodoPago: string | null;
  nroOperacion: string | null;
  detalle: string;
  emitidoEn: string; // ISO
  anulada: boolean;
};

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  yape: "Yape / Plin",
  "yape/plin": "Yape / Plin",
  deposito: "Depósito",
  otro: "Otro",
};

function metodoLabel(m: string | null): string {
  if (!m) return "—";
  return METODO_LABEL[m.toLowerCase()] ?? m.charAt(0).toUpperCase() + m.slice(1);
}

function docLabel(num: string): string {
  return /^SIN-DNI-/i.test(num) ? "(sin DNI registrado)" : num;
}

export function ComprobanteView({
  data,
  qrSvg,
  verifyUrl,
  backHref,
  backLabel = "Volver",
}: {
  data: ComprobanteData;
  qrSvg: string;
  verifyUrl: string;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const lineas = data.detalle.split("\n").filter((l) => l.trim());

  return (
    <div className="comprobante-page">
      <div className="comprobante-toolbar no-print">
        {backHref ? (
          <button
            className="btn btn--ghost"
            onClick={() => router.push(backHref)}
          >
            <Icon
              name="chevron-right"
              size={14}
              style={{ transform: "rotate(180deg)" }}
            />
            <span>{backLabel}</span>
          </button>
        ) : (
          <span />
        )}
        <button className="btn--cta" onClick={() => window.print()}>
          <Icon name="download" size={16} />
          <span>Imprimir / Guardar PDF</span>
        </button>
      </div>

      <article
        className={`comprobante${data.anulada ? " comprobante--anulado" : ""}`}
      >
        <div className="comprobante__banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos_sistema/logo_header.png"
            alt="Gran Feria Mayorista Internacional MDD"
          />
        </div>

        <div className="comprobante__membrete">
          <p className="comprobante__lema">“{ORG.lemaAnio}”</p>
          <p className="comprobante__partida">Partida N.° {ORG.partida}</p>
        </div>

        <h1 className="comprobante__title">Comprobante de Pago</h1>
        <p className="comprobante__folio">N.° {data.folio}</p>

        <div className="comprobante__body">
          <p>
            Recibí de <b>{data.socioNombre}</b>, identificado(a) con DNI{" "}
            <b>{docLabel(data.numeroDocumento)}</b>, socio(a) con código{" "}
            <b>{data.socioCodigo}</b>, la suma de:
          </p>

          <p className="comprobante__monto">{formatSoles(data.monto)}</p>

          <div className="comprobante__detalle">
            <p className="comprobante__detalle-title">Por concepto de</p>
            <ul>
              {lineas.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>

          <p className="comprobante__meta">
            <span>
              Método de pago: <b>{metodoLabel(data.metodoPago)}</b>
            </span>
            {data.nroOperacion && (
              <span>
                N.° de operación: <b>{data.nroOperacion}</b>
              </span>
            )}
          </p>

          <p className="comprobante__fecha">
            Madre de Dios, {fechaLargaTS(data.emitidoEn)}.
          </p>
        </div>

        <div className="comprobante__firmas">
          <div className="comprobante__firma">
            <div className="comprobante__firma-line" />
            <div className="comprobante__firma-label">Tesorería</div>
            <div className="comprobante__firma-sub">Junta Directiva</div>
          </div>
          <div className="comprobante__firma">
            <div className="comprobante__firma-line" />
            <div className="comprobante__firma-label">Administración</div>
            <div className="comprobante__firma-sub">{ORG.nombre}</div>
          </div>
        </div>

        <footer className="comprobante-verif">
          <div
            className="comprobante-verif__qr"
            aria-label="Código QR de verificación"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="comprobante-verif__info">
            <p className="comprobante-verif__title">
              Documento verificable en línea
            </p>
            <p className="comprobante-verif__row">
              <span>Código de verificación</span>
              <b>{data.codigo}</b>
            </p>
            <p className="comprobante-verif__row">
              <span>N.° de comprobante</span>
              <b>{data.folio}</b>
            </p>
            <p className="comprobante-verif__row">
              <span>Emitido</span>
              <b>{fechaHora(data.emitidoEn)}</b>
            </p>
            <p className="comprobante-verif__note">
              Escanee el QR o visite{" "}
              <span className="comprobante-verif__url">{verifyUrl}</span> e
              ingrese el código para comprobar la autenticidad de este
              comprobante.
            </p>
          </div>
        </footer>

        <div className="comprobante__domicilio">
          Domicilio: {ORG.domicilio} · Celular: {ORG.celular}
        </div>
      </article>
    </div>
  );
}
