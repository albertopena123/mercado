"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { Pagination } from "@/components/admin/Pagination";
import { EstadoBienBadge } from "./EstadoBienBadge";
import { CreateBienModal } from "./CreateBienModal";
import { MovimientoBienModal } from "./MovimientoBienModal";
import { HistorialBienModal } from "./HistorialBienModal";
import { deleteBien } from "./actions";
import { ESTADOS, UBICACIONES, UBICACION_LABEL, ESTADO_LABEL } from "./labels";
import type { UbicacionBien, EstadoBien } from "@/generated/prisma/client";
import type {
  BienRow,
  BienStats,
  ListBienesResult,
  PermFlags,
  SortKey,
  SortDir,
} from "./types";

type Filters = {
  q: string;
  ubicacion?: UbicacionBien;
  estado?: EstadoBien;
};

export function InventarioClient({
  initial,
  stats,
  perms,
  filters,
}: {
  initial: ListBienesResult;
  stats: BienStats;
  perms: PermFlags;
  filters: Filters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [qInput, setQInput] = useState(filters.q);
  // Mantiene el input sincronizado si los filtros cambian desde fuera (Limpiar).
  // Se ajusta DURANTE el render (patrón recomendado por React para derivar estado
  // de props) en vez de en un useEffect, evitando renders en cascada.
  const [prevFilterQ, setPrevFilterQ] = useState(filters.q);
  if (prevFilterQ !== filters.q) {
    setPrevFilterQ(filters.q);
    setQInput(filters.q);
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [editBien, setEditBien] = useState<BienRow | null>(null);
  const [movBien, setMovBien] = useState<BienRow | null>(null);
  const [histBien, setHistBien] = useState<BienRow | null>(null);
  const [delBien, setDelBien] = useState<BienRow | null>(null);

  function setParams(patch: Record<string, string | undefined>, resetPage = true) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (resetPage) sp.delete("page");
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`));
  }

  // Búsqueda con debounce.
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearch(v: string) {
    setQInput(v);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setParams({ q: v.trim() || undefined }), 400);
  }

  function toggleSort(key: SortKey) {
    const dir: SortDir =
      initial.sort === key && initial.dir === "asc" ? "desc" : "asc";
    setParams({ sort: key, dir }, false);
  }

  function afterMutation() {
    setCreateOpen(false);
    setEditBien(null);
    setMovBien(null);
    router.refresh();
  }

  const hasFilters = !!filters.q || !!filters.ubicacion || !!filters.estado;
  const items = initial.items;

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <h1>Inventario</h1>
          <span className="page__sub">
            {stats.total} {stats.total === 1 ? "bien" : "bienes"} · {stats.unidades} unidades
          </span>
        </div>
        <div className="page__actions">
          {perms.canWrite && (
            <button className="btn--cta" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={18} /> Nuevo bien
            </button>
          )}
        </div>
      </div>

      {/* Resumen */}
      <div className="inv-stats">
        <div className="inv-stat">
          <div className="inv-stat__v">{stats.total}</div>
          <div className="inv-stat__l">Bienes</div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat__v">{stats.unidades}</div>
          <div className="inv-stat__l">Unidades</div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat__v">{stats.oficina}</div>
          <div className="inv-stat__l">Oficina</div>
        </div>
        <div className="inv-stat">
          <div className="inv-stat__v">{stats.almacen}</div>
          <div className="inv-stat__l">Almacén</div>
        </div>
        <div className="inv-stat inv-stat--alert">
          <div className="inv-stat__v">{stats.alerta}</div>
          <div className="inv-stat__l">Requieren atención</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="inv-toolbar">
        <div className="inv-search">
          <Icon name="search" size={18} />
          <input
            type="text"
            value={qInput}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por nombre, marca o código…"
          />
        </div>
        <select
          className="inv-select"
          value={filters.ubicacion ?? ""}
          onChange={(e) => setParams({ ubicacion: e.target.value || undefined })}
        >
          <option value="">Toda ubicación</option>
          {UBICACIONES.map((u) => (
            <option key={u} value={u}>
              {UBICACION_LABEL[u]}
            </option>
          ))}
        </select>
        <select
          className="inv-select"
          value={filters.estado ?? ""}
          onChange={(e) => setParams({ estado: e.target.value || undefined })}
        >
          <option value="">Todo estado</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {ESTADO_LABEL[s]}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="inv-toolbar__clear"
            onClick={() =>
              setParams({ q: undefined, ubicacion: undefined, estado: undefined })
            }
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="tablewrap">
        <div className="tablewrap__scroll">
          <table className="dtable">
            <thead>
              <tr>
                <th className="dtable__num">
                  <SortHdr label="Código" k="codigo" sort={initial.sort} dir={initial.dir} onSort={toggleSort} />
                </th>
                <th>
                  <SortHdr label="Bien" k="nombre" sort={initial.sort} dir={initial.dir} onSort={toggleSort} />
                </th>
                <th>
                  <SortHdr label="Ubicación" k="ubicacion" sort={initial.sort} dir={initial.dir} onSort={toggleSort} />
                </th>
                <th className="dtable__num">
                  <SortHdr label="Cantidad" k="cantidad" sort={initial.sort} dir={initial.dir} onSort={toggleSort} />
                </th>
                <th>
                  <SortHdr label="Estado" k="estado" sort={initial.sort} dir={initial.dir} onSort={toggleSort} />
                </th>
                <th className="dtable__settings" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr className="dtable__empty">
                  <td colSpan={6}>
                    <div className="empty">
                      <Icon name="rules" size={32} />
                      <h3>Sin bienes</h3>
                      <p>
                        {hasFilters
                          ? "Ningún bien coincide con los filtros."
                          : "Aún no hay bienes registrados."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((b) => (
                  <tr key={b.id}>
                    <td className="dtable__muted">{b.codigo}</td>
                    <td>
                      {perms.canWrite ? (
                        <button className="rowlink" onClick={() => setEditBien(b)}>
                          {b.nombre}
                        </button>
                      ) : (
                        b.nombre
                      )}
                      {b.marcaModelo && <div className="inv-sub">{b.marcaModelo}</div>}
                    </td>
                    <td>
                      <span className="badge badge--neutral">
                        {UBICACION_LABEL[b.ubicacion]}
                      </span>
                    </td>
                    <td className="dtable__num">
                      <b>{b.cantidad}</b>
                      <span className="inv-unit">{b.unidad}</span>
                    </td>
                    <td>
                      <EstadoBienBadge estado={b.estado} />
                    </td>
                    <td className="dtable__settings">
                      <div className="inv-actions">
                        {perms.canMove && (
                          <button
                            className="btn btn--ghost inv-btn-sm"
                            onClick={() => setMovBien(b)}
                          >
                            Movimiento
                          </button>
                        )}
                        <button
                          className="iconbtn iconbtn--small"
                          title="Historial de stock"
                          aria-label="Historial de stock"
                          onClick={() => setHistBien(b)}
                        >
                          <Icon name="clock" size={18} />
                        </button>
                        {perms.canDelete && (
                          <button
                            className="iconbtn iconbtn--small"
                            title="Eliminar"
                            aria-label="Eliminar"
                            onClick={() => setDelBien(b)}
                          >
                            <Icon name="trash" size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        total={initial.total}
        page={initial.page}
        pageSize={initial.pageSize}
        pending={pending}
        noun="ítem"
        onPage={(p) => setParams({ page: String(p) }, false)}
        onPageSize={(s) => setParams({ size: String(s) })}
      />

      {createOpen && (
        <CreateBienModal onClose={() => setCreateOpen(false)} onSaved={afterMutation} />
      )}
      {editBien && (
        <CreateBienModal
          bien={editBien}
          onClose={() => setEditBien(null)}
          onSaved={afterMutation}
        />
      )}
      {movBien && (
        <MovimientoBienModal
          bien={movBien}
          onClose={() => setMovBien(null)}
          onSaved={afterMutation}
        />
      )}
      {histBien && (
        <HistorialBienModal bien={histBien} onClose={() => setHistBien(null)} />
      )}
      {delBien && (
        <ConfirmDelete
          bien={delBien}
          onClose={() => setDelBien(null)}
          onDeleted={() => {
            setDelBien(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SortHdr({
  label,
  k,
  sort,
  dir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sort === k;
  return (
    <button
      type="button"
      className={`sorthdr ${active ? "is-active" : ""}`}
      onClick={() => onSort(k)}
    >
      {label}
      <Icon
        name={active && dir === "desc" ? "sort-desc" : "sort-asc"}
        size={14}
        className="sorthdr__icon"
      />
    </button>
  );
}

function ConfirmDelete({
  bien,
  onClose,
  onDeleted,
}: {
  bien: BienRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEscClose(true, onClose, busy);

  async function confirm() {
    setBusy(true);
    const res = await deleteBien(bien.id);
    if (!res.ok) {
      toast.error(res.error);
      setBusy(false);
      return;
    }
    toast.success("Bien eliminado.");
    onDeleted();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2>Eliminar bien</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal__body">
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            ¿Eliminar <b>{bien.nombre}</b> ({bien.codigo})? Se borrará también su
            historial de movimientos. Esta acción no se puede deshacer.
          </p>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            style={{ background: "#d93025" }}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Eliminando…" : "Eliminar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
