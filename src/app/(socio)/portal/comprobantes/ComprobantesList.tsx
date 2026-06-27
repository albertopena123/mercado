"use client";

import Link from "next/link";
import { formatSoles } from "@/lib/money";
import { fechaTS } from "@/lib/fecha";
import { Icon } from "@/components/admin/Icon";
import type { MiComprobante } from "@/lib/portal/data";
import {
  useListing,
  Toolbar,
  SearchBox,
  FilterSelect,
  Pager,
} from "@/components/socio/listing";

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  yape: "Yape / Plin",
  "yape/plin": "Yape / Plin",
  deposito: "Depósito",
  otro: "Otro",
};
function metodoLabel(m: string | null): string {
  return METODO_LABEL[(m || "").toLowerCase()] ?? m ?? "—";
}

export function ComprobantesList({ items }: { items: MiComprobante[] }) {
  const L = useListing(items, {
    pageSize: 8,
    searchText: (c) => `${c.folio} ${c.detalle} ${metodoLabel(c.metodoPago)}`,
    filters: [
      { key: "estado", match: (c, v) => (v === "anulado" ? c.anulada : !c.anulada) },
    ],
  });

  return (
    <>
      <Toolbar>
        <SearchBox
          value={L.query}
          onChange={L.setQuery}
          placeholder="Buscar por N.° de recibo o detalle..."
        />
        <FilterSelect
          ariaLabel="Filtrar por estado"
          value={L.values.estado ?? ""}
          onChange={(v) => L.setFilter("estado", v)}
          options={[
            { value: "", label: "Vigentes y anulados" },
            { value: "vigente", label: "Solo vigentes" },
            { value: "anulado", label: "Solo anulados" },
          ]}
        />
      </Toolbar>

      {L.rawTotal === 0 ? (
        <p className="pt-empty">Aún no tienes comprobantes de pago.</p>
      ) : L.total === 0 ? (
        <p className="pt-empty">No se encontraron comprobantes con esos filtros.</p>
      ) : (
        <>
          <div className="pt-list">
            {L.pageItems.map((c) => (
              <Link
                key={c.id}
                href={`/portal/comprobantes/${c.id}`}
                className="pt-row"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="pt-row__main">
                  <div className="pt-row__title">
                    Recibo N.° {c.folio}
                    {c.anulada ? " · anulado" : ""}
                  </div>
                  <div className="pt-row__sub">
                    {fechaTS(c.emitidoEn)} · {metodoLabel(c.metodoPago)}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "right",
                  }}
                >
                  <span className="pt-row__amount">{formatSoles(c.monto)}</span>
                  <Icon name="chevron-right" size={16} />
                </div>
              </Link>
            ))}
          </div>
          <Pager
            page={L.page}
            totalPages={L.totalPages}
            from={L.from}
            to={L.to}
            total={L.total}
            noun="comprobantes"
            onPage={L.setPage}
          />
        </>
      )}
    </>
  );
}
