"use client";

import Link from "next/link";
import { fechaHora } from "@/lib/fecha";
import type { MiAsamblea } from "@/lib/portal/data";
import type { EstadoAsistencia } from "@/generated/prisma/client";
import {
  useListing,
  Toolbar,
  SearchBox,
  FilterSelect,
  Pager,
} from "@/components/socio/listing";

const ASIS_LABEL: Record<EstadoAsistencia, string> = {
  presente: "Presente",
  tardanza: "Tardanza",
  justificado: "Justificado",
  ausente: "Sin registrar",
};

export function AsambleasList({ items }: { items: MiAsamblea[] }) {
  const L = useListing(items, {
    pageSize: 8,
    searchText: (a) => `${a.titulo} ${a.lugar ?? ""}`,
    filters: [
      { key: "tipo", match: (a, v) => a.tipo === v },
      { key: "estado", match: (a, v) => a.estadoAsamblea === v },
      { key: "asis", match: (a, v) => a.miEstado === v },
    ],
  });

  return (
    <>
      <Toolbar>
        <SearchBox
          value={L.query}
          onChange={L.setQuery}
          placeholder="Buscar por título o lugar..."
        />
        <FilterSelect
          ariaLabel="Filtrar por tipo"
          value={L.values.tipo ?? ""}
          onChange={(v) => L.setFilter("tipo", v)}
          options={[
            { value: "", label: "Todos los tipos" },
            { value: "ordinaria", label: "Ordinaria" },
            { value: "extraordinaria", label: "Extraordinaria" },
          ]}
        />
        <FilterSelect
          ariaLabel="Filtrar por estado"
          value={L.values.estado ?? ""}
          onChange={(v) => L.setFilter("estado", v)}
          options={[
            { value: "", label: "Todos los estados" },
            { value: "programada", label: "Programada" },
            { value: "en_curso", label: "En curso" },
            { value: "cerrada", label: "Cerrada" },
          ]}
        />
        <FilterSelect
          ariaLabel="Filtrar por asistencia"
          value={L.values.asis ?? ""}
          onChange={(v) => L.setFilter("asis", v)}
          options={[
            { value: "", label: "Toda asistencia" },
            { value: "presente", label: "Presente" },
            { value: "tardanza", label: "Tardanza" },
            { value: "justificado", label: "Justificado" },
            { value: "ausente", label: "Sin registrar" },
          ]}
        />
      </Toolbar>

      {L.rawTotal === 0 ? (
        <p className="pt-empty">No tienes reuniones registradas.</p>
      ) : L.total === 0 ? (
        <p className="pt-empty">No se encontraron reuniones con esos filtros.</p>
      ) : (
        <>
          <div className="pt-list">
            {L.pageItems.map((a) => {
              // Instante → fecha+hora de Perú, determinista (sin desfase de TZ
              // del servidor ni discrepancia de hidratación).
              const fecha = fechaHora(a.fecha);
              const inner = (
                <>
                  <div className="pt-row__main">
                    <div className="pt-row__title">{a.titulo}</div>
                    <div className="pt-row__sub">
                      {fecha}
                      {a.lugar ? ` · ${a.lugar}` : ""}
                    </div>
                  </div>
                  <span className={`pt-badge pt-badge--${a.miEstado}`}>
                    {ASIS_LABEL[a.miEstado]}
                  </span>
                </>
              );
              return a.codigo ? (
                <Link
                  key={a.asambleaId}
                  href={`/portal/asambleas/${a.codigo}`}
                  className="pt-row"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {inner}
                </Link>
              ) : (
                <div key={a.asambleaId} className="pt-row">
                  {inner}
                </div>
              );
            })}
          </div>
          <Pager
            page={L.page}
            totalPages={L.totalPages}
            from={L.from}
            to={L.to}
            total={L.total}
            noun="reuniones"
            onPage={L.setPage}
          />
        </>
      )}
    </>
  );
}
