"use client";

import "../socios/socios.css";
import "../caja/caja.css";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { fechaCorta } from "@/lib/fecha";
import { formatSoles } from "@/lib/money";
import { avatarColor, initialsFor } from "@/lib/ui/avatar";
import {
  DOC_ACCEPT,
  DOC_FORMATOS,
  FOTO_ACCEPT,
  FOTO_FORMATOS,
  MAX_UPLOAD_MB,
  SNIFF_BYTES,
  humanFileSize,
  sniffMime,
  validateUpload,
} from "@/lib/socios/limits";
import { CARGO_LABEL, CARGOS, TIPO_ADJUNTO_LABEL } from "@/lib/empleados/labels";
import type {
  TipoDocumento,
  CargoEmpleado,
} from "@/generated/prisma/client";
import { EstadoEmpleadoBadge } from "./EstadoEmpleadoBadge";
import {
  getEmpleado,
  updateEmpleado,
  setEstadoEmpleado,
  deleteEmpleado,
  uploadEmpleadoAdjunto,
  removeEmpleadoAdjunto,
} from "./actions";
import type { EmpleadoDetail, PermFlags } from "./types";

async function detectMime(file: File): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    return sniffMime(head);
  } catch {
    return null;
  }
}

const DOC_TIPOS = ["cv", "contrato", "dni", "otro"] as const;

export function EmpleadoDetailDrawer({
  empleadoId,
  perms,
  onClose,
}: {
  empleadoId: string;
  perms: PermFlags;
  onClose: () => void;
}) {
  const toast = useToast();
  const [emp, setEmp] = useState<EmpleadoDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEscClose(true, onClose, busy);

  async function load() {
    const res = await getEmpleado(empleadoId);
    if (res.ok) setEmp(res.data!);
    else setLoadError(res.error);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getEmpleado(empleadoId);
      if (cancelled) return;
      if (res.ok) setEmp(res.data!);
      else setLoadError(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [empleadoId]);

  async function cambiarEstado(estado: "activo" | "suspendido" | "inactivo") {
    if (estado === "inactivo" && !window.confirm("¿Registrar el cese de este personal? Se guardará la fecha de hoy como fin de labores.")) return;
    setBusy(true);
    const res = await setEstadoEmpleado(empleadoId, estado);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Estado actualizado.");
    await load();
  }

  async function onDelete() {
    setBusy(true);
    const res = await deleteEmpleado(empleadoId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Personal eliminado.");
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={() => !busy && onClose()}>
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 600 }}
      >
        {!emp ? (
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
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, flex: 1 }}>
                <span
                  className="soc-rowavatar"
                  style={emp.fotoUrl ? undefined : { background: avatarColor(emp.id) }}
                >
                  {emp.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emp.fotoUrl} alt="" />
                  ) : (
                    initialsFor(`${emp.apellidoPaterno} ${emp.nombres}`)
                  )}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="drawer__eyebrow">
                    {emp.codigo} ·{" "}
                    {CARGO_LABEL[emp.cargo]}
                    {emp.cargo === "otro" && emp.cargoDetalle
                      ? ` (${emp.cargoDetalle})`
                      : ""}
                  </div>
                  <h2 style={{ margin: "2px 0" }}>
                    {emp.apellidoPaterno} {emp.apellidoMaterno ?? ""}, {emp.nombres}
                  </h2>
                  <EstadoEmpleadoBadge estado={emp.estado} />
                </div>
              </div>
              <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
                <Icon name="close" size={20} />
              </button>
            </header>

            {/* Estado / cese */}
            {perms.canWrite && (
              <div className="caja-bar" style={{ gap: 8 }}>
                {emp.estado !== "activo" && (
                  <button
                    className="btn btn--ghost"
                    onClick={() => cambiarEstado("activo")}
                    disabled={busy}
                  >
                    Reactivar
                  </button>
                )}
                {emp.estado === "activo" && (
                  <button
                    className="btn btn--ghost"
                    onClick={() => cambiarEstado("suspendido")}
                    disabled={busy}
                  >
                    Suspender
                  </button>
                )}
                {emp.estado !== "inactivo" && (
                  <button
                    className="btn btn--ghost"
                    onClick={() => cambiarEstado("inactivo")}
                    disabled={busy}
                  >
                    Registrar cese
                  </button>
                )}
                {emp.fechaCese && (
                  <span className="caja-bar__hint">
                    Cesado el {fechaCorta(emp.fechaCese)}
                  </span>
                )}
              </div>
            )}

            <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
              <EmpleadoForm
                key={emp.updatedAt}
                emp={emp}
                canWrite={perms.canWrite}
                onSaved={async () => {
                  toast.success("Cambios guardados.");
                  await load();
                }}
              />

              <AdjuntosBlock
                emp={emp}
                canWrite={perms.canWrite}
                onChanged={load}
              />

              <div className="caja-meta">
                <span>Labora desde: {fechaCorta(emp.fechaIngreso)}</span>
                {emp.fechaCese && <span>Cese: {fechaCorta(emp.fechaCese)}</span>}
                {emp.salario != null && (
                  <span>Salario: {formatSoles(emp.salario)}</span>
                )}
              </div>
            </div>

            <footer className="drawer__foot">
              {perms.canDelete &&
                (confirmDel ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13 }}>¿Eliminar definitivamente?</span>
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

