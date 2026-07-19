"use client";

import { formatSoles } from "@/lib/money";
import { fechaCorta } from "@/lib/fecha";
import type { MiCuota } from "@/lib/portal/data";
import type { EstadoCuota } from "@/generated/prisma/client";
import {
  useListing,
  Toolbar,
  SearchBox,
  FilterSelect,
  Pager,
} from "@/components/socio/listing";

const ESTADO_CUOTA_LABEL: Record<EstadoCuota, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
  exonerada: "Exonerada",
};

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Set", "Oct", "Nov", "Dic",
];
function fmtPeriodo(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const mes = MESES[parseInt(m[2], 10) - 1] ?? m[2];
  return `${mes} ${m[1]}`;
}

export function CuotasList({ items }: { items: MiCuota[] }) {
  const L = useListing(items, {
    pageSize: 10,
    searchText: (c) => `${c.concepto} ${fmtPeriodo(c.periodo)} ${c.periodo}`,
    filters: [{ key: "estado", match: (c, v) => c.estado === v }],
  });

  return (
    <>
      <Toolbar>
        <SearchBox
          value={L.query}
          onChange={L.setQuery}
          placeholder="Buscar por concepto o periodo..."
        />
        <FilterSelect
          ariaLabel="Filtrar por estado"
          value={L.values.estado ?? ""}
          onChange={(v) => L.setFilter("estado", v)}
          options={[
            { value: "", label: "Todos los estados" },
            { value: "pendiente", label: "Pendiente" },
            { value: "pagada", label: "Pagada" },
            { value: "anulada", label: "Anulada" },
          ]}
        />
      </Toolbar>

      {L.rawTotal === 0 ? (
        <p className="pt-empty">No tienes cuotas registradas.</p>
      ) : L.total === 0 ? (
        <p className="pt-empty">No se encontraron cuotas con esos filtros.</p>
      ) : (
        <>
          <div className="pt-list">
            {L.pageItems.map((c) => (
              <div key={c.id} className="pt-row">
                <div className="pt-row__main">
                  <div className="pt-row__title">
                    {c.concepto || "Cuota"} · {fmtPeriodo(c.periodo)}
                  </div>
                  <div className="pt-row__sub">
                    {c.estado === "pagada" && c.pagadoEn
                      ? `Pagada el ${fechaCorta(c.pagadoEn)}`
                      : c.vencimiento
                        ? `Vence ${fechaCorta(c.vencimiento)}`
                        : "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="pt-row__amount">{formatSoles(c.monto)}</div>
                  <span className={`pt-badge pt-badge--${c.estado}`}>
                    {ESTADO_CUOTA_LABEL[c.estado]}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Pager
            page={L.page}
            totalPages={L.totalPages}
            from={L.from}
            to={L.to}
            total={L.total}
            noun="cuotas"
            onPage={L.setPage}
          />
        </>
      )}
    </>
  );
}
