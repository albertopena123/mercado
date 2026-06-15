"use client";

import "./caja.css";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { formatSoles } from "@/lib/money";
import type {
  TipoMovimiento,
  CategoriaMovimiento,
  TipoComprobante,
} from "@/generated/prisma/client";
import {
  CATEGORIA_LABEL,
  TIPO_LABEL,
  COMPROBANTE_LABEL,
  categoriasPorTipo,
  TIPOS_COMPROBANTE,
  METODOS_PAGO,
} from "@/lib/caja/labels";
import {
  DOC_ACCEPT,
  DOC_FORMATOS,
  MAX_UPLOAD_MB,
  SNIFF_BYTES,
  sniffMime,
  validateUpload,
} from "@/lib/socios/limits";
import {
  getMovimiento,
  updateMovimiento,
  deleteMovimiento,
  uploadComprobante,
} from "./actions";
import type { MovimientoDetail, PermFlags } from "./types";

export function MovimientoDetailDrawer({
  movId,
  perms,
  onClose,
}: {
  movId: string;
  perms: PermFlags;
  onClose: () => void;
}) {
  const toast = useToast();
  const [mov, setMov] = useState<MovimientoDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEscClose(true, onClose, busy || uploading);

  async function load() {
    const res = await getMovimiento(movId);
    if (res.ok) {
      setMov(res.data!);
      setLoadError(null);
    } else setLoadError(res.error);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getMovimiento(movId);
      if (cancelled) return;
      if (res.ok) setMov(res.data!);
      else setLoadError(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [movId]);

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let sniffed: string | null = null;
    try {
      const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
      sniffed = sniffMime(head);
    } catch {
      sniffed = null;
    }
    const invalid = validateUpload(file, "doc", sniffed);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    const res = await uploadComprobante(movId, file);
    setUploading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Comprobante subido.");
    await load();
  }

  async function onDelete() {
    setBusy(true);
    const res = await deleteMovimiento(movId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Movimiento eliminado.");
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={() => !busy && !uploading && onClose()}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        {!mov ? (
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
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="drawer__eyebrow">
                  {CATEGORIA_LABEL[mov.categoria]}
                </div>
                <h2>{mov.concepto}</h2>
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`caja-badge caja-badge--${mov.tipo}`}>
                    {TIPO_LABEL[mov.tipo]}
                  </span>
                  <span className={`caja-monto caja-monto--${mov.tipo}`} style={{ fontSize: 18, fontWeight: 800 }}>
                    {mov.tipo === "ingreso" ? "+" : "−"}
                    {formatSoles(mov.monto)}
                  </span>
                </div>
              </div>
              <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
                <Icon name="close" size={20} />
              </button>
            </header>

            {/* Comprobante */}
            <div className="caja-bar">
              {mov.comprobanteUrl ? (
                <a
                  className="btn btn--ghost"
                  href={mov.comprobanteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="external" size={15} />
                  <span>Ver comprobante</span>
                </a>
              ) : (
                <span className="caja-bar__hint">Sin comprobante adjunto</span>
              )}
              {perms.canWrite && (
                <label className="btn btn--ghost">
                  <Icon name="download" size={15} />
                  <span>
                    {uploading
                      ? "Subiendo…"
                      : mov.comprobanteUrl
                        ? "Reemplazar"
                        : "Subir comprobante"}
                  </span>
                  <input
                    type="file"
                    accept={DOC_ACCEPT}
                    onChange={onPickFile}
                    disabled={uploading}
                    hidden
                  />
                </label>
              )}
              <span className="caja-bar__hint">{DOC_FORMATOS} · máx {MAX_UPLOAD_MB} MB</span>
            </div>

            <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
              <MovimientoForm
                key={mov.updatedAt}
                mov={mov}
                canWrite={perms.canWrite}
                onSaved={async () => {
                  toast.success("Cambios guardados.");
                  await load();
                }}
              />
              <div className="caja-meta">
                <span>
                  Fecha:{" "}
                  {new Date(mov.fecha).toLocaleDateString("es-PE", {
                    timeZone: "UTC",
                  })}
                </span>
                {mov.socio && <span>Socio: {mov.socio.nombre}</span>}
                {mov.metodoPago && <span>Pago: {mov.metodoPago}</span>}
                {mov.comprobanteNumero && <span>N°: {mov.comprobanteNumero}</span>}
                {mov.registradoPor && <span>Registró: {mov.registradoPor}</span>}
                {mov.origen === "cuota" && (
                  <span>Origen: pago de cuota (automático)</span>
                )}
                {mov.origen === "inscripcion" && (
                  <span>Origen: inscripción de socio (automático)</span>
                )}
              </div>
            </div>

            <footer className="drawer__foot">
              {perms.canDelete &&
                (confirmDel ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13 }}>¿Eliminar?</span>
                    <button className="btn btn--ghost caja-danger" onClick={onDelete} disabled={busy}>
                      Sí, eliminar
                    </button>
                    <button className="btn btn--ghost" onClick={() => setConfirmDel(false)} disabled={busy}>
                      No
                    </button>
                  </div>
                ) : (
                  <button className="btn btn--ghost caja-danger" onClick={() => setConfirmDel(true)}>
                    <Icon name="trash" size={15} />
                    <span>Eliminar</span>
                  </button>
                ))}
              <div style={{ flex: 1 }} />
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function MovimientoForm({
  mov,
  canWrite,
  onSaved,
}: {
  mov: MovimientoDetail;
  canWrite: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [tipo, setTipo] = useState<TipoMovimiento>(mov.tipo);
  const [categoria, setCategoria] = useState<CategoriaMovimiento>(mov.categoria);
  const [monto, setMonto] = useState(String(mov.monto));
  const [fecha, setFecha] = useState(mov.fecha.slice(0, 10));
  const [concepto, setConcepto] = useState(mov.concepto);
  const [metodoPago, setMetodoPago] = useState(mov.metodoPago ?? "efectivo");
  const [comprobanteTipo, setComprobanteTipo] = useState<TipoComprobante>(
    mov.comprobanteTipo,
  );
  const [comprobanteNumero, setComprobanteNumero] = useState(
    mov.comprobanteNumero ?? "",
  );
  const [fe, setFe] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const disabled = !canWrite || saving;

  function onTipoChange(t: TipoMovimiento) {
    setTipo(t);
    if (!categoriasPorTipo(t).includes(categoria))
      setCategoria(categoriasPorTipo(t)[0]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setFe({});
    const res = await updateMovimiento(mov.id, {
      tipo,
      categoria,
      monto: Number(monto),
      fecha,
      concepto,
      metodoPago: metodoPago || undefined,
      comprobanteTipo,
      comprobanteNumero: comprobanteNumero || undefined,
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
      <div className="caja-seg">
        <button
          type="button"
          className={`caja-seg__btn ${tipo === "egreso" ? "is-on caja-seg__btn--out" : ""}`}
          onClick={() => onTipoChange("egreso")}
          disabled={disabled}
        >
          Egreso
        </button>
        <button
          type="button"
          className={`caja-seg__btn ${tipo === "ingreso" ? "is-on caja-seg__btn--in" : ""}`}
          onClick={() => onTipoChange("ingreso")}
          disabled={disabled}
        >
          Ingreso
        </button>
      </div>

      <div className="caja-form-row">
        <label className="field">
          <span className="field__label">Categoría</span>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaMovimiento)}
            disabled={disabled}
          >
            {categoriasPorTipo(tipo).map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Monto (S/)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            aria-invalid={!!fe.monto}
            disabled={disabled}
          />
          {fe.monto && <span className="field-error">{fe.monto}</span>}
        </label>
      </div>

      <label className="field">
        <span className="field__label">Concepto</span>
        <input
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          aria-invalid={!!fe.concepto}
          disabled={disabled}
        />
        {fe.concepto && <span className="field-error">{fe.concepto}</span>}
      </label>

      <div className="caja-form-row">
        <label className="field">
          <span className="field__label">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span className="field__label">Método de pago</span>
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
            disabled={disabled}
          >
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="caja-form-row">
        <label className="field">
          <span className="field__label">Comprobante</span>
          <select
            value={comprobanteTipo}
            onChange={(e) => setComprobanteTipo(e.target.value as TipoComprobante)}
            disabled={disabled}
          >
            {TIPOS_COMPROBANTE.map((c) => (
              <option key={c} value={c}>
                {COMPROBANTE_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">N° de comprobante</span>
          <input
            value={comprobanteNumero}
            onChange={(e) => setComprobanteNumero(e.target.value)}
            disabled={disabled}
          />
        </label>
      </div>

      {canWrite && (
        <button type="submit" className="btn btn--primary" disabled={saving} style={{ marginTop: 12 }}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      )}
    </form>
  );
}
