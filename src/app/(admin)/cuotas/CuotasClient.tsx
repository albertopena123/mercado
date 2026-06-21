"use client";

import "../socios/socios.css";
import "./cuotas.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import { fechaCorta } from "@/lib/fecha";
import { esAutovaluo } from "@/lib/cuotas/autovaluo";
import { GenerarCuotasModal } from "./GenerarCuotasModal";
import { RegistrarPagoModal } from "./RegistrarPagoModal";
import { PagarSeleccionModal } from "./PagarSeleccionModal";
import { AplicarDeudaModal } from "./AplicarDeudaModal";
import { ConfirmDialog } from "../socios/ConfirmDialog";
import { anularCuota } from "./actions";
import type {
  CuotaRow,
  ListCuotasResult,
  PermFlags,
  CuotaStats,
} from "./types";
import type { EstadoCuota } from "@/generated/prisma/client";

const ESTADO_LABEL: Record<EstadoCuota, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
};

export function CuotasClient({
  initial,
  stats,
  perms,
  filters,
}: {
  initial: ListCuotasResult;
  stats: CuotaStats;
  perms: PermFlags;
  filters: { q: string; estado?: EstadoCuota; periodo: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [generarOpen, setGenerarOpen] = useState(false);
  const [aplicarOpen, setAplicarOpen] = useState(false);
  const [pagar, setPagar] = useState<CuotaRow | null>(null);
  const [confirmAnular, setConfirmAnular] = useState<CuotaRow | null>(null);
  // Selección múltiple para pago combinado: se ancla a UN socio (un comprobante
  // por socio). Las filas de otros socios y los autovalúos quedan deshabilitados.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pagarSelOpen, setPagarSelOpen] = useState(false);

  // Filas seleccionadas presentes en la página actual. Se exige pendiente y
  // no-autovalúo: si una cuota seleccionada se pagó/anuló por otro flujo (pago
  // individual, anular, pago por monto), un refresh la trae con otro estado y
  // aquí desaparece sola de la barra y del total (sin depender de limpiar el Set).
  const selectedRows = useMemo(
    () =>
      initial.items.filter(
        (c) =>
          selected.has(c.id) &&
          c.estado === "pendiente" &&
          !esAutovaluo(c.concepto),
      ),
    [initial.items, selected],
  );
  const lockedSocioId = selectedRows[0]?.socioId ?? null;
  const selTotal = useMemo(
    () =>
      Math.round(selectedRows.reduce((a, c) => a + c.monto, 0) * 100) / 100,
    [selectedRows],
  );

  function toggleSelect(c: CuotaRow) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
  }

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
    // Navegar cambia las filas visibles: descarta la selección de pago en curso.
    setSelected(new Set());
    startTransition(() => router.push(`/cuotas?${p.toString()}`));
  };

  function onAnular(c: CuotaRow) {
    startTransition(async () => {
      const r = await anularCuota(c.id);
      if (r.ok) toast.success("Cuota anulada.");
      else toast.error(r.error);
      setSelected(new Set());
      router.refresh();
    });
  }

  const hasFilters = !!(filters.q || filters.estado || filters.periodo);

  const statCards = [
    {
      label: "Por cobrar",
      value: formatSoles(stats.pendienteMonto),
      tone: "amber",
    },
    {
      label: "Cuotas pendientes",
      value: String(stats.pendienteCount),
      tone: "neutral",
    },
    {
      label: "Socios con deuda",
      value: String(stats.sociosConDeuda),
      tone: "red",
    },
    {
      label: "Recaudado",
      value: formatSoles(stats.recaudadoMonto),
      tone: "green",
    },
  ];

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Cuotas y deuda</h1>
          <span className="socios-page__sub">
            {initial.total} {initial.total === 1 ? "cuota" : "cuotas"}
            {hasFilters && " (con filtros)"}
            {pending && (
              <span style={{ marginLeft: 10, color: "var(--accent)" }}>
                · actualizando…
              </span>
            )}
          </span>
        </div>
        {perms.canWrite && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn--ghost"
              onClick={() => setAplicarOpen(true)}
            >
              <Icon name="card" size={16} />
              <span>Aplicar deuda a socios</span>
            </button>
            <button className="btn--cta" onClick={() => setGenerarOpen(true)}>
              <Icon name="plus" size={16} />
              <span>Generar cuotas del mes</span>
            </button>
          </div>
        )}
      </header>

      <div className="soc-stats">
        {statCards.map((c) => (
          <div key={c.label} className={`soc-stat soc-stat--${c.tone}`}>
            <span className="soc-stat__dot" aria-hidden />
            <span className="soc-stat__body">
              <span className="soc-stat__value" style={{ fontSize: 18 }}>
                {c.value}
              </span>
              <span className="soc-stat__label">{c.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="socios-toolbar">
        <input
          key={`q-${filters.q ?? ""}`}
          className="socios-toolbar__search"
          placeholder="Buscar socio por nombre, DNI o código…"
          defaultValue={filters.q}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              updateParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <input
          key={`periodo-${filters.periodo ?? ""}`}
          className="socios-toolbar__select"
          placeholder="Periodo AAAA-MM"
          defaultValue={filters.periodo}
          style={{ maxWidth: 150 }}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              updateParam({ periodo: (e.target as HTMLInputElement).value });
          }}
        />
        <select
          className="socios-toolbar__select"
          value={filters.estado ?? ""}
          onChange={(e) => updateParam({ estado: e.target.value || undefined })}
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagada">Pagada</option>
          <option value="anulada">Anulada</option>
        </select>
      </div>

      {selectedRows.length > 0 && (
        <div className="cuo-selbar" role="region" aria-label="Pago de cuotas seleccionadas">
          <div className="cuo-selbar__info">
            <b>{selectedRows.length}</b> cuota(s) de{" "}
            <b>{selectedRows[0]?.socioNombre}</b> · Total{" "}
            <b>{formatSoles(selTotal)}</b>
          </div>
          <div className="cuo-selbar__actions">
            <button
              className="btn btn--ghost"
              onClick={() => setSelected(new Set())}
            >
              Quitar selección
            </button>
            <button
              className="btn btn--primary"
              onClick={() => setPagarSelOpen(true)}
            >
              Pagar seleccionadas
            </button>
          </div>
        </div>
      )}

      {initial.items.length === 0 ? (
        <div className="socios-empty">
          {hasFilters ? (
            <>
              <p>No se encontraron cuotas con esos criterios.</p>
              <button
                className="btn btn--ghost"
                onClick={() =>
                  updateParam({
                    q: undefined,
                    estado: undefined,
                    periodo: undefined,
                  })
                }
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <p>Aún no se han generado cuotas.</p>
              {perms.canWrite && (
                <button
                  className="btn--cta"
                  onClick={() => setGenerarOpen(true)}
                >
                  <Icon name="plus" size={16} />
                  <span>Generar cuotas del mes</span>
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
                {perms.canPay && (
                  <th style={{ width: 36 }}>
                    <span className="soc-th" style={{ cursor: "default" }} aria-label="Seleccionar" />
                  </th>
                )}
                <th><span className="soc-th" style={{ cursor: "default" }}>Periodo</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Socio</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Concepto</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Monto</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Estado</span></th>
                <th><span className="soc-th" style={{ cursor: "default" }}>Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((c) => (
                <tr key={c.id} className={selected.has(c.id) ? "is-selected" : undefined}>
                  {perms.canPay && (
                    <td style={{ width: 36, textAlign: "center" }}>
                      {c.estado === "pendiente" && !esAutovaluo(c.concepto) ? (
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          disabled={lockedSocioId !== null && c.socioId !== lockedSocioId}
                          onChange={() => toggleSelect(c)}
                          aria-label={`Seleccionar cuota ${c.periodo} de ${c.socioNombre}`}
                          title={
                            lockedSocioId !== null && c.socioId !== lockedSocioId
                              ? "Solo puedes pagar cuotas de un socio a la vez"
                              : undefined
                          }
                        />
                      ) : c.estado === "pendiente" && esAutovaluo(c.concepto) ? (
                        <span
                          title="El autovalúo se paga individualmente con «Pagar» (su N.° de recibo)"
                          style={{ color: "var(--text-muted)", display: "inline-flex" }}
                        >
                          <Icon name="lock" size={14} />
                        </span>
                      ) : null}
                    </td>
                  )}
                  <td data-label="Periodo">
                    <span className="soc-codigo">{c.periodo}</span>
                  </td>
                  <td data-label="Socio">
                    <div className="soc-namecell__text">{c.socioNombre}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {c.socioCodigo}
                    </div>
                  </td>
                  <td data-label="Concepto">{c.concepto}</td>
                  <td data-label="Monto">
                    <span className="cuo-monto">{formatSoles(c.monto)}</span>
                  </td>
                  <td data-label="Estado">
                    <span className={`cuo-badge cuo-badge--${c.estado}`}>
                      {ESTADO_LABEL[c.estado]}
                    </span>
                  </td>
                  <td>
                    <div className="cuo-actions">
                      {c.estado === "pendiente" && perms.canPay && (
                        <button
                          className="btn btn--primary"
                          onClick={() => setPagar(c)}
                        >
                          Pagar
                        </button>
                      )}
                      {c.estado === "pendiente" && perms.canWrite && (
                        <button
                          className="btn btn--ghost"
                          onClick={() => setConfirmAnular(c)}
                        >
                          Anular
                        </button>
                      )}
                      {c.estado === "pagada" && (
                        <span
                          style={{ fontSize: 12, color: "var(--text-muted)" }}
                        >
                          {c.pagadoEn
                            ? fechaCorta(c.pagadoEn)
                            : ""}
                          {c.metodoPago ? ` · ${c.metodoPago}` : ""}
                        </span>
                      )}
                    </div>
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
            noun="cuota"
            onPage={(p) => updateParam({ page: String(p) }, false)}
            onPageSize={(s) => updateParam({ size: String(s) })}
          />
        </>
      )}

      {generarOpen && (
        <GenerarCuotasModal
          onClose={() => setGenerarOpen(false)}
          onDone={() => {
            setGenerarOpen(false);
            toast.success("Cuotas generadas para el periodo.");
            router.refresh();
          }}
        />
      )}

      {aplicarOpen && (
        <AplicarDeudaModal
          onClose={() => setAplicarOpen(false)}
          onDone={(msg) => {
            setAplicarOpen(false);
            toast.success(msg);
            router.refresh();
          }}
        />
      )}

      {pagarSelOpen && lockedSocioId && (
        <PagarSeleccionModal
          socioId={lockedSocioId}
          socioNombre={selectedRows[0]?.socioNombre ?? ""}
          cuotas={selectedRows.map((c) => ({
            id: c.id,
            periodo: c.periodo,
            concepto: c.concepto,
            monto: c.monto,
          }))}
          onClose={() => setPagarSelOpen(false)}
          onDone={(msg) => {
            setPagarSelOpen(false);
            setSelected(new Set());
            toast.success(msg);
            router.refresh();
          }}
        />
      )}

      {pagar && (
        <RegistrarPagoModal
          cuota={pagar}
          onClose={() => setPagar(null)}
          onDone={() => {
            setPagar(null);
            setSelected(new Set());
            toast.success("Pago registrado.");
            router.refresh();
          }}
        />
      )}

      {confirmAnular && (
        <ConfirmDialog
          title="Anular cuota"
          description={`¿Anular la cuota ${confirmAnular.periodo} de ${confirmAnular.socioNombre}? Esta acción no se puede deshacer.`}
          confirmLabel="Anular"
          tone="danger"
          onConfirm={() => {
            onAnular(confirmAnular);
            setConfirmAnular(null);
          }}
          onClose={() => setConfirmAnular(null)}
        />
      )}
    </div>
  );
}
