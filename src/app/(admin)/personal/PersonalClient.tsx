"use client";

import "../socios/socios.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import { avatarColor, initialsFor } from "@/lib/ui/avatar";
import { fechaCorta } from "@/lib/fecha";
import type { CargoEmpleado, EstadoEmpleado } from "@/generated/prisma/client";
import { CARGO_LABEL, CARGOS } from "@/lib/empleados/labels";
import { EstadoEmpleadoBadge } from "./EstadoEmpleadoBadge";
import { CreateEmpleadoModal } from "./CreateEmpleadoModal";
import { EmpleadoDetailDrawer } from "./EmpleadoDetailDrawer";
import { exportEmpleadosCsv } from "./actions";
import type {
  ListEmpleadosResult,
  PermFlags,
  EmpleadoStats,
  SortKey,
} from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "codigo", label: "Código" },
  { key: "nombre", label: "Apellidos, Nombres" },
  { key: "cargo", label: "Cargo" },
  { key: "ingreso", label: "Labora desde" },
  { key: "estado", label: "Estado" },
];

const STAT_CARDS: {
  key: "total" | EstadoEmpleado;
  label: string;
  tone: string;
}[] = [
  { key: "total", label: "Total personal", tone: "accent" },
  { key: "activo", label: "Activos", tone: "green" },
  { key: "suspendido", label: "Suspendidos", tone: "amber" },
  { key: "inactivo", label: "Cesados", tone: "neutral" },
];

export function PersonalClient({
  initial,
  stats,
  perms,
  filters,
}: {
  initial: ListEmpleadosResult;
  stats: EmpleadoStats;
  perms: PermFlags;
  filters: { q: string; estado?: EstadoEmpleado; cargo?: CargoEmpleado };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const updateParam = (
    entries: Record<string, string | undefined>,
    resetPage = true,
  ) => {
    const p = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(entries)) {
      if (value && value !== "") p.set(key, value);
      else p.delete(key);
    }
    if (resetPage) p.delete("page");
    startTransition(() => router.push(`/personal?${p.toString()}`));
  };

  const onSort = (key: SortKey) => {
    const nextDir =
      initial.sort === key && initial.dir === "asc" ? "desc" : "asc";
    updateParam({ sort: key, dir: nextDir }, false);
  };

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    const res = await exportEmpleadosCsv({
      q: filters.q || undefined,
      estado: filters.estado,
      cargo: filters.cargo,
    });
    setExporting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const blob = new Blob([res.data!.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.data!.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Personal exportado (${res.data!.count}).`);
  }

  const hasFilters = !!(filters.q || filters.estado || filters.cargo);

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Personal</h1>
          <span className="socios-page__sub">
            {initial.total} {initial.total === 1 ? "persona" : "personas"}
            {hasFilters && " (con filtros)"}
            {pending && (
              <span style={{ marginLeft: 10, color: "var(--accent)" }}>
                · actualizando…
              </span>
            )}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn btn--ghost"
            onClick={handleExport}
            disabled={exporting || initial.total === 0}
            title="Descargar el personal filtrado en CSV (Excel)"
          >
            <Icon name="download" size={16} />
            <span>{exporting ? "Generando…" : "Exportar"}</span>
          </button>
          {perms.canWrite && (
            <button className="btn--cta" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={16} />
              <span>Nuevo personal</span>
            </button>
          )}
        </div>
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
              className={`soc-stat soc-stat--${c.tone} ${isActive ? "is-active" : ""}`}
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
          className="socios-toolbar__search"
          placeholder="Buscar por código, DNI, nombre o cargo…"
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
          <option value="suspendido">Suspendido</option>
          <option value="inactivo">Cesado</option>
        </select>
        <select
          className="socios-toolbar__select"
          value={filters.cargo ?? ""}
          onChange={(e) => updateParam({ cargo: e.target.value || undefined })}
        >
          <option value="">Todos los cargos</option>
          {CARGOS.map((c) => (
            <option key={c} value={c}>
              {CARGO_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      {initial.items.length === 0 ? (
        <div className="socios-empty">
          {hasFilters ? (
            <>
              <p>No se encontró personal con esos criterios.</p>
              <button
                className="btn btn--ghost"
                onClick={() =>
                  updateParam({
                    q: undefined,
                    estado: undefined,
                    cargo: undefined,
                  })
                }
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <p>Aún no hay personal registrado.</p>
              {perms.canWrite && (
                <button className="btn--cta" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" size={16} />
                  <span>Registrar primer personal</span>
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
                            isSorted
                              ? initial.dir === "asc"
                                ? "sort-asc"
                                : "sort-desc"
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
              {initial.items.map((s) => (
                <tr key={s.id} onClick={() => setOpenId(s.id)}>
                  <td data-label="Código">
                    <span className="soc-codigo">{s.codigo}</span>
                  </td>
                  <td data-label="Personal">
                    <div className="soc-namecell">
                      <span
                        className="soc-rowavatar"
                        style={
                          s.fotoUrl ? undefined : { background: avatarColor(s.id) }
                        }
                      >
                        {s.fotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.fotoUrl} alt="" />
                        ) : (
                          initialsFor(`${s.apellidoPaterno} ${s.nombres}`)
                        )}
                      </span>
                      <span className="soc-namecell__text">
                        {s.apellidoPaterno} {s.apellidoMaterno ?? ""}, {s.nombres}
                      </span>
                    </div>
                  </td>
                  <td data-label="Cargo">
                    {CARGO_LABEL[s.cargo]}
                    {s.cargo === "otro" && s.cargoDetalle
                      ? ` · ${s.cargoDetalle}`
                      : ""}
                  </td>
                  <td data-label="Labora desde">{fechaCorta(s.fechaIngreso)}</td>
                  <td data-label="Estado">
                    <EstadoEmpleadoBadge estado={s.estado} />
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
            noun="persona"
            onPage={(p) => updateParam({ page: String(p) }, false)}
            onPageSize={(s) => updateParam({ size: String(s) })}
          />
        </>
      )}

      {createOpen && (
        <CreateEmpleadoModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setOpenId(id);
            toast.success("Personal registrado correctamente.");
            router.refresh();
          }}
        />
      )}

      {openId && (
        <EmpleadoDetailDrawer
          empleadoId={openId}
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
