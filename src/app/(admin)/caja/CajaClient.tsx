"use client";

import "../socios/socios.css";
import "./caja.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import type {
  TipoMovimiento,
  CategoriaMovimiento,
} from "@/generated/prisma/client";
import {
  TIPO_LABEL,
  CATEGORIA_LABEL,
  CATEGORIAS_INGRESO,
  CATEGORIAS_EGRESO,
} from "@/lib/caja/labels";
import { CreateMovimientoModal } from "./CreateMovimientoModal";
import { MovimientoDetailDrawer } from "./MovimientoDetailDrawer";
import type {
  ListMovimientosResult,
  PermFlags,
  CajaStats,
  SortKey,
} from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "fecha", label: "Fecha" },
  { key: "categoria", label: "Categoría" },
  { key: "tipo", label: "Tipo" },
  { key: "monto", label: "Monto" },
];

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CajaClient({
  initial,
  stats,
  perms,
  filters,
}: {
  initial: ListMovimientosResult;
  stats: CajaStats;
  perms: PermFlags;
  filters: {
    q: string;
    tipo?: TipoMovimiento;
    categoria?: CategoriaMovimiento;
    desde: string;
    hasta: string;
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
    startTransition(() => router.push(`/caja?${p.toString()}`));
  };

  const onSort = (key: SortKey) => {
    const nextDir =
      initial.sort === key && initial.dir === "desc" ? "asc" : "desc";
    updateParam({ sort: key, dir: nextDir }, false);
  };

  const hasFilters = !!(
    filters.q ||
    filters.tipo ||
    filters.categoria ||
    filters.desde ||
    filters.hasta
  );

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Caja</h1>
          <span className="socios-page__sub">
            {initial.total}{" "}
            {initial.total === 1 ? "movimiento" : "movimientos"}
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
            <span>Nuevo movimiento</span>
          </button>
        )}
      </header>

      {/* Resumen del período */}
      <div className="caja-cards">
        <div className="caja-card caja-card--in">
          <span className="caja-card__label">Ingresos</span>
          <span className="caja-card__value">{formatSoles(stats.ingresos)}</span>
        </div>
        <div className="caja-card caja-card--out">
          <span className="caja-card__label">Egresos</span>
          <span className="caja-card__value">{formatSoles(stats.egresos)}</span>
        </div>
        <div
          className={`caja-card ${stats.balance >= 0 ? "caja-card--bal" : "caja-card--out"}`}
        >
          <span className="caja-card__label">Balance</span>
          <span className="caja-card__value">{formatSoles(stats.balance)}</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="socios-toolbar">
        <input
          key={`q-${filters.q ?? ""}`}
          className="socios-toolbar__search"
          placeholder="Buscar por concepto, n° de comprobante…"
          defaultValue={filters.q}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              updateParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <select
          className="socios-toolbar__select"
          value={filters.tipo ?? ""}
          onChange={(e) => updateParam({ tipo: e.target.value || undefined, categoria: undefined })}
        >
          <option value="">Ingresos y egresos</option>
          <option value="ingreso">Solo ingresos</option>
          <option value="egreso">Solo egresos</option>
        </select>
        <select
          className="socios-toolbar__select"
          value={filters.categoria ?? ""}
          onChange={(e) => updateParam({ categoria: e.target.value || undefined })}
        >
          <option value="">Todas las categorías</option>
          <optgroup label="Ingresos">
            {CATEGORIAS_INGRESO.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Egresos">
            {CATEGORIAS_EGRESO.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </optgroup>
        </select>
        <input
          type="date"
          className="socios-toolbar__select"
          value={filters.desde}
          onChange={(e) => updateParam({ desde: e.target.value || undefined })}
          title="Desde"
        />
        <input
          type="date"
          className="socios-toolbar__select"
          value={filters.hasta}
          onChange={(e) => updateParam({ hasta: e.target.value || undefined })}
          title="Hasta"
        />
      </div>

      {initial.items.length === 0 ? (
        <div className="socios-empty">
          {hasFilters ? (
            <>
              <p>No hay movimientos con esos criterios.</p>
              <button
                className="btn btn--ghost"
                onClick={() =>
                  updateParam({
                    q: undefined,
                    tipo: undefined,
                    categoria: undefined,
                    desde: undefined,
                    hasta: undefined,
                  })
                }
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <p>Aún no hay movimientos registrados.</p>
              {perms.canWrite && (
                <button className="btn--cta" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" size={16} />
                  <span>Registrar el primero</span>
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="caja-grid">
          <div>
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
                              isSorted && initial.dir === "asc"
                                ? "sort-asc"
                                : "sort-desc"
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
                {initial.items.map((m) => (
                  <tr key={m.id} onClick={() => setOpenId(m.id)}>
                    <td data-label="Fecha">{fmtFecha(m.fecha)}</td>
                    <td data-label="Categoría">
                      <div className="caja-cat">
                        <span className="caja-cat__name">
                          {CATEGORIA_LABEL[m.categoria]}
                        </span>
                        <span className="caja-cat__concepto">
                          {m.concepto}
                          {m.socio ? ` · ${m.socio.nombre}` : ""}
                          {m.comprobanteUrl ? " · 📎" : ""}
                        </span>
                      </div>
                    </td>
                    <td data-label="Tipo">
                      <span className={`caja-badge caja-badge--${m.tipo}`}>
                        {TIPO_LABEL[m.tipo]}
                      </span>
                    </td>
                    <td data-label="Monto">
                      <span className={`caja-monto caja-monto--${m.tipo}`}>
                        {m.tipo === "ingreso" ? "+" : "−"}
                        {formatSoles(m.monto)}
                      </span>
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
              noun="movimiento"
              onPage={(p) => updateParam({ page: String(p) }, false)}
              onPageSize={(s) => updateParam({ size: String(s) })}
            />
          </div>

          {/* Reporte por categoría */}
          <aside className="caja-report">
            <h3>Por categoría</h3>
            {stats.porCategoria.length === 0 ? (
              <p className="caja-report__empty">Sin datos en el período.</p>
            ) : (
              <ul>
                {stats.porCategoria.map((c) => (
                  <li key={`${c.tipo}-${c.categoria}`}>
                    <span className={`caja-dot caja-dot--${c.tipo}`} />
                    <span className="caja-report__name">
                      {CATEGORIA_LABEL[c.categoria]}
                    </span>
                    <span className={`caja-report__val caja-monto--${c.tipo}`}>
                      {c.tipo === "ingreso" ? "+" : "−"}
                      {formatSoles(c.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      {createOpen && (
        <CreateMovimientoModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setOpenId(id);
            toast.success("Movimiento registrado.");
            router.refresh();
          }}
        />
      )}

      {openId && (
        <MovimientoDetailDrawer
          movId={openId}
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