function EmpleadoForm({
  emp,
  canWrite,
  onSaved,
}: {
  emp: EmpleadoDetail;
  canWrite: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(emp.tipoDocumento);
  const [numeroDocumento, setNumeroDocumento] = useState(emp.numeroDocumento);
  const [apellidoPaterno, setApellidoPaterno] = useState(emp.apellidoPaterno);
  const [apellidoMaterno, setApellidoMaterno] = useState(emp.apellidoMaterno ?? "");
  const [nombres, setNombres] = useState(emp.nombres);
  const [cargo, setCargo] = useState<CargoEmpleado>(emp.cargo);
  const [cargoDetalle, setCargoDetalle] = useState(emp.cargoDetalle ?? "");
  const [fechaIngreso, setFechaIngreso] = useState(emp.fechaIngreso.slice(0, 10));
  const [telefono, setTelefono] = useState(emp.telefono ?? "");
  const [email, setEmail] = useState(emp.email ?? "");
  const [direccion, setDireccion] = useState(emp.direccion ?? "");
  const [salario, setSalario] = useState(emp.salario != null ? String(emp.salario) : "");
  const [observaciones, setObservaciones] = useState(emp.observaciones ?? "");
  const [fe, setFe] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const disabled = !canWrite || saving;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setFe({});
    const res = await updateEmpleado(emp.id, {
      tipoDocumento,
      numeroDocumento: numeroDocumento.trim(),
      apellidoPaterno: apellidoPaterno.trim(),
      apellidoMaterno: apellidoMaterno.trim() || undefined,
      nombres: nombres.trim(),
      cargo,
      cargoDetalle: cargoDetalle.trim() || undefined,
      fechaIngreso,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      direccion: direccion.trim() || undefined,
      salario: salario.trim() ? Number(salario) : null,
      observaciones: observaciones.trim() || undefined,
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
    <form onSubmit={submit} className="soc-formgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <label className="field">
        <span className="field__label">Tipo doc.</span>
        <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)} disabled={disabled}>
          <option value="DNI">DNI</option>
          <option value="CE">CE</option>
          <option value="PASAPORTE">Pasaporte</option>
          <option value="RUC">RUC</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">N° documento</span>
        <input value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} aria-invalid={!!fe.numeroDocumento} disabled={disabled} />
        {fe.numeroDocumento && <span className="field-error">{fe.numeroDocumento}</span>}
      </label>
      <label className="field">
        <span className="field__label">Apellido paterno</span>
        <input value={apellidoPaterno} onChange={(e) => setApellidoPaterno(e.target.value)} aria-invalid={!!fe.apellidoPaterno} disabled={disabled} />
        {fe.apellidoPaterno && <span className="field-error">{fe.apellidoPaterno}</span>}
      </label>
      <label className="field">
        <span className="field__label">Apellido materno</span>
        <input value={apellidoMaterno} onChange={(e) => setApellidoMaterno(e.target.value)} disabled={disabled} />
      </label>
      <label className="field" style={{ gridColumn: "1 / -1" }}>
        <span className="field__label">Nombres</span>
        <input value={nombres} onChange={(e) => setNombres(e.target.value)} aria-invalid={!!fe.nombres} disabled={disabled} />
        {fe.nombres && <span className="field-error">{fe.nombres}</span>}
      </label>
      <label className="field">
        <span className="field__label">Cargo</span>
        <select value={cargo} onChange={(e) => setCargo(e.target.value as CargoEmpleado)} disabled={disabled}>
          {CARGOS.map((c) => (
            <option key={c} value={c}>
              {CARGO_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Labora desde</span>
        <input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} aria-invalid={!!fe.fechaIngreso} disabled={disabled} />
        {fe.fechaIngreso && <span className="field-error">{fe.fechaIngreso}</span>}
      </label>
      {cargo === "otro" && (
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          <span className="field__label">Detalle del cargo</span>
          <input value={cargoDetalle} onChange={(e) => setCargoDetalle(e.target.value)} disabled={disabled} />
        </label>
      )}
      <label className="field">
        <span className="field__label">Teléfono</span>
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} disabled={disabled} />
      </label>
      <label className="field">
        <span className="field__label">Salario (S/)</span>
        <input type="number" step="0.01" min="0" value={salario} onChange={(e) => setSalario(e.target.value)} aria-invalid={!!fe.salario} disabled={disabled} />
        {fe.salario && <span className="field-error">{fe.salario}</span>}
      </label>
      <label className="field">
        <span className="field__label">Correo</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fe.email} disabled={disabled} />
        {fe.email && <span className="field-error">{fe.email}</span>}
      </label>
      <label className="field">
        <span className="field__label">Dirección</span>
        <input value={direccion} onChange={(e) => setDireccion(e.target.value)} disabled={disabled} />
      </label>
      <label className="field" style={{ gridColumn: "1 / -1" }}>
        <span className="field__label">Observaciones</span>
        <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} disabled={disabled} />
      </label>
      {canWrite && (
        <button type="submit" className="btn btn--primary" disabled={saving} style={{ gridColumn: "1 / -1", marginTop: 4 }}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      )}
    </form>
  );
}

