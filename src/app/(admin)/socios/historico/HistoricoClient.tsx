"use client";

import { useState } from "react";
import { buscarPadronHistorico } from "../actions";
import type { RegistroBusqueda } from "@/lib/padron/types";

export function HistoricoClient() {
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<RegistroBusqueda[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setBuscando(true);
    setError(null);
    const r = await buscarPadronHistorico(q);
    if (r.ok) setFilas(r.data ?? []);
    else setError(r.error ?? "Error");
    setBuscando(false);
  }

  return (
    <div>
      <form onSubmit={buscar} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div className="reg-card__search-wrap" style={{ flex: 1 }}>
          <input
            type="search"
            className="reg-card__search-input"
            placeholder="Nombre, N.° de padrón, DNI o puesto (p. ej. E1-A-12)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && <p className="soc-error">{error}</p>}

      {filas !== null && filas.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          Sin resultados en el padrón histórico para «{q}».
        </p>
      )}

      {filas !== null && filas.length > 0 && (
        <table className="socios-table">
          <thead>
            <tr>
              <th>Gestión</th>
              <th>Puesto</th>
              <th>Titular</th>
              <th>N.° padrón</th>
              <th>DNI</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td>{f.gestion}</td>
                <td style={{ fontFamily: "monospace" }}>{f.puestoCodigo}</td>
                <td>{f.nombreOriginal ?? "—"}</td>
                <td>{f.numeroPadron ?? "—"}</td>
                <td>{f.numeroDocumento ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
