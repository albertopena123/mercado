"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { listSocios } from "../socios/actions";
import { assignPuesto } from "./actions";
import type { SocioRow } from "../socios/types";

export function AsignarSocioModal({
  puestoId,
  puestoCodigo,
  onClose,
  onDone,
}: {
  puestoId: string;
  puestoCodigo: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SocioRow[]>([]);
  const [searching, startSearch] = useTransition();
  const [assigning, startAssign] = useTransition();

  useEscClose(true, onClose, assigning);

  // Buscar socios con debounce
  useEffect(() => {
    const term = q.trim();
    const timer = setTimeout(() => {
      startSearch(async () => {
        const res = await listSocios({
          q: term || undefined,
          estado: "activo",
          page: 1,
        });
        if (res.ok) {
          setResults(res.data!.items);
        } else {
          setResults([]);
          toast.error(res.error);
        }
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [q, toast]);

  function pick(socioId: string) {
    if (assigning) return;
    startAssign(async () => {
      const res = await assignPuesto(puestoId, socioId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="modal-backdrop" onClick={() => !assigning && onClose()}>
      <div
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2>Asignar puesto {puestoCodigo}</h2>
          <button
            type="button"
            className="iconbtn"
            onClick={() => !assigning && onClose()}
            disabled={assigning}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          <p className="modal__intro">
            Busca un socio activo y selecciónalo. Si el puesto ya estaba
            asignado, la asignación anterior se cierra automáticamente.
          </p>

          <label className="field" style={{ marginBottom: 0 }}>
            <span className="field__label">Buscar socio</span>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="DNI, código o nombre…"
              disabled={assigning}
            />
          </label>

          <ul className="pst-socio-results">
            {searching && results.length === 0 ? (
              <li style={{ padding: 12, color: "var(--text-muted)" }}>
                Buscando…
              </li>
            ) : results.length === 0 ? (
              <li style={{ padding: 12, color: "var(--text-muted)" }}>
                Sin resultados.
              </li>
            ) : (
              results.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pick(s.id)}
                    disabled={assigning}
                  >
                    <span className="pst-socio-results__name">
                      {s.apellidoPaterno} {s.apellidoMaterno ?? ""}, {s.nombres}
                    </span>
                    <span className="pst-socio-results__meta">
                      {s.codigo} · {s.tipoDocumento} {s.numeroDocumento}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <footer className="modal__foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={assigning}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
