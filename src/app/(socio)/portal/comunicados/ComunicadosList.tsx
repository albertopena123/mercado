"use client";

import { TIPO_ANUNCIO_LABEL } from "@/lib/anuncios/labels";
import type { MiComunicado } from "@/lib/portal/data";
import {
  useListing,
  Toolbar,
  SearchBox,
  FilterSelect,
  Pager,
} from "@/components/socio/listing";

export function ComunicadosList({ items }: { items: MiComunicado[] }) {
  const L = useListing(items, {
    pageSize: 6,
    searchText: (a) => `${a.titulo} ${a.resumen ?? ""} ${a.contenido}`,
    filters: [{ key: "tipo", match: (a, v) => a.tipo === v }],
  });

  return (
    <>
      <Toolbar>
        <SearchBox
          value={L.query}
          onChange={L.setQuery}
          placeholder="Buscar comunicado..."
        />
        <FilterSelect
          ariaLabel="Filtrar por tipo"
          value={L.values.tipo ?? ""}
          onChange={(v) => L.setFilter("tipo", v)}
          options={[
            { value: "", label: "Todos los tipos" },
            { value: "anuncio", label: "Anuncio" },
            { value: "comunicado", label: "Comunicado" },
          ]}
        />
      </Toolbar>

      {L.rawTotal === 0 ? (
        <div className="pt-panel">
          <p className="pt-empty">No hay comunicados por ahora.</p>
        </div>
      ) : L.total === 0 ? (
        <div className="pt-panel">
          <p className="pt-empty">No se encontraron comunicados con esos filtros.</p>
        </div>
      ) : (
        <>
          {L.pageItems.map((a) => (
            <article key={a.id} className="pt-panel">
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <span className="pt-badge pt-badge--justificado">
                  {TIPO_ANUNCIO_LABEL[a.tipo]}
                </span>
                {a.publicadoEn && (
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    {new Date(a.publicadoEn).toLocaleDateString("es-PE", {
                      timeZone: "America/Lima",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
              <h2 style={{ marginBottom: 8 }}>{a.titulo}</h2>
              {a.imagenUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.imagenUrl}
                  alt=""
                  style={{
                    width: "100%",
                    maxHeight: 280,
                    objectFit: "cover",
                    borderRadius: 12,
                    marginBottom: 10,
                  }}
                />
              )}
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14.5 }}>
                {a.contenido}
              </p>
            </article>
          ))}
          <Pager
            page={L.page}
            totalPages={L.totalPages}
            from={L.from}
            to={L.to}
            total={L.total}
            noun="comunicados"
            onPage={L.setPage}
          />
        </>
      )}
    </>
  );
}
