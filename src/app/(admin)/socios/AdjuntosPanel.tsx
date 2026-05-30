"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import type { SocioDetail } from "./types";
import { uploadAdjunto, removeAdjuntoAction, setFoto } from "./actions";
import {
  DOC_ACCEPT,
  DOC_FORMATOS,
  FOTO_ACCEPT,
  FOTO_FORMATOS,
  MAX_UPLOAD_MB,
  humanFileSize,
  validateUpload,
} from "@/lib/socios/limits";

const TIPOS = [
  { value: "dni_scan", label: "DNI escaneado" },
  { value: "ficha_inscripcion", label: "Ficha de inscripción" },
  { value: "carnet", label: "Carné" },
  { value: "otro", label: "Otro" },
];

export function AdjuntosPanel({
  socio,
  canWrite,
  onChanged,
}: {
  socio: SocioDetail;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [tipo, setTipo] = useState("dni_scan");
  const [pending, startTransition] = useTransition();
  // El error se ancla al control que lo produjo (foto o documentos) para que el
  // mensaje aparezca junto al botón usado, no al inicio del panel.
  const [error, setError] = useState<{
    kind: "foto" | "doc";
    msg: string;
  } | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    // Validación inmediata en el cliente: evita subir un archivo de 20 MB solo
    // para que el servidor lo rechace.
    const invalid = validateUpload(f, "foto");
    if (invalid) {
      setError({ kind: "foto", msg: invalid });
      toast.error(invalid);
      return;
    }
    startTransition(async () => {
      const r = await setFoto(socio.id, f);
      if (!r.ok) {
        setError({ kind: "foto", msg: r.error });
        toast.error(r.error);
      } else {
        toast.success("Foto actualizada.");
      }
      onChanged();
    });
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    const invalid = validateUpload(f, "doc");
    if (invalid) {
      setError({ kind: "doc", msg: invalid });
      toast.error(invalid);
      return;
    }
    startTransition(async () => {
      const r = await uploadAdjunto(socio.id, tipo, f);
      if (!r.ok) {
        setError({ kind: "doc", msg: r.error });
        toast.error(r.error);
      } else {
        toast.success("Documento subido.");
      }
      onChanged();
    });
  }

  function onRemove(id: string) {
    if (!window.confirm("¿Eliminar este documento? No se puede deshacer."))
      return;
    startTransition(async () => {
      const r = await removeAdjuntoAction(id);
      if (!r.ok) {
        setError({ kind: "doc", msg: r.error });
        toast.error(r.error);
      } else {
        toast.success("Adjunto eliminado.");
      }
      onChanged();
    });
  }

  const docs = socio.adjuntos.filter((a) => a.tipo !== "foto");

  return (
    <div>
      <section className="adjuntos-section">
        <h4>Foto del socio</h4>
        <div className="adjuntos-foto">
          {socio.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="adjuntos-foto__img"
              src={socio.fotoUrl}
              alt={`Foto de ${socio.nombres}`}
            />
          ) : (
            <div className="adjuntos-foto__placeholder">Sin foto</div>
          )}
          {canWrite && (
            <div className="adjuntos-foto__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => fotoRef.current?.click()}
                disabled={pending}
              >
                {socio.fotoUrl ? "Reemplazar foto" : "Subir foto"}
              </button>
              <p className="adjuntos-hint">
                {FOTO_FORMATOS} · máx {MAX_UPLOAD_MB} MB
              </p>
              {error?.kind === "foto" && (
                <div className="soc-error soc-error--inline" role="alert">
                  <Icon name="info" size={16} />
                  <span>{error.msg}</span>
                </div>
              )}
              <input
                ref={fotoRef}
                type="file"
                accept={FOTO_ACCEPT}
                hidden
                onChange={onFoto}
              />
            </div>
          )}
        </div>
      </section>

      <section className="adjuntos-section">
        <h4>Documentos</h4>
        {docs.length === 0 ? (
          <p className="adjuntos-empty">No hay documentos adjuntos.</p>
        ) : (
          <ul className="adjuntos-list">
            {docs.map((a) => (
              <li key={a.id}>
                <span className="adjuntos-list__tipo">
                  {TIPOS.find((t) => t.value === a.tipo)?.label ?? a.tipo}
                </span>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn--ghost"
                  style={{ height: 28, padding: "0 12px" }}
                >
                  Ver
                </a>
                <span className="adjuntos-list__meta">{a.mimeType}</span>
                <span className="adjuntos-list__meta">
                  {a.sizeBytes ? humanFileSize(a.sizeBytes) : "—"}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    className="iconbtn iconbtn--small"
                    onClick={() => onRemove(a.id)}
                    disabled={pending}
                    aria-label="Eliminar adjunto"
                    title="Eliminar adjunto"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <div className="adjuntos-upload">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              disabled={pending}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => docRef.current?.click()}
              disabled={pending}
            >
              Subir documento
            </button>
            <p className="adjuntos-hint adjuntos-hint--inline">
              {DOC_FORMATOS} · máx {MAX_UPLOAD_MB} MB
            </p>
            <input
              ref={docRef}
              type="file"
              accept={DOC_ACCEPT}
              hidden
              onChange={onUpload}
            />
          </div>
        )}
        {error?.kind === "doc" && (
          <div
            className="soc-error soc-error--inline"
            role="alert"
            style={{ marginTop: 10 }}
          >
            <Icon name="info" size={16} />
            <span>{error.msg}</span>
          </div>
        )}
      </section>
    </div>
  );
}
