"use client";

import "../../socios.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { fechaCorta, fechaHora, hoyISOPeru } from "@/lib/fecha";
import { ConfirmDialog } from "../../ConfirmDialog";
import { RenunciaView } from "./RenunciaView";
import {
  crearRenuncia,
  registrarAceptacionCd,
  registrarRatificacionAg,
  efectivizarRenuncia,
  rechazarRenuncia,
} from "./actions";
import {
  ESTADO_RENUNCIA_LABEL,
  FLUJO_RENUNCIA,
  type RenunciaData,
} from "./types";
import type { DimensionPuesto } from "@/generated/prisma/client";

type Carta = {
  nombreCompleto: string;
  tipoDocumento: string;
  numeroDocumento: string;
  alDia: boolean;
};

type PuestoOpcion = { id: string; codigo: string; dimension: DimensionPuesto };

const BADGE: Record<string, { bg: string; fg: string }> = {
  solicitada: { bg: "#fef3c7", fg: "#92400e" },
  aceptada_cd: { bg: "#dbeafe", fg: "#1e40af" },
  ratificada_ag: { bg: "#e0e7ff", fg: "#3730a3" },
  efectiva: { bg: "#dcfce7", fg: "#166534" },
  rechazada: { bg: "#f3f4f6", fg: "#6b7280" },
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "7px 0",
        borderBottom: "1px solid var(--border)",
        fontSize: 14,
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <b style={{ textAlign: "right" }}>{value}</b>
    </div>
  );
}