function AdjuntosBlock({
  emp,
  canWrite,
  onChanged,
}: {
  emp: EmpleadoDetail;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [tipo, setTipo] = useState<string>("cv");
  const [pending, startTransition] = useTransition();
  const fotoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  function onFoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    startTransition(async () => {
      const sniffed = await detectMime(f);
      const invalid = validateUpload(f, "foto", sniffed);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      const r = await uploadEmpleadoAdjunto(emp.id, "foto", f);
      if (!r.ok) toast.error(r.error);
      else toast.success("Foto actualizada.");
      onChanged();
    });
  }

  function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    startTransition(async () => {
      const sniffed = await detectMime(f);
      const invalid = validateUpload(f, "doc", sniffed);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      const r = await uploadEmpleadoAdjunto(emp.id, tipo, f);
      if (!r.ok) toast.error(r.error);
      else toast.success("Documento subido.");
      onChanged();
    });
  }

  function onRemove(id: string) {
    if (!window.confirm("¿Eliminar este documento? No se puede deshacer.")) return;
    startTransition(async () => {
      const r = await removeEmpleadoAdjunto(id);
      if (!r.ok) toast.error(r.error);
      else toast.success("Adjunto eliminado.");
      onChanged();
    });
  }

  const docs = emp.adjuntos.filter((a) => a.tipo !== "foto");

  return (
    <div style={{ marginTop: 18 }}>
      <section className="adjuntos-section">
        <h4>Documentos (CV, contrato…)</h4>
        {docs.length === 0 ? (
          <p className="adjuntos-empty">Aún no hay documentos. Sube el CV del personal.</p>
        ) : (
          <ul className="adjuntos-list">
            {docs.map((a) => (
              <li key={a.id}>
                <span className="adjuntos-list__tipo">
                  {TIPO_ADJUNTO_LABEL[a.tipo] ?? a.tipo}
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
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={pending}>
              {DOC_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPO_ADJUNTO_LABEL[t]}
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
            <input ref={docRef} type="file" accept={DOC_ACCEPT} hidden onChange={onUpload} />
          </div>
        )}
      </section>

      {canWrite && (
        <section className="adjuntos-section">
          <h4>Foto</h4>
          <div className="adjuntos-foto__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => fotoRef.current?.click()}
              disabled={pending}
            >
              {emp.fotoUrl ? "Reemplazar foto" : "Subir foto"}
            </button>
            <p className="adjuntos-hint">
              {FOTO_FORMATOS} · máx {MAX_UPLOAD_MB} MB
            </p>
            <input ref={fotoRef} type="file" accept={FOTO_ACCEPT} hidden onChange={onFoto} />
          </div>
        </section>
      )}
    </div>
  );
}
