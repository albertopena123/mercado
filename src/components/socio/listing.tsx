"use client";

// Primitivas reutilizables para los listados del portal: búsqueda + filtros +
// paginación, todo en cliente. Los datos por socio son pocos (decenas a unos
// cientos de filas) así que filtrar/paginar en memoria es instantáneo y no
// necesita ida y vuelta al servidor ni parámetros en la URL.

import {
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/admin/Icon";

export type ListingFilter<T> = {
  key: string;
  match: (item: T, value: string) => boolean;
};

export function useListing<T>(
  items: T[],
  opts: {
    searchText?: (item: T) => string;
    filters?: ListingFilter<T>[];
    pageSize?: number;
  } = {},
) {
  const { searchText, filters, pageSize = 8 } = opts;
  const [query, setQueryRaw] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  // Buscar o filtrar siempre vuelve a la primera página. Se hace en los
  // handlers (no en un efecto) para evitar renders en cascada.
  function setQuery(v: string) {
    setQueryRaw(v);
    setPage(1);
  }
  function setFilter(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (
        needle &&
        searchText &&
        !searchText(item).toLowerCase().includes(needle)
      )
        return false;
      if (filters) {
        for (const f of filters) {
          const v = values[f.key];
          if (v && !f.match(item, v)) return false;
        }
      }
      return true;
    });
  }, [items, query, values, filters, searchText]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const pageItems = filtered.slice((current - 1) * pageSize, current * pageSize);

  return {
    query,
    setQuery,
    values,
    setFilter,
    page: current,
    setPage,
    pageItems,
    total,
    rawTotal: items.length,
    totalPages,
    from,
    to,
  };
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="pt-toolbar">{children}</div>;
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="pt-search">
      <Icon name="search" size={17} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Buscar..."}
        aria-label={placeholder ?? "Buscar"}
      />
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <select
      className="pt-select"
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Pager({
  page,
  totalPages,
  from,
  to,
  total,
  noun,
  onPage,
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  noun: string;
  onPage: (p: number) => void;
}) {
  return (
    <div className="pt-pager">
      <span className="pt-pager__info">
        {from}–{to} de {total} {noun}
      </span>
      {totalPages > 1 && (
        <div className="pt-pager__nav">
          <button
            type="button"
            className="pt-pager__btn"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
          >
            <Icon
              name="chevron-right"
              size={15}
              style={{ transform: "rotate(180deg)" }}
            />
            <span>Anterior</span>
          </button>
          <span className="pt-pager__page">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="pt-pager__btn"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            aria-label="Página siguiente"
          >
            <span>Siguiente</span>
            <Icon name="chevron-right" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
