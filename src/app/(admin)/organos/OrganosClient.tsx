"use client";

import "../socios/socios.css";
import "./organos.css";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { fechaCorta } from "@/lib/fecha";
import { ConfirmDialog } from "../socios/ConfirmDialog";
import { CrearDirectivoModal } from "./CrearDirectivoModal";
import { cesarDirectivo, eliminarDirectivo } from "./actions";
import {
  CARGO_LABEL,
  ORGANO_LABEL,
  type DirectivoRow,
  type PermFlags,
} from "./types";
import type { CargoDirectivo, Organo } from "@/generated/prisma/client";

const ORGANO_ORDER: Organo[] = [
  "consejo_directivo",
  "fiscalia",
  "comite",
  "coordinacion_bloque",
];

const CARGO_ORDER: Record<CargoDirectivo, number> = {
  presidente: 0,
  vicepresidente: 1,
  secretario: 2,
  tesorero: 3,
  fiscal: 4,
  vocal: 5,
  coordinador: 6,
  otro: 7,
};

export function OrganosClient({
  vigentes,
  historial,
  perms,
}: {
  vigentes: DirectivoRow[];
  historial: DirectivoRow[];
  perms: PermFlags;
}) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<null | { editar?: DirectivoRow }>(null);
  const [cesar, setCesar] = useState<DirectivoRow | null>(null);
  const [borrar, setBorrar] = useState<DirectivoRow | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const grupos = useMemo(() => {
    const by = new Map<Organo, DirectivoRow[]>();
    for (const d of vigentes) {
      const arr = by.get(d.organo) ?? [];
      arr.push(d);
      by.set(d.organo, arr);
    }
    for (const arr of by.values())
      arr.sort(
        (a, b) =>
          CARGO_ORDER[a.cargo] - CARGO_ORDER[b.cargo] ||
          (a.bloque ?? "").localeCompare(b.bloque ?? ""),
      );
    return ORGANO_ORDER.filter((o) => by.has(o)).map((o) => ({
      organo: o,
      rows: by.get(o)!,
    }));
  }, [vigentes]);

  async function onCesar() {
    if (!cesar) return;
    const res = await cesarDirectivo(cesar.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Cargo cesado.");
    setCesar(null);
    router.refresh();
  }

  async function onBorrar() {
    if (!borrar) return;
    const res = await eliminarDirectivo(borrar.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Cargo eliminado.");
    setBorrar(null);
    router.refresh();
  }

  return (
    <div className="org-page">
      <header className="org-head">
        <div>
          <h1 className="org-title">Junta directiva y órganos</h1>
          <p className="org-sub">
            Consejo Directivo, Fiscalía, comités y coordinadores de bloque de la
            asociación.
          </p>
        </div>
        {perms.canWrite && (
          <button className="btn--cta" onClick={() => setModal({})}>
            <Icon name="plus" size={16} />
            <span>Agregar cargo</span>
          </button>
        )}
      </header>

      {grupos.length === 0 && (
        <div className="org-empty">
          <Icon name="user" size={28} />
          <p>Aún no se ha registrado ningún cargo directivo.</p>
          {perms.canWrite && (
            <button className="btn btn--primary" onClick={() => setModal({})}>
              Registrar el primer cargo
            </button>
          )}
        </div>
      )}

      <div className="org-grid">
        {grupos.map(({ organo, rows }) => (
          <section key={organo} className="org-card">
            <h2 className="org-card__title">{ORGANO_LABEL[organo]}</h2>
            <ul className="org-list">
              {rows.map((d) => (
                <li key={d.id} className="org-item">
                  <div className="org-item__main">
                    <span className="org-cargo">
                      {CARGO_LABEL[d.cargo]}
                      {d.bloque ? ` · Bloque ${d.bloque}` : ""}
                    </span>
                    <span className="org-socio">
                      {d.socioNombre}{" "}
                      <span className="org-muted">· {d.socioCodigo}</span>
                    </span>
                    <span className="org-meta">
                      Desde {fechaCorta(d.desde)}
                      {d.periodo ? ` · Periodo ${d.periodo}` : ""}
                    </span>
                  </div>
                  {perms.canWrite && (
                    <div className="org-item__actions">
                      <button
                        className="iconbtn"
                        title="Editar"
                        onClick={() => setModal({ editar: d })}
                      >
                        <Icon name="settings" size={16} />
                      </button>
                      <button
                        className="iconbtn"
                        title="Cesar (fin de funciones)"
                        onClick={() => setCesar(d)}
                      >
                        <Icon name="clock" size={16} />
                      </button>
                      <button
                        className="iconbtn iconbtn--danger"
                        title="Eliminar"
                        onClick={() => setBorrar(d)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {historial.length > 0 && (
        <section className="org-historial">
          <button
            className="org-historial__toggle"
            onClick={() => setVerHistorial((v) => !v)}
          >
            <Icon
              name={verHistorial ? "chevron-down" : "chevron-right"}
              size={16}
            />
            <span>Historial de cargos cesados ({historial.length})</span>
          </button>
          {verHistorial && (
            <ul className="org-list org-list--hist">
              {historial.map((d) => (
                <li key={d.id} className="org-item org-item--hist">
                  <div className="org-item__main">
                    <span className="org-cargo">
                      {ORGANO_LABEL[d.organo]} · {CARGO_LABEL[d.cargo]}
                      {d.bloque ? ` · Bloque ${d.bloque}` : ""}
                    </span>
                    <span className="org-socio">
                      {d.socioNombre}{" "}
                      <span className="org-muted">· {d.socioCodigo}</span>
                    </span>
                    <span className="org-meta">
                      {fechaCorta(d.desde)} — {d.hasta ? fechaCorta(d.hasta) : "—"}
                    </span>
                  </div>
                  {perms.canWrite && (
                    <div className="org-item__actions">
                      <button
                        className="iconbtn iconbtn--danger"
                        title="Eliminar del historial"
                        onClick={() => setBorrar(d)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {modal && (
        <CrearDirectivoModal
          editar={modal.editar}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}

      {cesar && (
        <ConfirmDialog
          title="Cesar cargo"
          tone="info"
          confirmLabel="Cesar"
          description={
            <>
              ¿Cesar a <b>{cesar.socioNombre}</b> como{" "}
              <b>{CARGO_LABEL[cesar.cargo]}</b>? El cargo pasará al historial con la
              fecha de hoy.
            </>
          }
          onConfirm={onCesar}
          onClose={() => setCesar(null)}
        />
      )}

      {borrar && (
        <ConfirmDialog
          title="Eliminar cargo"
          confirmLabel="Eliminar"
          description={
            <>
              ¿Eliminar el registro del cargo <b>{CARGO_LABEL[borrar.cargo]}</b> de{" "}
              <b>{borrar.socioNombre}</b>? Esta acción no se puede deshacer; úsala
              solo para corregir cargas erróneas.
            </>
          }
          onConfirm={onBorrar}
          onClose={() => setBorrar(null)}
        />
      )}
    </div>
  );
}
