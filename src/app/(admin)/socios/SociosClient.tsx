"use client";

import "./socios.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import { avatarColor, initialsFor } from "@/lib/ui/avatar";
import { fechaCorta } from "@/lib/fecha";
import { esDocumentoPendiente } from "@/lib/socios/document";
import type { EstadoSocio, TipoDocumento } from "@/generated/prisma/client";
import { EstadoBadge } from "./EstadoBadge";
import { StatCards } from "./StatCards";
import { CreateSocioModal } from "./CreateSocioModal";
import { SocioDetailDrawer } from "./SocioDetailDrawer";
import { exportSociosXlsx } from "./actions";
import type {
  ListSociosResult,
  PermFlags,
  SocioStats,
  SortKey,
} from "./types";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "codigo", label: "Código" },
  { key: "documento", label: "Documento" },
  { key: "nombre", label: "Apellidos, Nombres" },
  { key: "ingreso", label: "Ingreso" },
  { key: "estado", label: "Estado" },
];

export function SociosClient({
  initial,
  stats,
  perms,
  filters,
  solicitudesPendientes,
  registrosPublicos,
}: {
  initial: ListSociosResult;
  stats: SocioStats;
  perms: PermFlags;
  filters: { q: string; estado?: EstadoSocio; tipoDocumento?: TipoDocumento };
  solicitudesPendientes?: number;
  registrosPublicos?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    // Limpia el aviso de error de exportación al cambiar de contexto (filtros,
    // búsqueda, paginación) para que no quede colgado fuera de su contexto.
    setExportError(null);
    startTransition(() => router.push(`/socios?${p.toString()}`));
  };

  const onSort = (key: SortKey) => {
    const nextDir =
      initial.sort === key && initial.dir === "asc" ? "desc" : "asc";
    updateParam({ sort: key, dir: nextDir }, false);
  };

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    const res = await exportSociosXlsx({
      q: filters.q || undefined,
      estado: filters.estado,
      tipoDocumento: filters.tipoDocumento,
    });
    setExporting(false);
    if (!res.ok) {
      setExportError(res.error);
      return;
    }
    // base64 → bytes → Blob .xlsx (Excel lo abre nativo, sin mojibake)
    const bin = atob(res.data!.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.data!.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Padrón exportado (${res.data!.count} socios).`);
  }

  const hasFilters = !!(
    filters.q ||
    filters.estado ||
    filters.tipoDocumento
  );

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Padrón de socios</h1>
          <span className="socios-page__sub">
            {initial.total} {initial.total === 1 ? "socio" : "socios"}
            {hasFilters && " (con filtros)"}
            {pending && (
              <span style={{ marginLeft: 10, color: "var(--accent)" }}>
                · actualizando…
              </span>
            )}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {perms.canWrite && (
            <Link href="/socios/solicitudes" className="btn btn--ghost sol-pendientes-link">
              Solicitudes
              {!!solicitudesPendientes && (
                <span className="badge badge--amber">{solicitudesPendientes}</span>
              )}
            </Link>
          )}
          {perms.canWrite && (
            <Link href="/socios/registros" className="btn btn--ghost reg-pendientes-link">
              Registros
              {!!registrosPublicos && (
                <span className="badge badge--amber">{registrosPublicos}</span>
              )}
            </Link>
          )}
          <button
            className="btn btn--ghost"
            onClick={handleExport}
            disabled={exporting || initial.total === 0}
            title="Descargar el padrón filtrado en Excel (.xlsx)"
          >
            <Icon name="download" size={16} />
            <span>{exporting ? "Generando…" : "Exportar"}</span>
          </button>
          {perms.canWrite && (
            <button className="btn--cta" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={16} />
              <span>Nuevo socio</span>
            </button>
          )}
        </div>
      </header>

      <StatCards
        stats={stats}
        activeEstado={filters.estado}
        onPick={(estado) => updateParam({ estado })}
      />

      <div className="socios-toolbar">
        <input
          className="socios-toolbar__search"
          placeholder="Buscar por código, DNI, nombre…"
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
          <option value="retirado">Retirado</option>
          <option value="fallecido">Fallecido</option>
        </select>
        <select
          className="socios-toolbar__select"
          value={filters.tipoDocumento ?? ""}
          onChange={(e) =>
            updateParam({ tipoDocumento: e.target.value || undefined })
          }
        >
          <option value="">Todos los documentos</option>
          <option value="DNI">DNI</option>
          <option value="CE">Carné de Extranjería</option>
          <option value="PASAPORTE">Pasaporte</option>
          <option value="RUC">RUC</option>
        </select>
      </div>

      {exportError && (
        <div className="soc-error" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="info" size={16} />
          <span>{exportError}</span>
        </div>
      )}

      {pending ? (
        <SkeletonTable />
      ) : initial.items.length === 0 ? (
        <div className="socios-empty">
          {hasFilters ? (
            <>
              <p>No se encontraron socios con esos criterios.</p>
              <button
                className="btn btn--ghost"
                onClick={() =>
                  updateParam({
                    q: undefined,
                    estado: undefined,
                    tipoDocumento: undefined,
                  })
                }
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <p>Aún no hay socios en el padrón.</p>
              {perms.canWrite && (
                <button
                  className="btn--cta"
                  onClick={() => setCreateOpen(true)}
                >
                  <Icon name="plus" size={16} />
                  <span>Crear primer socio</span>
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
                          className={isSorted ? "soc-th__icon" : "soc-th__icon soc-th__icon--idle"}
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {initial.items.map((s) => {
                const sinDni = esDocumentoPendiente(s.numeroDocumento);
                return (
                <tr
                  key={s.id}
                  className={sinDni ? "soc-row--sin-dni" : undefined}
                  onClick={() => setOpenId(s.id)}
                >
                  <td data-label="Código">
                    <span className="soc-codigo">{s.codigo}</span>
                    {s.numeroPadron != null && (
                      <span className="soc-codigo-padron">
                        Padrón {s.numeroPadron}
                      </span>
                    )}
                  </td>
                  <td data-label="Documento">
                    {sinDni ? (
                      <span
                        className="soc-sindni-chip"
                        title="Socio sin DNI registrado — pendiente de regularizar"
                      >
                        <Icon name="info" size={12} />
                        Sin DNI
                      </span>
                    ) : (
                      <>
                        <span className="soc-doc-type">{s.tipoDocumento}</span>{" "}
                        {s.numeroDocumento}
                      </>
                    )}
                  </td>
                  <td data-label="Socio">
                    <div className="soc-namecell">
                      <span
                        className="soc-rowavatar"
                        style={
                          s.fotoUrl
                            ? undefined
                            : { background: avatarColor(s.id) }
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
                        {s.apellidoPaterno} {s.apellidoMaterno ?? ""},{" "}
                        {s.nombres}
                      </span>
                    </div>
                  </td>
                  <td data-label="Ingreso">{fechaCorta(s.fechaIngreso)}</td>
                  <td data-label="Estado">
                    <EstadoBadge estado={s.estado} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            total={initial.total}
            page={initial.page}
            pageSize={initial.pageSize}
            pending={pending}
            noun="socio"
            onPage={(p) => updateParam({ page: String(p) }, false)}
            onPageSize={(s) => updateParam({ size: String(s) })}
          />
        </>
      )}

      {createOpen && (
        <CreateSocioModal
          canCreateUser={perms.canCreateUser}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setOpenId(id);
            toast.success("Socio registrado correctamente.");
            router.refresh();
          }}
        />
      )}

      {openId && (
        <SocioDetailDrawer
          socioId={openId}
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
          {COLUMNS.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 8 }).map((_, i) => (
          <tr key={i}>
            <td>
              <span className="sk sk--sm" />
            </td>
            <td>
              <span className="sk sk--md" />
            </td>
            <td>
              <div className="soc-namecell">
                <span className="sk sk--avatar" />
                <span className="sk sk--lg" />
              </div>
            </td>
            <td>
              <span className="sk sk--sm" />
            </td>
            <td>
              <span className="sk sk--badge" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
