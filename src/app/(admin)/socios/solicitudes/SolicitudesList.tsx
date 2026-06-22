"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/toast";
import {
  aprobarSolicitud,
  rechazarSolicitud,
  type SolicitudPendiente,
} from "./actions";

const LABEL: Record<string, string> = {
  tipoDocumento: "Tipo doc.",
  numeroDocumento: "N° documento",
  apellidoPaterno: "Ap. paterno",
  apellidoMaterno: "Ap. materno",
  nombres: "Nombres",
  fechaNacimiento: "Fecha nac.",
  sexo: "Sexo",
  estadoCivil: "Estado civil",
  telefono: "Teléfono",
  email: "Correo",
  direccion: "Dirección",
  distrito: "Distrito",
  provincia: "Provincia",
  departamento: "Departamento",
};

// ---------------------------------------------------------------------------
// Per-card child component — owns its own useTransition so one card in-flight
// does NOT disable inputs/buttons on other cards.
// ---------------------------------------------------------------------------

function SolicitudCard({ it }: { it: SolicitudPendiente }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

  function aprobar() {
    start(async () => {
      const res = await aprobarSolicitud(it.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Solicitud aprobada y aplicada al padrón.");
      router.refresh();
    });
  }

  function confirmarRechazo() {
    start(async () => {
      const res = await rechazarSolicitud(it.id, motivo);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Solicitud rechazada.");
      setRechazando(false);
      setMotivo("");
      router.refresh();
    });
  }

  const campos = Object.keys(it.propuesto);

  return (
    <div className="sol-card">
      <div className="sol-card__head">
        <strong>{it.socio.nombre}</strong>
        <span className="sol-card__meta">
          {it.socio.codigo} · {it.socio.tipoDocumento}{" "}
          {it.socio.numeroDocumento}
        </span>
      </div>

      {campos.length === 0 ? (
        <p className="sol-card__empty">Sin cambios respecto a los datos actuales.</p>
      ) : (
        <table className="sol-diff">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Actual</th>
              <th>Propuesto</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((k) => (
              <tr key={k}>
                <td className="sol-diff__field">{LABEL[k] ?? k}</td>
                <td className="sol-diff__old">
                  {String(it.actual[k] ?? "—")}
                </td>
                <td className="sol-diff__new">
                  <strong>{String(it.propuesto[k] ?? "—")}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rechazando ? (
        <div className="sol-card__reject">
          <input
            type="text"
            className="sol-card__reject-input"
            placeholder="Motivo del rechazo (mín. 5 caracteres)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={busy}
          />
          <div className="sol-card__reject-actions">
            <button
              className="btn btn--primary"
              onClick={confirmarRechazo}
              disabled={busy || motivo.trim().length < 5}
            >
              Confirmar rechazo
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => setRechazando(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="sol-card__actions">
          <button
            className="btn btn--primary"
            onClick={aprobar}
            disabled={busy}
          >
            Aprobar
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              setRechazando(true);
              setMotivo("");
            }}
            disabled={busy}
          >
            Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parent — thin list; each card is fully isolated.
// ---------------------------------------------------------------------------

export function SolicitudesList({ items }: { items: SolicitudPendiente[] }) {
  return (
    <div className="sol-list">
      {items.map((it) => (
        <SolicitudCard key={it.id} it={it} />
      ))}
    </div>
  );
}
