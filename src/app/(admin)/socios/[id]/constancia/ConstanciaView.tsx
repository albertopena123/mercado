"use client";

import "./constancia.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import { fechaLarga, fechaLargaTS, fechaHora, hoyLarga } from "@/lib/fecha";
import { emitirConstancia } from "./actions";
import { VIGENCIA_DIAS, type EmitResult } from "./shared";

type Data = {
  nombreCompleto: string;
  tipoDocumento: string;
  numeroDocumento: string;
  codigo: string;
  estado: string;
  estadoLabel: string;
  fechaIngreso: string;
  direccion: string | null;
  puestos: { codigo: string; giro: string | null }[];
  deuda: number;
};

export function ConstanciaView({
  socioId,
  data,
  habil,
  motivoBloqueo,
}: {
  socioId: string;
  data: Data;
  habil: boolean;
  motivoBloqueo: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [emitida, setEmitida] = useState<EmitResult | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);

  const hoy = hoyLarga();
  const ingreso = fechaLarga(data.fechaIngreso);

  async function onEmitir() {
    setEmitiendo(true);
    const res = await emitirConstancia(socioId);
    setEmitiendo(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEmitida(res.data!);
    toast.success(`Constancia emitida · Folio ${res.data!.folio}`);
  }

  // Socio no hábil: no se emite la constancia, se muestra el motivo.
  if (!habil) {
    return (
      <div className="constancia-page">
        <div className="constancia-toolbar no-print">
          <button
            className="btn btn--ghost"
            onClick={() => router.push("/socios")}
          >
            <Icon
              name="chevron-right"
              size={14}
              style={{ transform: "rotate(180deg)" }}
            />
            <span>Volver al padrón</span>
          </button>
        </div>
        <div className="constancia-bloqueo">
          <div className="constancia-bloqueo__icon">
            <Icon name="lock" size={28} />
          </div>
          <h2>No se puede emitir la constancia</h2>
          <p>{motivoBloqueo}</p>
          <p className="constancia-bloqueo__sub">
            La <b>constancia de socio hábil</b> solo se emite cuando el socio
            está activo y al día en sus cuotas.
          </p>
          {data.deuda > 0 && (
            <div className="constancia-bloqueo__deuda">
              Deuda pendiente: <b>{formatSoles(data.deuda)}</b>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {data.deuda > 0 && (
              <button
                className="btn--cta"
                onClick={() =>
                  router.push(`/cuotas?q=${encodeURIComponent(data.codigo)}`)
                }
              >
                <Icon name="chart" size={16} />
                <span>Ir a cuotas del socio</span>
              </button>
            )}
            <button className="btn btn--ghost" onClick={() => router.refresh()}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="constancia-page">
      <div className="constancia-toolbar no-print">
        <button
          className="btn btn--ghost"
          onClick={() => router.push("/socios")}
        >
          <Icon
            name="chevron-right"
            size={14}
            style={{ transform: "rotate(180deg)" }}
          />
          <span>Volver al padrón</span>
        </button>
        {emitida ? (
          <button className="btn--cta" onClick={() => window.print()}>
            <Icon name="download" size={16} />
            <span>Imprimir / Guardar PDF</span>
          </button>
        ) : (
          <button
            className="btn--cta"
            onClick={onEmitir}
            disabled={emitiendo}
          >
            <Icon name="check" size={16} />
            <span>{emitiendo ? "Emitiendo…" : "Emitir constancia"}</span>
          </button>
        )}
      </div>

      {!emitida && (
        <div className="constancia-aviso no-print">
          <Icon name="info" size={16} />
          <span>
            Vista previa. Al <b>emitir</b> se registra la constancia y se generan
            su <b>código de verificación</b> y el <b>QR</b> para validarla en
            línea.
          </span>
        </div>
      )}

      <article
        className={`constancia${emitida ? "" : " constancia--preview"}`}
      >
        <header className="constancia__header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="constancia__logo"
            src="/logos_sistema/logo_peru.png"
            alt="Escudo del Perú"
          />
          <div className="constancia__header-text">
            <p className="constancia__org">
              Asociación de Comerciantes del Mercado Modelo
            </p>
            <p className="constancia__org-sub">Junta Directiva · Secretaría</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="constancia__logo"
            src="/logos_sistema/logo_madrededios.png"
            alt="Logo de Madre de Dios"
          />
        </header>

        <h1 className="constancia__title">Constancia de Socio</h1>
        {emitida && (
          <p className="constancia__folio">N.° {emitida.folio}</p>
        )}

        <div className="constancia__body">
          <p>
            Por medio del presente documento, la Junta Directiva de la
            Asociación de Comerciantes del Mercado Modelo deja constancia que:
          </p>

          <p>
            El(la) Sr(a). <b>{data.nombreCompleto}</b>, identificado(a) con{" "}
            {data.tipoDocumento} N.° <b>{data.numeroDocumento}</b>, se encuentra
            registrado(a) en el padrón de socios bajo el código{" "}
            <b>{data.codigo}</b>, en condición de{" "}
            <span className="constancia__estado">ACTIVO</span> desde el {ingreso}
            .
          </p>

          {data.puestos.length > 0 && (
            <p>
              {data.puestos.length === 1
                ? "Conduce el puesto "
                : "Conduce los puestos "}
              {data.puestos
                .map((p) => `${p.codigo}${p.giro ? ` (${p.giro})` : ""}`)
                .join(", ")}{" "}
              dentro de las instalaciones del mercado.
            </p>
          )}

          <p>
            A la fecha de emisión, el(la) socio(a){" "}
            <span className="constancia__deuda--ok">
              se encuentra al día en el pago de sus cuotas
            </span>
            , por lo que ostenta la condición de <b>SOCIO HÁBIL</b>.
          </p>

          <p>
            Se expide la presente constancia a solicitud del interesado(a) para
            los fines que estime conveniente.
          </p>

          <p className="constancia__fecha">Madre de Dios, {hoy}.</p>
        </div>

        <div className="constancia__firmas">
          <div className="constancia__firma">
            <div className="constancia__firma-line" />
            <div className="constancia__firma-label">Presidencia</div>
            <div className="constancia__firma-sub">Junta Directiva</div>
          </div>
          <div className="constancia__firma">
            <div className="constancia__firma-line" />
            <div className="constancia__firma-label">Secretaría</div>
            <div className="constancia__firma-sub">Junta Directiva</div>
          </div>
        </div>

        {emitida && (
          <footer className="constancia-verif">
            <div
              className="constancia-verif__qr"
              aria-label="Código QR de verificación"
              dangerouslySetInnerHTML={{ __html: emitida.qrSvg }}
            />
            <div className="constancia-verif__info">
              <p className="constancia-verif__title">
                Documento verificable en línea
              </p>
              <p className="constancia-verif__row">
                <span>Código de verificación</span>
                <b>{emitida.codigo}</b>
              </p>
              <p className="constancia-verif__row">
                <span>N.° de constancia</span>
                <b>{emitida.folio}</b>
              </p>
              <p className="constancia-verif__row">
                <span>Emitida</span>
                <b>{fechaHora(emitida.emitidoEn)}</b>
              </p>
              <p className="constancia-verif__row">
                <span>Válida hasta</span>
                <b>
                  {emitida.validoHasta
                    ? fechaLargaTS(emitida.validoHasta)
                    : "—"}
                </b>
              </p>
              <p className="constancia-verif__note">
                Escanee el QR o visite{" "}
                <span className="constancia-verif__url">
                  {emitida.verifyUrl}
                </span>{" "}
                e ingrese el código para comprobar la autenticidad de este
                documento. Vigencia: {VIGENCIA_DIAS} días desde su emisión.
              </p>
            </div>
          </footer>
        )}
      </article>
    </div>
  );
}