export function RenunciaManager({
  socioId,
  estadoSocio,
  renuncia,
  canWrite,
  canChangeState,
  puestosOpciones,
  carta,
}: {
  socioId: string;
  estadoSocio: string;
  renuncia: RenunciaData | null;
  canWrite: boolean;
  canChangeState: boolean;
  puestosOpciones: PuestoOpcion[];
  carta: Carta;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  // Formularios.
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [actaCdNumero, setActaCdNumero] = useState("");
  const [actaCdFecha, setActaCdFecha] = useState(hoyISOPeru());
  const [actaAgNumero, setActaAgNumero] = useState("");
  const [actaAgFecha, setActaAgFecha] = useState(hoyISOPeru());
  const [rechazando, setRechazando] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [confirmEfectivizar, setConfirmEfectivizar] = useState(false);

  // Alcance de una NUEVA solicitud. "TOTAL" = renuncia a la condición de socio
  // (libera todos). Un id = cesión de ese puesto. Con 0 o 1 puesto, ceder = irse
  // → default TOTAL. Con varios, default al primero (elegible), sin pisar todo.
  const soloUnPuesto = puestosOpciones.length <= 1;
  const [alcance, setAlcance] = useState<string>(
    soloUnPuesto ? "TOTAL" : puestosOpciones[0].id,
  );

  // Scope efectivo: si ya existe el expediente, manda su puestoId; si se está
  // creando, la selección de arriba. Es "total" cuando no hay puesto acotado o
  // cuando el socio tiene un solo puesto (cederlo equivale a irse).
  const scopePuestoId = renuncia
    ? renuncia.puestoId
    : alcance === "TOTAL"
      ? null
      : alcance;
  const esTotal = scopePuestoId == null || soloUnPuesto;
  const puestoScoped =
    scopePuestoId != null
      ? (puestosOpciones.find((p) => p.id === scopePuestoId) ?? null)
      : null;
  const codigoScoped =
    puestoScoped?.codigo ?? renuncia?.puestoCodigo ?? null;
  const cartaPuestos: { codigo: string; dimension: DimensionPuesto }[] = esTotal
    ? puestosOpciones.map((p) => ({ codigo: p.codigo, dimension: p.dimension }))
    : puestoScoped
      ? [{ codigo: puestoScoped.codigo, dimension: puestoScoped.dimension }]
      : renuncia?.puestoCodigo && renuncia.puestoDimension
        ? [
            {
              codigo: renuncia.puestoCodigo,
              dimension: renuncia.puestoDimension,
            },
          ]
        : [];
  const conservaOtros = !esTotal && puestosOpciones.length > 1;

  const estado = renuncia?.estado ?? null;
  const enTramite =
    estado === "solicitada" ||
    estado === "aceptada_cd" ||
    estado === "ratificada_ag";
  const puedeNuevaSolicitud =
    (!renuncia || estado === "rechazada") && estadoSocio === "activo";

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    if (pending) return;
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo completar la acción.");
      return false;
    }
    toast.success(msg);
    router.refresh();
    return true;
  }

  async function onCrear() {
    await run(
      () =>
        crearRenuncia(socioId, {
          motivo,
          observaciones,
          puestoId: alcance === "TOTAL" ? null : alcance,
        }),
      "Solicitud de renuncia registrada.",
    );
  }
  async function onAceptarCd() {
    if (!renuncia) return;
    await run(
      () => registrarAceptacionCd(renuncia.id, { actaCdNumero, actaCdFecha }),
      "Aceptación del Consejo Directivo registrada.",
    );
  }
  async function onRatificarAg() {
    if (!renuncia) return;
    await run(
      () => registrarRatificacionAg(renuncia.id, { actaAgNumero, actaAgFecha }),
      "Ratificación de la Asamblea General registrada.",
    );
  }
  async function onEfectivizar() {
    if (!renuncia) return;
    const okRes = await run(
      () => efectivizarRenuncia(renuncia.id),
      "Renuncia efectivizada: socio retirado y puestos liberados.",
    );
    if (okRes) setConfirmEfectivizar(false);
  }
  async function onRechazar() {
    if (!renuncia) return;
    const okRes = await run(
      () => rechazarRenuncia(renuncia.id, { motivoRechazo }),
      "Renuncia rechazada.",
    );
    if (okRes) {
      setRechazando(false);
      setMotivoRechazo("");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 14,
    marginTop: 4,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
  };

  return (
    <div className="socios-page">
      {/* Toda la gestión es no-print: al imprimir solo sale la carta. */}
      <div className="no-print">
      <header className="socios-page__header">
        <div>
          <button
            className="btn btn--ghost"
            style={{ padding: "4px 8px", marginBottom: 8 }}
            onClick={() => router.push("/socios")}
          >
            <Icon
              name="chevron-right"
              size={14}
              style={{ transform: "rotate(180deg)" }}
            />
            <span>Volver al padrón</span>
          </button>
          <h1 className="socios-page__title">
            Renuncia del socio
            {estado && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "2px 10px",
                  borderRadius: 999,
                  marginLeft: 8,
                  background: BADGE[estado]?.bg ?? "#f3f4f6",
                  color: BADGE[estado]?.fg ?? "#6b7280",
                }}
              >
                {ESTADO_RENUNCIA_LABEL[estado]}
              </span>
            )}
          </h1>
          <span className="socios-page__sub">{carta.nombreCompleto}</span>
        </div>
      </header>

      {/* Estado terminal: efectiva */}
      {estado === "efectiva" && (
        <div
          className="soc-error"
          style={{ background: "#dcfce7", color: "#166534", marginBottom: 20 }}
        >
          <Icon name="check" size={16} />
          <span>
            Renuncia <b>efectiva</b>
            {renuncia?.efectivaEn ? ` (${fechaHora(renuncia.efectivaEn)})` : ""}.{" "}
            {estadoSocio === "retirado" ? (
              <>
                El socio quedó <b>retirado</b> y sus puestos fueron liberados.
              </>
            ) : (
              <>
                Se liberó el puesto <b>{codigoScoped ?? "—"}</b> (cesión
                registrada). El socio <b>conserva</b> su condición.
              </>
            )}
          </span>
        </div>
      )}

      {/* Estado terminal: rechazada */}
      {estado === "rechazada" && (
        <div className="soc-error" style={{ marginBottom: 20 }}>
          <Icon name="info" size={16} />
          <span>
            La renuncia fue <b>rechazada</b>
            {renuncia?.motivoRechazo ? `: ${renuncia.motivoRechazo}` : "."} El
            socio conserva su condición.
          </span>
        </div>
      )}

      {/* Expediente: stepper + datos registrados */}
      {renuncia && (
        <section className="pt-panel" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Expediente de renuncia</h2>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            {FLUJO_RENUNCIA.map((s) => {
              const idx = FLUJO_RENUNCIA.indexOf(s);
              const curIdx = FLUJO_RENUNCIA.indexOf(estado as never);
              const done = estado !== "rechazada" && curIdx >= idx;
              return (
                <span
                  key={s}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: done ? "#dcfce7" : "#f3f4f6",
                    color: done ? "#166534" : "#9ca3af",
                  }}
                >
                  {ESTADO_RENUNCIA_LABEL[s]}
                </span>
              );
            })}
          </div>
          <Row label="Solicitada" value={fechaHora(renuncia.fechaSolicitud)} />
          <Row
            label="Alcance"
            value={
              renuncia.puestoId
                ? `Cesión del puesto ${renuncia.puestoCodigo ?? "—"}`
                : "Renuncia total (condición de socio)"
            }
          />
          {renuncia.motivo && <Row label="Motivo" value={renuncia.motivo} />}
          <Row
            label="Acta Consejo Directivo"
            value={
              renuncia.actaCdNumero
                ? `${renuncia.actaCdNumero} · ${fechaCorta(renuncia.actaCdFecha)}`
                : "—"
            }
          />
          <Row
            label="Acta Asamblea General"
            value={
              renuncia.actaAgNumero
                ? `${renuncia.actaAgNumero} · ${fechaCorta(renuncia.actaAgFecha)}`
                : "—"
            }
          />
          {renuncia.observaciones && (
            <Row label="Observaciones" value={renuncia.observaciones} />
          )}
        </section>
      )}

      {/* Acción: nueva solicitud */}
      {puedeNuevaSolicitud && canWrite && (
        <section className="pt-panel" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Registrar solicitud de renuncia</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 0 }}>
            La renuncia escrita se dirige al Presidente; luego debe ser aceptada
            por el Consejo Directivo y ratificada por la Asamblea General
            (Estatuto Art. 8).
          </p>

          {puestosOpciones.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Alcance de la renuncia</label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {puestosOpciones.map((p) => (
                  <label
                    key={p.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="radio"
                      name="alcance-renuncia"
                      checked={alcance === p.id}
                      onChange={() => setAlcance(p.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      Ceder solo el puesto <b>{p.codigo}</b> — conserva su
                      condición de socio y sus demás puestos.
                    </span>
                  </label>
                ))}
                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    fontSize: 14,
                  }}
                >
                  <input
                    type="radio"
                    name="alcance-renuncia"
                    checked={alcance === "TOTAL"}
                    onChange={() => setAlcance("TOTAL")}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <b>Renuncia total</b> a la condición de socio — libera todos
                    sus puestos y causa baja.
                  </span>
                </label>
              </div>
            </div>
          )}

          <label style={labelStyle}>
            Motivo (opcional)
            <textarea
              style={{ ...inputStyle, minHeight: 64 }}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <label style={{ ...labelStyle, display: "block", marginTop: 10 }}>
            Observaciones (opcional)
            <input
              style={inputStyle}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </label>
          <button
            className="btn btn--primary"
            style={{ marginTop: 12 }}
            onClick={onCrear}
            disabled={pending}
          >
            <Icon name="check" size={16} />
            <span>Registrar solicitud</span>
          </button>
        </section>
      )}

      {puedeNuevaSolicitud && !canWrite && (
        <div className="soc-error" style={{ marginBottom: 20 }}>
          <Icon name="info" size={16} />
          <span>No tienes permiso para registrar la renuncia de este socio.</span>
        </div>
      )}

      {/* Acción: aceptación CD */}
      {estado === "solicitada" && canWrite && (
        <section className="pt-panel" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Aceptación del Consejo Directivo</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <label style={labelStyle}>
              N.° de acta
              <input
                style={inputStyle}
                value={actaCdNumero}
                onChange={(e) => setActaCdNumero(e.target.value)}
                placeholder="Ej. 045-2026"
              />
            </label>
            <label style={labelStyle}>
              Fecha del acta
              <input
                type="date"
                style={inputStyle}
                value={actaCdFecha}
                max={hoyISOPeru()}
                onChange={(e) => setActaCdFecha(e.target.value)}
              />
            </label>
          </div>
          <button
            className="btn btn--primary"
            style={{ marginTop: 12 }}
            onClick={onAceptarCd}
            disabled={pending}
          >
            <Icon name="check" size={16} />
            <span>Registrar aceptación del CD</span>
          </button>
        </section>
      )}

      {/* Acción: ratificación AG */}
      {estado === "aceptada_cd" && canWrite && (
        <section className="pt-panel" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Ratificación de la Asamblea General</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <label style={labelStyle}>
              N.° de acta
              <input
                style={inputStyle}
                value={actaAgNumero}
                onChange={(e) => setActaAgNumero(e.target.value)}
                placeholder="Ej. 012-2026-AG"
              />
            </label>
            <label style={labelStyle}>
              Fecha del acta
              <input
                type="date"
                style={inputStyle}
                value={actaAgFecha}
                max={hoyISOPeru()}
                onChange={(e) => setActaAgFecha(e.target.value)}
              />
            </label>
          </div>
          <button
            className="btn btn--primary"
            style={{ marginTop: 12 }}
            onClick={onRatificarAg}
            disabled={pending}
          >
            <Icon name="check" size={16} />
            <span>Registrar ratificación de la AG</span>
          </button>
        </section>
      )}

      {/* Acción: efectivizar */}
      {estado === "ratificada_ag" && (
        <section className="pt-panel" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Efectivizar renuncia</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 0 }}>
            {esTotal ? (
              <>
                Al efectivizar, el socio pasa a <b>retirado</b> y se liberan
                todos sus puestos (quedan vacíos). Esta acción es definitiva.
              </>
            ) : (
              <>
                Al efectivizar, se libera el puesto <b>{codigoScoped ?? "—"}</b>{" "}
                (queda vacío). El socio <b>conserva</b> su condición y sus demás
                puestos. Esta acción es definitiva.
              </>
            )}
          </p>
          {canChangeState ? (
            <button
              className="btn btn--primary"
              onClick={() => setConfirmEfectivizar(true)}
              disabled={pending}
            >
              <Icon name="check" size={16} />
              <span>Efectivizar renuncia</span>
            </button>
          ) : (
            <div className="soc-error">
              <Icon name="info" size={16} />
              <span>
                Requiere el permiso <b>Cambiar estado del socio</b>.
              </span>
            </div>
          )}
        </section>
      )}

      {/* Rechazar (disponible en cualquier estado en trámite) */}
      {enTramite && canWrite && (
        <section className="pt-panel" style={{ marginBottom: 20 }}>
          {!rechazando ? (
            <button
              className="btn btn--ghost"
              style={{ color: "#b91c1c" }}
              onClick={() => setRechazando(true)}
              disabled={pending}
            >
              <Icon name="close" size={16} />
              <span>Rechazar renuncia</span>
            </button>
          ) : (
            <div>
              <label style={labelStyle}>
                Motivo del rechazo (opcional)
                <textarea
                  style={{ ...inputStyle, minHeight: 56 }}
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  className="btn btn--danger"
                  onClick={onRechazar}
                  disabled={pending}
                >
                  Confirmar rechazo
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => setRechazando(false)}
                  disabled={pending}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* fin de la zona de gestión (no se imprime) */}
      </div>

      {/* Carta imprimible: única parte que sale en la impresión. RenunciaView
          trae su propia barra (no-print) con el botón Imprimir / Guardar PDF. */}
      <RenunciaView
        data={{
          nombreCompleto: carta.nombreCompleto,
          tipoDocumento: carta.tipoDocumento,
          numeroDocumento: carta.numeroDocumento,
          alDia: carta.alDia,
          puestos: cartaPuestos,
          alcanceTotal: esTotal,
          conservaOtros,
        }}
      />

      {confirmEfectivizar && renuncia && (
        <ConfirmDialog
          title="Efectivizar renuncia"
          description={
            esTotal ? (
              <>
                Esta acción es <b>definitiva</b>. Se hará, en una sola operación:
                <div style={{ marginTop: 8 }}>
                  · El socio <b>{carta.nombreCompleto}</b> pasa a estado{" "}
                  <b>retirado</b>.
                </div>
                <div>· Se liberan todos sus puestos (quedan vacíos).</div>
              </>
            ) : (
              <>
                Esta acción es <b>definitiva</b>. Se hará, en una sola operación:
                <div style={{ marginTop: 8 }}>
                  · Se libera el puesto <b>{codigoScoped ?? "—"}</b> (queda
                  vacío) y se registra su cesión.
                </div>
                <div>
                  · El socio <b>{carta.nombreCompleto}</b> <b>conserva</b> su
                  condición de socio y sus demás puestos.
                </div>
              </>
            )
          }
          confirmLabel="Efectivizar"
          busy={pending}
          onConfirm={onEfectivizar}
          onClose={() => !pending && setConfirmEfectivizar(false)}
        />
      )}
    </div>
  );
}
