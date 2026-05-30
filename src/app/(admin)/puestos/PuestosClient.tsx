"use client";

import "../socios/socios.css";
import "./puestos.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import type { EstadoPuesto } from "@/generated/prisma/client";
import { EstadoPuestoBadge } from "./EstadoPuestoBadge";
import { CreatePuestoModal } from "./CreatePuestoModal";
import { PuestoDetailDrawer } from "./PuestoDetailDrawer";
import type {
  ListPuestosResult,
  PermFlags,
  PuestoStats,
  SortKey,
} from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "codigo", label: "Puesto" },
  { key: "giro", label: "Giro" },
  { key: "zona", label: "Zona" },
  { key: "estado", label: "Estado" },
];

const STAT_CARDS: {
  key: "total" | EstadoPuesto;
  label: string;
  tone: string;
}[] = [
  { key: "total", label: "Total puestos", tone: "accent" },
  { key: "activo", label: "Activos", tone: "green" },
  { key: "vacio", label: "Vacíos", tone: "neutral" },
  { key: "clausurado", label: "Clausurados", tone: "red" },
  { key: "construccion", label: "En obra", tone: "amber" },
];

export function PuestosClient({
  initial,
  stats,
  perms,
  filters,
}: {
  initial: ListPuestosResult;
  stats: PuestoStats;
  perms: PermFlags;
  filters: { q: string; estado?: EstadoPuesto };
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
    startTransition(() => router.push(`/puestos?${p.toString()}`));
  };

  const onSort = (key: SortKey) => {
    const nextDir =
      initial.sort === key && initial.dir === "asc" ? "desc" : "asc";
    updateParam({ sort: key, dir: nextDir }, false);
  };

  const hasFilters = !!(filters.q || filters.estado);

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Puestos</h1>
          <span className="socios-page__sub">
            {initial.total} {initial.total === 1 ? "puesto" : "puestos"}
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
            <span>Nuevo puesto</span>
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
          placeholder="Buscar por código, giro, zona…"
          defaultValue={filters.q}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              updateParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <select
          className="socios-toolbar__select"
          value={filters.estado ?? ""}
          onChange={(e) => updateParam({ estado: e.target.value || undefined })}
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="vacio">Vacío</option>
          <option value="clausurado">Clausurado</option>
          <option value="construccion">En construcción</option>
        </select>
      </div>

      {pending ? (
        <SkeletonTable />
      ) : initial.items.length === 0 ? (
        <div className="socios-empty">
          {hasFilters ? (
            <>
              <p>No se encontraron puestos con esos criterios.</p>
              <button
                className="btn btn--ghost"
                onClick={() => updateParam({ q: undefined, estado: undefined })}
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <p>Aún no hay puestos registrados.</p>
              {perms.canWrite && (
                <button className="btn--cta" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" size={16} />
                  <span>Crear primer puesto</span>
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
                <th>
                  <span className="soc-th" style={{ cursor: "default" }}>
                    Socio actual
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((p) => (
                <tr key={p.id} onClick={() => setOpenId(p.id)}>
                  <td data-label="Puesto">
                    <div className="soc-namecell">
                      <span className="pst-tile">
                        {p.fotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.fotoUrl} alt="" />
                        ) : (
                          <Icon name="folder" size={16} />
                        )}
                      </span>
                      <span className="soc-codigo">{p.codigo}</span>
                    </div>
                  </td>
                  <td data-label="Giro">{p.giro ?? "—"}</td>
                  <td data-label="Zona">{p.zona ?? "—"}</td>
                  <td data-label="Estado">
                    <EstadoPuestoBadge estado={p.estado} />
                  </td>
                  <td data-label="Socio actual">
                    {p.socioActual ? (
                      <span className="pst-socio">{p.socioActual.nombre}</span>
                    ) : (
                      <span className="pst-socio--empty">Sin asignar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            total={initial.total}
            page={initial.page}
            pageSize={initial.pageSize}
            pending={pending}
            noun="puesto"
            onPage={(p) => updateParam({ page: String(p) }, false)}
            onPageSize={(s) => updateParam({ size: String(s) })}
          />
        </>
      )}

      {createOpen && (
        <CreatePuestoModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setOpenId(id);
            toast.success("Puesto creado correctamente.");
            router.refresh();
          }}
        />
      )}

      {openId && (
        <PuestoDetailDrawer
          puestoId={openId}
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

function SkeletonTable() {
  return (
    <table className="socios-table socios-table--skeleton">
      <thead>
        <tr>
          {["Puesto", "Giro", "Zona", "Estado", "Socio actual"].map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 8 }).map((_, i) => (
          <tr key={i}>
            <td>
              <div className="soc-namecell">
                <span className="sk sk--avatar" />
                <span className="sk sk--sm" />
              </div>
            </td>
            <td>
              <span className="sk sk--md" />
            </td>
            <td>
              <span className="sk sk--sm" />
            </td>
            <td>
              <span className="sk sk--badge" />
            </td>
            <td>
              <span className="sk sk--lg" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
