"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { fechaTS } from "@/lib/fecha";
import { ConfirmDialog } from "../socios/ConfirmDialog";
import { EstadoPuestoBadge } from "./EstadoPuestoBadge";
import { AsignarSocioModal } from "./AsignarSocioModal";
import { getPuesto, updatePuesto, deletePuesto, unassignPuesto } from "./actions";
import type { EstadoPuesto } from "@/generated/prisma/client";
import type { PuestoDetail, PermFlags, UpdatePuestoPatch } from "./types";

type Tab = "datos" | "asignacion";

export function PuestoDetailDrawer({
  puestoId,
  perms,
  onClose,
}: {
  puestoId: string;
  perms: PermFlags;
  onClose: () => void;
}) {
  const toast = useToast();
  const [puesto, setPuesto] = useState<PuestoDetail | null>(null);
  const [tab, setTab] = useState<Tab>("datos");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [liberarOpen, setLiberarOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEscClose(true, onClose, deleting);

  async function reload() {
    const r = await getPuesto(puestoId);
    if (r.ok) setPuesto(r.data!);
    else setLoadError(r.error);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getPuesto(puestoId);
      if (cancelled) return;
      if (r.ok) setPuesto(r.data!);
      else setLoadError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [puestoId]);

  const handleConfirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const res = await deletePuesto(puestoId);
    setDeleting(false);
    if (res.ok) {
      setConfirmingDelete(false);
      toast.success("Puesto eliminado.");
      onClose();
    } else {
      toast.error(res.error);
    }
  };

  if (loadError && !puesto) {
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <aside className="drawer" onClick={(e) => e.stopPropagation()} style={{ padding: 24 }}>
          <p className="soc-error">{loadError}</p>
        </aside>
      </div>
    );
  }
  if (!puesto) {
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <aside className="drawer" onClick={(e) => e.stopPropagation()} style={{ padding: 24 }}>
          <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
        </aside>
      </div>
    );
  }

  const vigente = puesto.asignaciones.find((a) => a.hasta === null) ?? null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <header className="drawer__head">
          <div style={{ display: "flex", gap: 16, minWidth: 0, flex: 1 }}>
            <div className="pst-tile" style={{ width: 56, height: 56, fontSize: 18 }}>
              {puesto.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={puesto.fotoUrl} alt="" />
              ) : (
                <Icon name="folder" size={24} />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="drawer__eyebrow">Puesto</div>
              <h2>{puesto.codigo}</h2>
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <EstadoPuestoBadge estado={puesto.estado} />
              </div>
            </div>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="drawer__stats">
          <div className="stat">
            <div className="stat__v" style={{ fontSize: 14 }}>
              {puesto.giro ?? "—"}
            </div>
            <div className="stat__l">Giro</div>
          </div>
          <div className="stat">
            <div className="stat__v" style={{ fontSize: 14 }}>
              {puesto.zona ?? "—"}
            </div>
            <div className="stat__l">Zona</div>
          </div>
          <div className="stat">
            <div className="stat__v" style={{ fontSize: 14 }}>
              {puesto.area != null ? `${puesto.area} m²` : "—"}
            </div>
            <div className="stat__l">Área</div>
          </div>
        </div>

        <div className="soc-tabs">
          <button
            className={`soc-tab ${tab === "datos" ? "is-active" : ""}`}
            onClick={() => setTab("datos")}
          >
            Datos
          </button>
          <button
            className={`soc-tab ${tab === "asignacion" ? "is-active" : ""}`}
            onClick={() => setTab("asignacion")}
          >
            Asignación
          </button>
        </div>

        <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
          {tab === "datos" ? (
            <DatosForm
              key={puesto.updatedAt}
              puesto={puesto}
              canWrite={perms.canWrite}
              onReload={reload}
            />
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    Socio actual
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {vigente
                      ? `${vigente.socioNombre} · ${vigente.socioCodigo}`
                      : "Puesto libre"}
                  </div>
                </div>
                {perms.canAssign && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {vigente && (
                      <button
                        className="btn btn--ghost"
                        onClick={() => setLiberarOpen(true)}
                      >
                        Liberar
                      </button>
                    )}
                    <button
                      className="btn btn--primary"
                      onClick={() => setAssignOpen(true)}
                    >
                      {vigente ? "Reasignar" : "Asignar"}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "16px 0 8px" }}>
                Historial de asignación
              </div>
              <ul className="pst-asig">
                {puesto.asignaciones.length === 0 && (
                  <li style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                    Sin asignaciones registradas.
                  </li>
                )}
                {puesto.asignaciones.map((a) => (
                  <li key={a.id}>
                    <div className="pst-asig__head">
                      <span className="pst-asig__name">{a.socioNombre}</span>
                      {a.hasta === null && (
                        <span className="pst-asig__vigente">Vigente</span>
                      )}
                    </div>
                    <div className="pst-asig__range">
                      {fechaTS(a.desde)} —{" "}
                      {a.hasta ? fechaTS(a.hasta) : "actualidad"}
                      {a.motivo ? ` · ${a.motivo}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="drawer__foot">
          <button
            className="btn btn--ghost"
            style={{ color: "#b91c1c" }}
            onClick={() => setConfirmingDelete(true)}
            disabled={!perms.canDelete || deleting}
          >
            {deleting ? "Eliminando…" : "Eliminar puesto"}
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            Cerrar
          </button>
        </footer>
      </aside>

      {assignOpen && (
        <AsignarSocioModal
          puestoId={puesto.id}
          puestoCodigo={puesto.codigo}
          onClose={() => setAssignOpen(false)}
          onDone={() => {
            setAssignOpen(false);
            toast.success("Puesto asignado al socio.");
            reload();
          }}
        />
      )}

      {liberarOpen && (
        <LiberarModal
          puestoId={puesto.id}
          onClose={() => setLiberarOpen(false)}
          onDone={() => {
            setLiberarOpen(false);
            toast.success("Puesto liberado.");
            reload();
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Eliminar puesto ${puesto.codigo}`}
          description={
            <>
              Esta acción es <b>irreversible</b>. Se elimina el puesto y todo su
              historial de asignaciones.
            </>
          }
          confirmLabel="Eliminar definitivamente"
          tone="danger"
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onClose={() => !deleting && setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function LiberarModal({
  puestoId,
  onClose,
  onDone,
}: {
  puestoId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  useEscClose(true, onClose, pending);

  const valid = motivo.trim().length >= 3;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    setFe({});
    startTransition(async () => {
      const r = await unassignPuesto(puestoId, motivo.trim());
      if (!r.ok) {
        setError(r.error);
        setFe((r.fieldErrors as Record<string, string>) ?? {});
        return;
      }
      onDone();
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Liberar puesto</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal__body">
          <p className="modal__intro">
            Cierra la asignación vigente. El puesto quedará <b>vacío</b> y listo
            para reasignar.
          </p>
          {error && (
            <div className="soc-error" role="alert" style={{ marginBottom: 12 }}>
              <Icon name="info" size={16} />
              <span>{error}</span>
            </div>
          )}
          <label className="field">
            <span className="field__label">
              Motivo<span className="field__req">*</span>
            </span>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Retiro voluntario / transferencia / fallecimiento…"
              disabled={pending}
            />
            {fe.motivo && <span className="field-error">{fe.motivo}</span>}
          </label>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--danger" disabled={!valid || pending}>
            {pending ? "Liberando…" : "Liberar puesto"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function DatosForm({
  puesto,
  canWrite,
  onReload,
}: {
  puesto: PuestoDetail;
  canWrite: boolean;
  onReload: () => void;
}) {
  const initial = useMemo(
    () => ({
      codigo: puesto.codigo,
      giro: puesto.giro ?? "",
      zona: puesto.zona ?? "",
      area: puesto.area != null ? String(puesto.area) : "",
      estado: puesto.estado,
      observaciones: puesto.observaciones ?? "",
    }),
    [puesto],
  );

  const toast = useToast();
  const [codigo, setCodigo] = useState(initial.codigo);
  const [giro, setGiro] = useState(initial.giro);
  const [zona, setZona] = useState(initial.zona);
  const [area, setArea] = useState(initial.area);
  const [estado, setEstado] = useState<EstadoPuesto>(initial.estado);
  const [observaciones, setObs] = useState(initial.observaciones);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // El reset al cambiar de puesto/guardar se hace remontando vía `key`
  // en el padre (evita setState-en-effect).

  const isDirty =
    codigo !== initial.codigo ||
    giro !== initial.giro ||
    zona !== initial.zona ||
    area !== initial.area ||
    estado !== initial.estado ||
    observaciones !== initial.observaciones;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isDirty || pending) return;
    setError(null);
    setFe({});
    const patch: UpdatePuestoPatch = {
      codigo,
      giro: giro || undefined,
      zona: zona || undefined,
      area: area.trim() ? Number(area) : null,
      estado,
      observaciones: observaciones || undefined,
    };
    startTransition(async () => {
      const r = await updatePuesto(puesto.id, patch);
      if (!r.ok) {
        setError(r.error);
        setFe((r.fieldErrors as Record<string, string>) ?? {});
        toast.error(r.error);
        return;
      }
      toast.success("Puesto actualizado.");
      onReload();
    });
  }

  const disabled = !canWrite || pending;

  return (
    <form onSubmit={submit} className="soc-formgrid">
      {error && (
        <div className="soc-error" role="alert">
          <Icon name="info" size={16} />
          <span>{error}</span>
        </div>
      )}
      <label className="field">
        <span className="field__label">
          Código<span className="field__req">*</span>
        </span>
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={disabled} />
        {fe.codigo && <span className="field-error">{fe.codigo}</span>}
      </label>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">Giro / rubro</span>
          <input value={giro} onChange={(e) => setGiro(e.target.value)} disabled={disabled} />
        </label>
        <label className="field">
          <span className="field__label">Zona / pabellón</span>
          <input value={zona} onChange={(e) => setZona(e.target.value)} disabled={disabled} />
        </label>
      </div>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">Área (m²)</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={disabled}
          />
          {fe.area && <span className="field-error">{fe.area}</span>}
        </label>
        <label className="field">
          <span className="field__label">Estado</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoPuesto)}
            disabled={disabled}
          >
            <option value="vacio">Vacío</option>
            <option value="activo">Activo</option>
            <option value="clausurado">Clausurado</option>
            <option value="construccion">En construcción</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Observaciones</span>
        <textarea
          rows={3}
          value={observaciones}
          onChange={(e) => setObs(e.target.value)}
          disabled={disabled}
        />
      </label>
      {canWrite && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn--primary" disabled={disabled || !isDirty}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      )}
    </form>
  );
}
