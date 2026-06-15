"use client";

import "../socios/socios.css";
import "./anuncios.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import type {
  EstadoAnuncio,
  TipoAnuncio,
  VisibilidadAnuncio,
} from "@/generated/prisma/client";
import {
  TIPO_ANUNCIO_LABEL,
  VISIBILIDAD_LABEL,
  ESTADO_ANUNCIO_LABEL,
  TIPOS_ANUNCIO,
  VISIBILIDADES,
} from "@/lib/anuncios/labels";
import { CreateAnuncioModal } from "./CreateAnuncioModal";
import { AnuncioDetailDrawer } from "./AnuncioDetailDrawer";
import type {
  ListAnunciosResult,
  PermFlags,
  AnuncioStats,
  SortKey,
} from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "titulo", label: "Título" },
  { key: "tipo", label: "Tipo" },
  { key: "visibilidad", label: "Visibilidad" },
  { key: "estado", label: "Estado" },
  { key: "publicadoEn", label: "Publicado" },
];

const STAT_CARDS: { key: "total" | EstadoAnuncio; label: string; tone: string }[] =
  [
    { key: "total", label: "Total", tone: "accent" },
    { key: "publicado", label: "Publicados", tone: "green" },
    { key: "borrador", label: "Borradores", tone: "neutral" },
    { key: "archivado", label: "Archivados", tone: "amber" },
  ];

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  // publicadoEn es un instante → hora de Perú (timeZone fijo = determinista,
  // sin desfase de un día ni discrepancias de hidratación).
  return new Date(iso).toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AnunciosClient({
  initial,
  stats,
  perms,
  filters,
}: {
  initial: ListAnunciosResult;
  stats: AnuncioStats;
  perms: PermFlags;
  filters: {
    q: string;
    estado?: EstadoAnuncio;
    tipo?: TipoAnuncio;
    visibilidad?: VisibilidadAnuncio;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const updateParam = (
    entries: Record<string, string | undefined>,
    resetPage = true,
  ) => {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(entries)) {
      if (v && v !== "") p.set(k, v);
      else p.delete(k);
    }
    if (resetPage) p.delete("page");
    startTransition(() => router.push(`/anuncios?${p.toString()}`));
  };

  const onSort = (key: SortKey) => {
    const nextDir =
      initial.sort === key && initial.dir === "asc" ? "desc" : "asc";
    updateParam({ sort: key, dir: nextDir }, false);
  };

  const hasFilters = !!(
    filters.q ||
    filters.estado ||
    filters.tipo ||
    filters.visibilidad
  );

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Anuncios y comunicados</h1>
          <span className="socios-page__sub">
            {initial.total} {initial.total === 1 ? "publicación" : "publicaciones"}
            {hasFilters && " (con filtros)"}
            {pending && (
              <span style={{ marginLeft: 10, color: "var(--accent)" }}>
                · actualizando…
              </span>
            )}
          </span>
        </div>
        {perms.canWrite && (
          <button className="btn--cta" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} />
            <span>Nueva publicación</span>
          </button>
        )}
      </header>

      <div className="soc-stats">
        {STAT_CARDS.map((c) => {
          const value = stats[c.key];
          const isActive =
            c.key === "total" ? !filters.estado : filters.estado === c.key;
          return (
            <button
              key={c.key}
              type="button"
              className={`soc-stat soc-stat--${c.tone} ${
                isActive ? "is-active" : ""
              }`}
              onClick={() =>
                updateParam({
                  estado: c.key === "total" ? undefined : (c.key as string),
                })
              }
              aria-pressed={isActive}
            >
              <span className="soc-stat__dot" aria-hidden />
              <span className="soc-stat__body">
                <span className="soc-stat__value">{value}</span>
                <span className="soc-stat__label">{c.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="socios-toolbar">
        <input
          key={`q-${filters.q ?? ""}`}
          className="socios-toolbar__search"
          placeholder="Buscar por título…"
          defaultValue={filters.q}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              updateParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <select
          className="socios-toolbar__select"
          value={filters.tipo ?? ""}
          onChange={(e) => updateParam({ tipo: e.target.value || undefined })}
        >
          <option value="">Todos los tipos</option>
          {TIPOS_ANUNCIO.map((t) => (
            <option key={t} value={t}>
              {TIPO_ANUNCIO_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          className="socios-toolbar__select"
          value={filters.visibilidad ?? ""}
          onChange={(e) =>
            updateParam({ visibilidad: e.target.value || undefined })
          }
        >
          <option value="">Toda visibilidad</option>
          {VISIBILIDADES.map((v) => (
            <option key={v} value={v}>
              {VISIBILIDAD_LABEL[v]}
            </option>
          ))}
        </select>
        <select
          className="socios-toolbar__select"
          value={filters.estado ?? ""}
          onChange={(e) => updateParam({ estado: e.target.value || undefined })}
        >
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="publicado">Publicado</option>
          <option value="archivado">Archivado</option>
        </select>
      </div>

      {initial.items.length === 0 ? (
        <div className="socios-empty">
          {hasFilters ? (
            <>
              <p>No se encontraron publicaciones con esos criterios.</p>
              <button
                className="btn btn--ghost"
                onClick={() =>
                  updateParam({
                    q: undefined,
                    estado: undefined,
                    tipo: undefined,
                    visibilidad: undefined,
                  })
                }
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <p>Aún no hay anuncios ni comunicados.</p>
              {perms.canWrite && (
                <button className="btn--cta" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" size={16} />
                  <span>Crear el primero</span>
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <table className="socios-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => {
                  const isSorted = initial.sort === col.key;
                  return (
                    <th key={col.key}>
                      <button
                        type="button"
                        className={`soc-th ${isSorted ? "is-sorted" : ""}`}
                        onClick={() => onSort(col.key)}
                      >
                        <span>{col.label}</span>
                        <Icon
                          name={
                            isSorted && initial.dir === "desc"
                              ? "sort-desc"
                              : "sort-asc"
                          }
                          size={14}
                          className={
                            isSorted
                              ? "soc-th__icon"
                              : "soc-th__icon soc-th__icon--idle"
                          }
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {initial.items.map((a) => (
                <tr key={a.id} onClick={() => setOpenId(a.id)}>
                  <td data-label="Título">
                    <div className="soc-namecell">
                      <span className="anun-thumb">
                        {a.imagenUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.imagenUrl} alt="" />
                        ) : (
                          <Icon name="bell" size={16} />
                        )}
                      </span>
                      <span className="anun-title">
                        {a.fijado && (
                          <Icon name="sparkle" size={13} className="anun-pin" />
                        )}
                        {a.titulo}
                      </span>
                    </div>
                  </td>
                  <td data-label="Tipo">
                    <span className="anun-chip">{TIPO_ANUNCIO_LABEL[a.tipo]}</span>
                  </td>
                  <td data-label="Visibilidad">
                    <span
                      className={`anun-chip anun-chip--${a.visibilidad}`}
                    >
                      {VISIBILIDAD_LABEL[a.visibilidad]}
                    </span>
                  </td>
                  <td data-label="Estado">
                    <span className={`anun-badge anun-badge--${a.estado}`}>
                      {ESTADO_ANUNCIO_LABEL[a.estado]}
                    </span>
                  </td>
                  <td data-label="Publicado">{fmtFecha(a.publicadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            total={initial.total}
            page={initial.page}
            pageSize={initial.pageSize}
            pending={pending}
            noun="publicación"
            onPage={(p) => updateParam({ page: String(p) }, false)}
            onPageSize={(s) => updateParam({ size: String(s) })}
          />
        </>
      )}

      {createOpen && (
        <CreateAnuncioModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setOpenId(id);
            toast.success("Publicación creada.");
            router.refresh();
          }}
        />
      )}

      {openId && (
        <AnuncioDetailDrawer
          anuncioId={openId}
          perms={perms}
          onClose={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
