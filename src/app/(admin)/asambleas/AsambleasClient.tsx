"use client";

import "../socios/socios.css";
import "./asambleas.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import { fechaTS } from "@/lib/fecha";
import { CreateAsambleaModal } from "./CreateAsambleaModal";
import type { ListAsambleasResult, PermFlags } from "./types";
import type { EstadoAsamblea } from "@/generated/prisma/client";

const ESTADO_LABEL: Record<string, string> = {
  programada: "Programada",
  en_curso: "En curso",
  cerrada: "Cerrada",
};

export function AsambleasClient({
  initial,
  perms,
  filters,
}: {
  initial: ListAsambleasResult;
  perms: PermFlags;
  filters: { q: string; estado?: EstadoAsamblea };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
    startTransition(() => router.push(`/asambleas?${p.toString()}`));
  };

  const hasFilters = !!(filters.q || filters.estado);

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Asambleas</h1>
          <span className="socios-page__sub">
            {initial.total} {initial.total === 1 ? "asamblea" : "asambleas"}
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
            <span>Nueva asamblea</span>
          </button>
        )}
      </header>

      <div className="socios-toolbar">
        <input
          key={`q-${filters.q ?? ""}`}
          ref={searchRef}
          className="socios-toolbar__search"
          placeholder="Buscar por título…"
          defaultValue={filters.q}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              updateParam({
                q: (e.target as HTMLInputElement).value || undefined,
              });
          }}
        />
        <select
          className="socios-toolbar__select"
          value={filters.estado ?? ""}
          onChange={(e) =>
            updateParam({
              estado: e.target.value || undefined,
              q: searchRef.current?.value || undefined,
            })
          }
        >
          <option value="">Todos los estados</option>
          <option value="programada">Programada</option>
          <option value="en_curso">En curso</option>
          <option value="cerrada">Cerrada</option>
        </select>
      </div>

      {pending ? (
        <SkeletonTable />
      ) : initial.items.length === 0 ? (
        <div className="socios-empty">
          {hasFilters ? (
            <>
              <p>No se encontraron asambleas con esos criterios.</p>
              <button
                className="btn btn--ghost"
                onClick={() => updateParam({ q: undefined, estado: undefined })}
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <p>Aún no hay asambleas registradas.</p>
              {perms.canWrite && (
                <button className="btn--cta" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" size={16} />
                  <span>Crear primera asamblea</span>
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
                <th><span className="soc-th" style={{ cursor: "default" }}>Fecha</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Título</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Tipo</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Asistencia</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Estado</span></th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((a) => {
                const pct =
                  a.total > 0 ? Math.round((a.asistieron / a.total) * 100) : 0;
                return (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/asambleas/${a.id}`)}
                  >
                    <td>
                      <span className="soc-codigo">
                        {fechaTS(a.fecha)}
                      </span>
                    </td>
                    <td>{a.titulo}</td>
                    <td>
                      <span className="asm-tipo">{a.tipo}</span>
                    </td>
                    <td>
                      {a.asistieron}/{a.total} ({pct}%)
                      {a.quorumMinimo != null && (
                        <span
                          style={{
                            marginLeft: 6,
                            color:
                              pct >= a.quorumMinimo ? "#16a34a" : "#d97706",
                            fontWeight: 600,
                          }}
                        >
                          {pct >= a.quorumMinimo ? "✓ quórum" : "sin quórum"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`asm-badge asm-badge--${a.estado}`}>
                        {ESTADO_LABEL[a.estado]}
                      </span>
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
            noun="asamblea"
            onPage={(p) => updateParam({ page: String(p) }, false)}
            onPageSize={(s) => updateParam({ size: String(s) })}
          />
        </>
      )}

      {createOpen && (
        <CreateAsambleaModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            toast.success("Asamblea creada. Lista de asistencia generada.");
            router.push(`/asambleas/${id}`);
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
          {["Fecha", "Título", "Tipo", "Asistencia", "Estado"].map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 6 }).map((_, i) => (
          <tr key={i}>
            <td><span className="sk sk--sm" /></td>
            <td><span className="sk sk--lg" /></td>
            <td><span className="sk sk--sm" /></td>
            <td><span className="sk sk--md" /></td>
            <td><span className="sk sk--badge" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
