"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/toast";
import {
  aprobarRegistroPublico,
  rechazarRegistroPublico,
  buscarSociosParaMatch,
  type RegistroPublicoRow,
  type SocioMatch,
} from "./actions";

type CardState = {
  searchTerm: string;
  results: SocioMatch[];
  chosen: SocioMatch | null;
  rechazando: boolean;
  motivo: string;
};

function emptyCard(): CardState {
  return {
    searchTerm: "",
    results: [],
    chosen: null,
    rechazando: false,
    motivo: "",
  };
}

export function RegistrosList({ items }: { items: RegistroPublicoRow[] }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();

  // Per-card state keyed by registro id
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(items.map((it) => [it.id, emptyCard()])),
  );

  // Debounce ref map: id → timeout id
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function patchCard(id: string, patch: Partial<CardState>) {
    setCards((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyCard()), ...patch },
    }));
  }

  function onSearchChange(id: string, value: string) {
    patchCard(id, { searchTerm: value, chosen: null });

    // Debounce the server call ~300 ms
    if (debounceRefs.current[id]) clearTimeout(debounceRefs.current[id]);
    if (value.trim().length < 2) {
      patchCard(id, { results: [] });
      return;
    }
    debounceRefs.current[id] = setTimeout(async () => {
      const res = await buscarSociosParaMatch(value.trim());
      if (res.ok) patchCard(id, { results: res.data! });
    }, 300);
  }

  function selectSocio(id: string, socio: SocioMatch) {
    patchCard(id, { chosen: socio, results: [], searchTerm: socio.nombre });
  }

  function aprobar(id: string) {
    const chosenId = cards[id]?.chosen?.id;
    if (!chosenId) return;
    start(async () => {
      const res = await aprobarRegistroPublico(id, chosenId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Registro aprobado y aplicado al padrón.");
      router.refresh();
    });
  }

  function confirmarRechazo(id: string) {
    const motivo = cards[id]?.motivo ?? "";
    start(async () => {
      const res = await rechazarRegistroPublico(id, motivo);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Registro rechazado.");
      patchCard(id, { rechazando: false, motivo: "" });
      router.refresh();
    });
  }

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const refs = debounceRefs.current;
    return () => {
      for (const t of Object.values(refs)) clearTimeout(t);
    };
  }, []);

  return (
    <div className="reg-list">
      {items.map((it) => {
        const card = cards[it.id] ?? emptyCard();
        return (
          <div key={it.id} className="reg-card">
            {/* Header: datos del formulario público */}
            <div className="reg-card__head">
              <strong className="reg-card__name">{it.nombreCompleto}</strong>
              <span className="reg-card__meta">
                DNI {it.numeroDocumento}
                {it.telefono ? ` · ${it.telefono}` : ""}
                {it.email ? ` · ${it.email}` : ""}
              </span>
              <span className="reg-card__date">
                Recibido:{" "}
                {new Date(it.creadoEn).toLocaleDateString("es-PE", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>

            {/* Socio matcher */}
            <div className="reg-card__matcher">
              <label className="reg-card__matcher-label">
                Emparejar con socio del padrón
              </label>
              {card.chosen ? (
                <div className="reg-card__chosen">
                  <span>
                    <strong>{card.chosen.codigo}</strong> — {card.chosen.nombre}{" "}
                    <span className="reg-card__doc">
                      {card.chosen.tipoDocumento} {card.chosen.numeroDocumento}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() =>
                      patchCard(it.id, {
                        chosen: null,
                        searchTerm: "",
                        results: [],
                      })
                    }
                    disabled={busy}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="reg-card__search-wrap">
                  <input
                    type="search"
                    className="reg-card__search-input"
                    placeholder="Buscar por código, DNI o nombre…"
                    value={card.searchTerm}
                    onChange={(e) => onSearchChange(it.id, e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                  />
                  {card.results.length > 0 && (
                    <ul className="reg-card__results">
                      {card.results.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="reg-card__result-btn"
                            onClick={() => selectSocio(it.id, s)}
                            disabled={busy}
                          >
                            <span className="reg-card__result-code">
                              {s.codigo}
                            </span>
                            <span className="reg-card__result-name">
                              {s.nombre}
                            </span>
                            <span className="reg-card__result-doc">
                              {s.tipoDocumento} {s.numeroDocumento}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            {card.rechazando ? (
              <div className="sol-card__reject">
                <input
                  type="text"
                  className="sol-card__reject-input"
                  placeholder="Motivo del rechazo (mín. 5 caracteres)"
                  value={card.motivo}
                  onChange={(e) => patchCard(it.id, { motivo: e.target.value })}
                  disabled={busy}
                />
                <div className="sol-card__reject-actions">
                  <button
                    className="btn btn--primary"
                    onClick={() => confirmarRechazo(it.id)}
                    disabled={busy || card.motivo.trim().length < 5}
                  >
                    Confirmar rechazo
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => patchCard(it.id, { rechazando: false })}
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
                  onClick={() => aprobar(it.id)}
                  disabled={busy || !card.chosen}
                >
                  Aprobar y aplicar
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() =>
                    patchCard(it.id, { rechazando: true, motivo: "" })
                  }
                  disabled={busy}
                >
                  Rechazar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
