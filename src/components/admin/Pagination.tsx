"use client";

import { Icon } from "./Icon";

/**
 * Paginación compartida para los módulos de registro (socios, puestos,
 * cuotas, asambleas). Presentacional: recibe el estado y dos callbacks; cada
 * vista las conecta a su manejo de searchParams.
 */
export function Pagination({
  total,
  page,
  pageSize,
  pending = false,
  noun = "registro",
  pageSizes = [25, 50, 100],
  onPage,
  onPageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
  pending?: boolean;
  noun?: string;
  pageSizes?: number[];
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <div className="pagination__info">
        Mostrando <b>{from}–{to}</b> de <b>{total}</b>{" "}
        {total === 1 ? noun : `${noun}s`}
      </div>
      <div className="pagination__controls">
        <label className="pagination__size">
          <span>Por página</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            disabled={pending}
          >
            {pageSizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="pagination__nav">
          <button
            type="button"
            onClick={() => onPage(1)}
            disabled={pending || page <= 1}
            aria-label="Primera página"
            title="Primera"
          >
            <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} />
            <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)", marginLeft: -10 }} />
          </button>
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={pending || page <= 1}
            aria-label="Página anterior"
          >
            <Icon name="chevron-right" size={16} style={{ transform: "rotate(180deg)" }} />
          </button>
          <span className="pagination__page">
            {page} <span>/ {totalPages}</span>
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={pending || page >= totalPages}
            aria-label="Página siguiente"
          >
            <Icon name="chevron-right" size={16} />
          </button>
          <button
            type="button"
            onClick={() => onPage(totalPages)}
            disabled={pending || page >= totalPages}
            aria-label="Última página"
            title="Última"
          >
            <Icon name="chevron-right" size={14} />
            <Icon name="chevron-right" size={14} style={{ marginLeft: -10 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
