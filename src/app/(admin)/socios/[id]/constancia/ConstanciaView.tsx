"use client";

import "./constancia.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import { fechaLargaTS, fechaHora, hoyLarga } from "@/lib/fecha";
import { ORG } from "@/lib/org";
import { emitirConstancia } from "./actions";
import {
  VIGENCIA_DIAS,
  TIPO_CONSTANCIA_LABEL,
  type EmitResult,
  type TipoConstancia,
} from "./shared";
import { DIMENSION_LABEL } from "@/lib/puestos/giro";
import type { DimensionPuesto } from "@/generated/prisma/client";
import type { FirmasConsejo } from "@/lib/organos/firmas";

type Data = {
  nombreCompleto: string;
  tipoDocumento: string;
  numeroDocumento: string;
  codigo: string;
  estado: string;
  estadoLabel: string;
  fechaIngreso: string;
  direccion: string | null;
  puestos: { codigo: string; giro: string | null; dimension: DimensionPuesto }[];
  deuda: number;
};

export function ConstanciaView({
  socioId,
  data,
  activo,
  motivoBloqueo,
  inasistencias,
  firmas,
}: {
  socioId: string;
  data: Data;
  activo: boolean;
  motivoBloqueo: string | null;
  // Inasistencias injustificadas a asambleas concluidas (bloquean la de no adeudo).
  inasistencias: number;
  firmas: FirmasConsejo;
}) {
  const router = useRouter();
  const toast = useToast();
  const [emitida, setEmitida] = useState<EmitResult | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [tipo, setTipo] = useState<TipoConstancia>("socio_habil");

  const hoy = hoyLarga();
  const noAdeudo = tipo === "no_adeudo";
  // La de socio (membresía) se emite a cualquier socio activo, aunque tenga
  // deuda. La de no adeudo exige además estar sin deuda Y al día en asambleas
  // (sin inasistencias injustificadas a asambleas concluidas).
  const noAdeudoBloqueado = noAdeudo && (data.deuda > 0 || inasistencias > 0);

  const puestosTxt = (sep: string) =>
    data.puestos
      .map((p) => `${p.codigo}, de dimensiones ${DIMENSION_LABEL[p.dimension]}`)
      .join(sep);

  async function onEmitir() {
    if (noAdeudoBloqueado) return;
    setEmitiendo(true);
    const res = await emitirConstancia(socioId, tipo);
    setEmitiendo(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEmitida(res.data!);
    toast.success(
      `${TIPO_CONSTANCIA_LABEL[tipo]} emitida · Folio ${res.data!.folio}`,
    );
  }

  // Socio no activo: ninguna constancia es emitible.
  if (!activo) {
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
            Solo se puede emitir una constancia a socios <b>activos</b>.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
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
            disabled={emitiendo || noAdeudoBloqueado}
          >
            <Icon name="check" size={16} />
            <span>{emitiendo ? "Emitiendo…" : "Emitir constancia"}</span>
          </button>
        )}
      </div>

      {!emitida && (
        <div
          className="no-print"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
          >
            Tipo de constancia:
          </span>
          {(
            [
              ["socio_habil", "Socio (membresía)"],
              ["no_adeudo", "No adeudo"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTipo(v)}
              className={tipo === v ? "btn--cta" : "btn btn--ghost"}
              style={{ padding: "6px 16px" }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!emitida && noAdeudoBloqueado && (
        <div
          className="constancia-aviso no-print"
          style={{
            background: "#fef2f2",
            color: "#991b1b",
            borderColor: "#fecaca",
          }}
        >
          <Icon name="info" size={16} />
          <span>
            No se puede emitir la <b>constancia de no adeudo</b> porque el socio:
            {data.deuda > 0 && (
              <>
                {" "}
                mantiene una deuda de <b>{formatSoles(data.deuda)}</b>
                {inasistencias > 0 ? ";" : "."}
              </>
            )}
            {inasistencias > 0 && (
              <>
                {" "}
                registra <b>{inasistencias}</b> inasistencia(s) injustificada(s) a
                asambleas (regularícelas justificándolas).
              </>
            )}{" "}
            Sí puedes emitir la <b>constancia de socio</b> (membresía).
          </span>
        </div>
      )}

      {!emitida && !noAdeudoBloqueado && (
        <div className="constancia-aviso no-print">
          <Icon name="info" size={16} />
          <span>
            Vista previa de la <b>{TIPO_CONSTANCIA_LABEL[tipo].toLowerCase()}</b>.
            Al <b>emitir</b> se registra y se generan su{" "}
            <b>código de verificación</b> y el <b>QR</b> para validarla en línea.
          </span>
        </div>
      )}

      {!emitida && !noAdeudoBloqueado && inasistencias > 0 && (
        <div className="constancia-aviso no-print">
          <Icon name="info" size={16} />
          <span>
            Nota: el socio registra <b>{inasistencias}</b> inasistencia(s)
            injustificada(s) a asambleas concluidas.
          </span>
        </div>
      )}

      <article
        className={`constancia${emitida ? "" : " constancia--preview"}`}
      >
        <div className="constancia__banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos_sistema/logo_header.png"
            alt="Gran Feria Mayorista Internacional MDD"
          />
        </div>

        <div className="constancia__membrete">
          <p className="constancia__lema">“{ORG.lemaAnio}”</p>
          <p className="constancia__partida">Partida N.° {ORG.partida}</p>
        </div>

        <h1 className="constancia__title">
          {noAdeudo ? "Constancia de No Adeudo" : "Constancia de Socio"}
        </h1>
        {emitida && <p className="constancia__folio">N.° {emitida.folio}</p>}

        <div className="constancia__body">
          {noAdeudo ? (
            <>
              <p>
                El(la) Tesorero(a) de la <b>{ORG.nombre}</b> <b>HACE CONSTAR</b>{" "}
                que:
              </p>

              <p>
                El(la) Sr(a). <b>{data.nombreCompleto}</b>, identificado(a) con{" "}
                {data.tipoDocumento} N.° <b>{data.numeroDocumento}</b>, socio(a)
                activo(a) de la {ORG.nombre}, código <b>{data.codigo}</b>
                {data.puestos.length > 0 ? (
                  <>
                    ,{" "}
                    {data.puestos.length === 1
                      ? "titular del puesto "
                      : "titular de los puestos "}
                    {puestosTxt("; ")}
                  </>
                ) : null}
                , se encuentra al día en el cumplimiento de sus obligaciones
                económicas con nuestra institución, por lo que{" "}
                <span className="constancia__deuda--ok">
                  no registra deuda alguna
                </span>{" "}
                a la fecha, por concepto de cuotas ordinarias, extraordinarias u
                otros compromisos económicos exigibles hasta la fecha de emisión
                de la presente constancia.
              </p>

              <p>
                Se expide la presente <b>Constancia de No Adeudo</b> a solicitud
                del(la) interesado(a), para los fines que estime convenientes.
              </p>

              <p className="constancia__fecha">
                {ORG.ciudad}, {hoy}.
              </p>
            </>
          ) : (
            <>
              <p>
                El que suscribe, presidente de la <b>{ORG.nombre}</b>,{" "}
                <b>HACE CONSTAR</b> que:
              </p>

              <p>
                El(la) Sr(a). <b>{data.nombreCompleto}</b>, identificado(a) con{" "}
                {data.tipoDocumento} N.° <b>{data.numeroDocumento}</b>, es{" "}
                <span className="constancia__estado">socio(a) activo(a)</span> de
                la {ORG.nombre}
                {data.puestos.length > 0 ? (
                  <>
                    ,{" "}
                    {data.puestos.length === 1
                      ? "titular del puesto "
                      : "titular de los puestos "}
                    {puestosTxt("; ")}
                  </>
                ) : null}
                , desde los inicios de la fundación de nuestra institución.
              </p>

              <p>
                Se le expide la presente constancia a solicitud del(la)
                interesado(a) para los fines pertinentes.
              </p>

              <p className="constancia__fecha">
                {ORG.ciudad}, {hoy}.
              </p>
            </>
          )}
        </div>

        <div className="constancia__firmas">
          {noAdeudo ? (
            <>
              <div className="constancia__firma">
                {firmas.tesorero && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="constancia__firma-img"
                    src={firmas.tesorero}
                    alt="Firma de Tesorería"
                  />
                )}
                <div className="constancia__firma-line" />
                <div className="constancia__firma-label">Tesorería</div>
                <div className="constancia__firma-sub">Junta Directiva</div>
              </div>
              <div className="constancia__firma">
                {firmas.presidente && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="constancia__firma-img"
                    src={firmas.presidente}
                    alt="Firma de Presidencia"
                  />
                )}
                <div className="constancia__firma-line" />
                <div className="constancia__firma-label">Presidencia</div>
                <div className="constancia__firma-sub">Junta Directiva</div>
              </div>
            </>
          ) : (
            <>
              <div className="constancia__firma">
                {firmas.presidente && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="constancia__firma-img"
                    src={firmas.presidente}
                    alt="Firma de Presidencia"
                  />
                )}
                <div className="constancia__firma-line" />
                <div className="constancia__firma-label">Presidencia</div>
                <div className="constancia__firma-sub">Junta Directiva</div>
              </div>
              <div className="constancia__firma">
                {firmas.secretario && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="constancia__firma-img"
                    src={firmas.secretario}
                    alt="Firma de Secretaría"
                  />
                )}
                <div className="constancia__firma-line" />
                <div className="constancia__firma-label">Secretaría</div>
                <div className="constancia__firma-sub">Junta Directiva</div>
              </div>
            </>
          )}
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
                  {emitida.validoHasta ? fechaLargaTS(emitida.validoHasta) : "—"}
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

        <div className="constancia__domicilio">
          Domicilio: {ORG.domicilio} · Celular: {ORG.celular}
        </div>
      </article>
    </div>
  );
}
