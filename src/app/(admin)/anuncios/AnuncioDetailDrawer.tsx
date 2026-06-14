"use client";

import "./anuncios.css";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import type {
  TipoAnuncio,
  VisibilidadAnuncio,
  EstadoAnuncio,
} from "@/generated/prisma/client";
import {
  TIPO_ANUNCIO_LABEL,
  VISIBILIDAD_LABEL,
  ESTADO_ANUNCIO_LABEL,
  TIPOS_ANUNCIO,
  VISIBILIDADES,
} from "@/lib/anuncios/labels";
import {
  FOTO_ACCEPT,
  FOTO_FORMATOS,
  MAX_UPLOAD_MB,
  SNIFF_BYTES,
  sniffMime,
  validateUpload,
} from "@/lib/socios/limits";
import {
  getAnuncio,
  updateAnuncio,
  deleteAnuncio,
  publishAnuncio,
  uploadAnuncioImagen,
} from "./actions";
import type { AnuncioDetail, PermFlags } from "./types";

export function AnuncioDetailDrawer({
  anuncioId,
  perms,
  onClose,
}: {
  anuncioId: string;
  perms: PermFlags;
  onClose: () => void;
}) {
  const toast = useToast();
  const [anuncio, setAnuncio] = useState<AnuncioDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEscClose(true, onClose, busy || uploading);

  async function load() {
    const res = await getAnuncio(anuncioId);
    if (res.ok) {
      setAnuncio(res.data!);
      setLoadError(null);
    } else setLoadError(res.error);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getAnuncio(anuncioId);
      if (cancelled) return;
      if (res.ok) setAnuncio(res.data!);
      else setLoadError(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [anuncioId]);

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Validar tamaño/formato en el CLIENTE antes de enviar: así un archivo
    // grande no choca con el límite de Server Actions de Next (que mostraría
    // "Body exceeded …") sino que recibe nuestro mensaje claro.
    let sniffed: string | null = null;
    try {
      const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
      sniffed = sniffMime(head);
    } catch {
      sniffed = null;
    }
    const invalid = validateUpload(file, "foto", sniffed);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    const res = await uploadAnuncioImagen(anuncioId, file);
    setUploading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Imagen actualizada.");
    await load();
  }

  async function onPublish() {
    setBusy(true);
    const res = await publishAnuncio(anuncioId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Publicación publicada.");
    await load();
  }

  async function onDelete() {
    setBusy(true);
    const res = await deleteAnuncio(anuncioId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Publicación eliminada.");
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={() => !busy && !uploading && onClose()}>
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560 }}
      >
        {!anuncio ? (
          <div style={{ padding: 24 }}>
            {loadError ? (
              <p className="soc-error" role="alert">
                <Icon name="info" size={16} />
                <span>{loadError}</span>
              </p>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
            )}
          </div>
        ) : (
          <>
            <header className="drawer__head">
              <div style={{ display: "flex", gap: 16, minWidth: 0, flex: 1 }}>
                <div
                  className="anun-thumb anun-thumb--lg"
                  style={{ width: 56, height: 56 }}
                >
                  {anuncio.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={anuncio.imagenUrl} alt="" />
                  ) : (
                    <Icon name="bell" size={22} />
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="drawer__eyebrow">
                    {TIPO_ANUNCIO_LABEL[anuncio.tipo]}
                  </div>
                  <h2>{anuncio.titulo}</h2>
                  <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <span className={`anun-badge anun-badge--${anuncio.estado}`}>
                      {ESTADO_ANUNCIO_LABEL[anuncio.estado]}
                    </span>
                    <span className={`anun-chip anun-chip--${anuncio.visibilidad}`}>
                      {VISIBILIDAD_LABEL[anuncio.visibilidad]}
                    </span>
                  </div>
                </div>
              </div>
              <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
                <Icon name="close" size={20} />
              </button>
            </header>

            {perms.canWrite && (
              <div className="anun-imgbar">
                <label className="btn btn--ghost">
                  <Icon name="download" size={15} />
                  <span>{uploading ? "Subiendo…" : "Cambiar imagen"}</span>
                  <input
                    type="file"
                    accept={FOTO_ACCEPT}
                    onChange={onPickImage}
                    disabled={uploading}
                    hidden
                  />
                </label>
                <span className="anun-imgbar__hint">
                  {FOTO_FORMATOS} · máx {MAX_UPLOAD_MB} MB
                </span>
              </div>
            )}

            <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
              <AnuncioForm
                key={anuncio.updatedAt}
                anuncio={anuncio}
                canWrite={perms.canWrite}
                onSaved={async () => {
                  toast.success("Cambios guardados.");
                  await load();
                }}
              />

              <div className="anun-meta">
                {anuncio.publicadoEn && (
                  <span>
                    Publicado{" "}
                    {new Date(anuncio.publicadoEn).toLocaleDateString("es-PE")}
                  </span>
                )}
                {anuncio.createdBy && <span>Creado por {anuncio.createdBy}</span>}
              </div>
            </div>

            <footer className="drawer__foot">
              {perms.canDelete &&
                (confirmDel ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13 }}>¿Eliminar?</span>
                    <button
                      className="btn btn--ghost anun-danger"
                      onClick={onDelete}
                      disabled={busy}
                    >
                      Sí, eliminar
                    </button>
                    <button
                      className="btn btn--ghost"
                      onClick={() => setConfirmDel(false)}
                      disabled={busy}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn--ghost anun-danger"
                    onClick={() => setConfirmDel(true)}
                  >
                    <Icon name="trash" size={15} />
                    <span>Eliminar</span>
                  </button>
                ))}
              <div style={{ flex: 1 }} />
              {perms.canWrite && anuncio.estado !== "publicado" && (
                <button
                  className="btn btn--primary"
                  onClick={onPublish}
                  disabled={busy}
                >
                  <Icon name="check" size={15} />
                  <span>Publicar</span>
                </button>
              )}
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function AnuncioForm({
  anuncio,
  canWrite,
  onSaved,
}: {
  anuncio: AnuncioDetail;
  canWrite: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [titulo, setTitulo] = useState(anuncio.titulo);
  const [resumen, setResumen] = useState(anuncio.resumen ?? "");
  const [contenido, setContenido] = useState(anuncio.contenido);
  const [tipo, setTipo] = useState<TipoAnuncio>(anuncio.tipo);
  const [visibilidad, setVisibilidad] = useState<VisibilidadAnuncio>(
    anuncio.visibilidad,
  );
  const [estado, setEstado] = useState<EstadoAnuncio>(anuncio.estado);
  const [fijado, setFijado] = useState(anuncio.fijado);
  const [validoHasta, setValidoHasta] = useState(
    anuncio.validoHasta ? anuncio.validoHasta.slice(0, 10) : "",
  );
  const [fe, setFe] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const disabled = !canWrite || saving;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setFe({});
    const res = await updateAnuncio(anuncio.id, {
      titulo,
      resumen: resumen || undefined,
      contenido,
      tipo,
      visibilidad,
      estado,
      fijado,
      validoHasta: validoHasta || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      if (res.fieldErrors) setFe(res.fieldErrors as Record<string, string>);
      return;
    }
    await onSaved();
  }

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span className="field__label">Título</span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          aria-invalid={!!fe.titulo}
          disabled={disabled}
        />
        {fe.titulo && <span className="field-error">{fe.titulo}</span>}
      </label>

      <label className="field">
        <span className="field__label">Resumen</span>
        <input
          value={resumen}
          onChange={(e) => setResumen(e.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="field">
        <span className="field__label">Contenido</span>
        <textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          rows={6}
          aria-invalid={!!fe.contenido}
          disabled={disabled}
        />
        {fe.contenido && <span className="field-error">{fe.contenido}</span>}
      </label>

      <div className="anun-form-row">
        <label className="field">
          <span className="field__label">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoAnuncio)}
            disabled={disabled}
          >
            {TIPOS_ANUNCIO.map((t) => (
              <option key={t} value={t}>
                {TIPO_ANUNCIO_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Visibilidad</span>
          <select
            value={visibilidad}
            onChange={(e) =>
              setVisibilidad(e.target.value as VisibilidadAnuncio)
            }
            disabled={disabled}
          >
            {VISIBILIDADES.map((v) => (
              <option key={v} value={v}>
                {VISIBILIDAD_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="anun-form-row">
        <label className="field">
          <span className="field__label">Estado</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoAnuncio)}
            disabled={disabled}
          >
            <option value="borrador">Borrador</option>
            <option value="publicado">Publicado</option>
            <option value="archivado">Archivado</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Vigente hasta</span>
          <input
            type="date"
            value={validoHasta}
            onChange={(e) => setValidoHasta(e.target.value)}
            disabled={disabled}
          />
          {fe.validoHasta && (
            <span className="field-error">{fe.validoHasta}</span>
          )}
        </label>
      </div>

      <label className="anun-check">
        <input
          type="checkbox"
          checked={fijado}
          onChange={(e) => setFijado(e.target.checked)}
          disabled={disabled}
        />
        <span>Destacar (fijar arriba)</span>
      </label>

      {canWrite && (
        <button
          type="submit"
          className="btn btn--primary"
          disabled={saving}
          style={{ marginTop: 16 }}
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      )}
    </form>
  );
}
