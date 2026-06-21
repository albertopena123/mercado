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

// ---------------------------------------------------------------------------
// Per-card child component — owns its own useTransition so one card in-flight
// does NOT disable inputs/buttons on other cards.
// ---------------------------------------------------------------------------

function RegistroCard({ registro }: { registro: RegistroPublicoRow }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();

  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SocioMatch[]>([]);
  const [chosen, setChosen] = useState<SocioMatch | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    const t = debounceRef;
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, []);

  function onSearchChange(value: string) {
    setSearchTerm(value);
    setChosen(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await buscarSociosParaMatch(value.trim());
      if (res.ok) setResults(res.data!);
    }, 300);
  }

  function selectSocio(socio: SocioMatch) {
    setChosen(socio);
    setResults([]);
    setSearchTerm(socio.nombre);
  }

  function aprobar() {
    if (!chosen) return;
    start(async () => {
      const res = await aprobarRegistroPublico(registro.id, chosen.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Registro aprobado y aplicado al padrón.");
      router.refresh();
    });
  }

  function confirmarRechazo() {
    start(async () => {
      const res = await rechazarRegistroPublico(registro.id, motivo);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Registro rechazado.");
      setRechazando(false);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <div className="reg-card">
      {/* Header: datos del formulario público */}
      <div className="reg-card__head">
        <strong className="reg-card__name">{registro.nombreCompleto}</strong>
        <span className="reg-card__meta">
          DNI {registro.numeroDocumento}
          {registro.telefono ? ` · ${registro.telefono}` : ""}
          {registro.email ? ` · ${registro.email}` : ""}
        </span>
        <span className="reg-card__date">
          Recibido:{" "}
          {new Date(registro.creadoEn).toLocaleDateString("es-PE", {
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
        {chosen ? (
          <div className="reg-card__chosen">
            <span>
              <strong>{chosen.codigo}</strong> — {chosen.nombre}{" "}
              <span className="reg-card__doc">
                {chosen.tipoDocumento} {chosen.numeroDocumento}
              </span>
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setChosen(null);
                setSearchTerm("");
                setResults([]);
              }}
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
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
            {results.length > 0 && (
              <ul className="reg-card__results">
                {results.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="reg-card__result-btn"
                      onClick={() => selectSocio(s)}
                      disabled={busy}
                    >
                      <span className="reg-card__result-code">{s.codigo}</span>
                      <span className="reg-card__result-name">{s.nombre}</span>
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
            disabled={busy || !chosen}
          >
            Aprobar y aplicar
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

export function RegistrosList({ items }: { items: RegistroPublicoRow[] }) {
  return (
    <div className="reg-list">
      {items.map((it) => (
        <RegistroCard key={it.id} registro={it} />
      ))}
    </div>
  );
}
