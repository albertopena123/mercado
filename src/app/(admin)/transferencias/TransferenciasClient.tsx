"use client";

import "../socios/socios.css";
import "./transferencias.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { formatSoles } from "@/lib/money";
import { fechaCorta } from "@/lib/fecha";
import { CreateTransferenciaModal } from "./CreateTransferenciaModal";
import type { ListTransferenciasResult, PermFlags } from "./types";
import type { EstadoTransferencia } from "@/generated/prisma/client";

const ESTADO_LABEL: Record<EstadoTransferencia, string> = {
  borrador: "Borrador",
  completada: "Completada",
  anulada: "Anulada",
};

const FILTROS: { v: "" | EstadoTransferencia; label: string }[] = [
  { v: "", label: "Todas" },
  { v: "borrador", label: "Borrador" },
  { v: "completada", label: "Completada" },
  { v: "anulada", label: "Anulada" },
];

function iniciales(nombre: string): string {
  const [apellidos, nombres] = nombre.split(",").map((s) => s.trim());
  const a = apellidos?.[0] ?? nombre[0] ?? "";
  const n = nombres?.[0] ?? "";
  return (a + n).toUpperCase() || "—";
}

export function TransferenciasClient({
  initial,
  stats,
  perms,
  filters,
}: {
  initial: ListTransferenciasResult;
  stats: { total: number; borrador: number; completada: number; anulada: number };
  perms: PermFlags;
  filters: { q: string; estado?: EstadoTransferencia };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [creating, setCreating] = useState(false);

  function updateParam(
    entries: Record<string, string | undefined>,
    resetPage = true,
  ) {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(entries)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (resetPage) p.delete("page");
    startTransition(() => router.push(`/transferencias?${p.toString()}`));
  }

  const filtrando = !!(filters.q || filters.estado);

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Transferencias de puesto</h1>
          <span className="socios-page__sub">
            Traspaso de un puesto del socio actual a un nuevo dueño
          </span>
        </div>
        {perms.canWrite && (
          <button className="btn btn--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            <span>Nueva transferencia</span>
          </button>
        )}
      </header>

      <div className="tr-stats">
        <div className="tr-stat">
          <div className="tr-stat__n">{stats.total}</div>
          <div className="tr-stat__l">Total</div>
        </div>
        <div className="tr-stat tr-stat--borrador">
          <div className="tr-stat__n">{stats.borrador}</div>
          <div className="tr-stat__l">En trámite</div>
        </div>
        <div className="tr-stat tr-stat--completada">
          <div className="tr-stat__n">{stats.completada}</div>
          <div className="tr-stat__l">Completadas</div>
        </div>
      </div>

      <div className="tr-toolbar">
        <form
          className="tr-search"
          onSubmit={(e) => {
            e.preventDefault();
            updateParam({ q: q.trim() || undefined });
          }}
        >
          <Icon name="search" size={16} />
          <input
            placeholder="Buscar por código, socio, adquiriente o puesto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <div className="tr-seg" role="tablist" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button
              key={f.v || "all"}
              type="button"
              className={(filters.estado ?? "") === f.v ? "is-on" : ""}
              onClick={() => updateParam({ estado: f.v || undefined })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {initial.items.length === 0 ? (
        <div className="tr-empty">
          <span className="tr-empty__icon">
            <Icon name="external" size={26} />
          </span>
          {filtrando ? (
            <>
              <h3>Sin resultados</h3>
              <p>Ninguna transferencia coincide con la búsqueda o el filtro.</p>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setQ("");
                  startTransition(() => router.push("/transferencias"));
                }}
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <h3>Aún no hay transferencias</h3>
              <p>
                Registra el traspaso de un puesto: eliges al socio y su puesto,
                cargas al nuevo dueño y generas el contrato.
              </p>
              {perms.canWrite && (
                <button
                  className="btn btn--primary"
                  onClick={() => setCreating(true)}
                >
                  <Icon name="plus" size={16} />
                  <span>Nueva transferencia</span>
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="tr-list">
            {initial.items.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tr-row"
                onClick={() => router.push(`/transferencias/${t.id}`)}
              >
                <span className="tr-row__top">
                  <span className="tr-code">{t.codigo}</span>
                  <span className="tr-row__date">{fechaCorta(t.fecha)}</span>
                  <span className={`tr-pill tr-pill--${t.estado}`}>
                    <span className="tr-pill__dot" />
                    {ESTADO_LABEL[t.estado]}
                  </span>
                  {t.monto != null && (
                    <span className="tr-row__monto">{formatSoles(t.monto)}</span>
                  )}
                </span>

                <span className="tr-flow">
                  <span className="tr-party">
                    <span className="tr-ava tr-ava--from">
                      {iniciales(t.transferenteNombre)}
                    </span>
                    <span className="tr-party__txt">
                      <span className="tr-party__name">
                        {t.transferenteNombre}
                      </span>
                      <span className="tr-party__role">
                        Transferente · {t.transferenteCodigo}
                      </span>
                    </span>
                  </span>

                  <span className="tr-conn">
                    <span className="tr-conn__puesto">{t.puestoCodigo}</span>
                    <Icon name="chevron-right" size={18} className="tr-conn__arrow" />
                  </span>

                  <span className="tr-party tr-party--to">
                    <span className="tr-ava tr-ava--to">
                      {iniciales(t.adquirienteNombre)}
                    </span>
                    <span className="tr-party__txt">
                      <span className="tr-party__name">
                        {t.adquirienteNombre}
                      </span>
                      <span className="tr-party__role">Adquiriente</span>
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <Pagination
            total={initial.total}
            page={initial.page}
            pageSize={initial.pageSize}
            pending={pending}
            noun="transferencia"
            onPage={(p) => updateParam({ page: String(p) }, false)}
            onPageSize={(s) => updateParam({ size: String(s) })}
          />
        </>
      )}

      {creating && (
        <CreateTransferenciaModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`/transferencias/${id}`);
          }}
        />
      )}
    </div>
  );
}
