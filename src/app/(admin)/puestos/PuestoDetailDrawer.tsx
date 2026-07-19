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
import type { EstadoPuesto, Giro } from "@/generated/prisma/client";
import type { PuestoDetail, PermFlags, UpdatePuestoPatch } from "./types";
import {
  GIRO_LABEL,
  GIROS,
  BLOQUES,
  ETAPAS,
  BANDA_LABEL,
  DIMENSION_LABEL,
  bandaPorNumero,
  puestoCodigo,
  maxNumero,
} from "@/lib/puestos/giro";

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
              <div className="drawer__eyebrow">Puesto {puesto.puestoNro}</div>
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
              {puesto.giro ? GIRO_LABEL[puesto.giro] : "—"}
            </div>
            <div className="stat__l">Giro</div>
          </div>
          <div className="stat">
            <div className="stat__v" style={{ fontSize: 14 }}>
              {puesto.bloque}
            </div>
            <div className="stat__l">Etapa {puesto.etapa} · Bloque</div>
          </div>
          <div className="stat">
            <div className="stat__v" style={{ fontSize: 14 }}>
              {DIMENSION_LABEL[puesto.dimension]}
            </div>
            <div className="stat__l">{BANDA_LABEL[puesto.banda]}</div>
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
  const toast = useToast();
  const [motivo, setMotivo] = useState("");
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  useEscClose(true, onClose, pending);

  const valid = motivo.trim().length >= 3;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setFe({});
    startTransition(async () => {
      const r = await unassignPuesto(puestoId, motivo.trim());
      if (!r.ok) {
        toast.error(r.error);
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
      etapa: puesto.etapa,
      bloque: puesto.bloque,
      numero: String(puesto.numero),
      giro: (puesto.giro ?? "") as Giro | "",
      estado: puesto.estado,
      observaciones: puesto.observaciones ?? "",
    }),
    [puesto],
  );

  const toast = useToast();
  const [etapa, setEtapa] = useState(initial.etapa);
  const [bloque, setBloque] = useState(initial.bloque);
  const [numero, setNumero] = useState(initial.numero);
  const [giro, setGiro] = useState<Giro | "">(initial.giro);
  const [estado, setEstado] = useState<EstadoPuesto>(initial.estado);
  const [observaciones, setObs] = useState(initial.observaciones);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // El reset al cambiar de puesto/guardar se hace remontando vía `key`
  // en el padre (evita setState-en-effect).

  const numN = parseInt(numero, 10);
  const numMax = maxNumero(etapa);
  const numValid = Number.isInteger(numN) && numN >= 1 && numN <= numMax;
  const banda = numValid ? bandaPorNumero(numN, etapa) : null;
  const codigoPreview = numValid ? puestoCodigo(etapa, bloque, numN) : "—";

  const isDirty =
    etapa !== initial.etapa ||
    bloque !== initial.bloque ||
    numero !== initial.numero ||
    giro !== initial.giro ||
    estado !== initial.estado ||
    observaciones !== initial.observaciones;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isDirty || pending) return;
    if (!numValid) {
      setFe({ numero: `Número inválido (1–${numMax}).` });
      return;
    }
    setFe({});
    const patch: UpdatePuestoPatch = {
      etapa,
      bloque,
      numero: numN,
      giro: giro || null,
      estado,
      observaciones: observaciones || undefined,
    };
    startTransition(async () => {
      const r = await updatePuesto(puesto.id, patch);
      if (!r.ok) {
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
      <div
        className="soc-formgrid"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}
      >
        <label className="field">
          <span className="field__label">Etapa</span>
          <select
            value={etapa}
            onChange={(e) => setEtapa(Number(e.target.value))}
            disabled={disabled}
          >
            {ETAPAS.map((n) => (
              <option key={n} value={n}>
                Etapa {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Bloque</span>
          <select
            value={bloque}
            onChange={(e) => setBloque(e.target.value)}
            disabled={disabled}
          >
            {BLOQUES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Número</span>
          <input
            type="number"
            min="1"
            max={numMax}
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            disabled={disabled}
          />
          {fe.numero && <span className="field-error">{fe.numero}</span>}
        </label>
      </div>
      <div className="banner" style={{ alignItems: "center" }}>
        <div className="banner__icon">
          <Icon name="folder" size={18} />
        </div>
        <p>
          Código: <b>{codigoPreview}</b>
          {banda && <> · {BANDA_LABEL[banda]}</>}
        </p>
      </div>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">Giro / rubro</span>
          <select
            value={giro}
            onChange={(e) => setGiro(e.target.value as Giro | "")}
            disabled={disabled}
          >
            <option value="">— Sin definir —</option>
            {GIROS.map((g) => (
              <option key={g} value={g}>
                {GIRO_LABEL[g]}
              </option>
            ))}
          </select>
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
