"use client";

import "../socios/socios.css";
import "./guardiania.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import { RegistrarPagoModal } from "./RegistrarPagoModal";
import { GenerarCargosModal } from "./GenerarCargosModal";
import { deletePago } from "./actions";
import type {
  ListPagosResult,
  GuardianiaStats,
  DeudaResult,
  PermFlags,
  IngresoMes,
} from "./types";

type Tab = "ingresos" | "recibos" | "deudas";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const mesCorto = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
const mesLargo = (mes: string) => `${mesCorto(mes)} ${mes.slice(0, 4)}`;
const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

const pad2 = (n: number) => String(n).padStart(2, "0");
const toYmd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const rangeThisMonth = () => {
  const n = new Date();
  return { desde: toYmd(new Date(n.getFullYear(), n.getMonth(), 1)), hasta: toYmd(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
};
const rangeLastMonth = () => {
  const n = new Date();
  return { desde: toYmd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), hasta: toYmd(new Date(n.getFullYear(), n.getMonth(), 0)) };
};
const rangeThisYear = () => {
  const y = new Date().getFullYear();
  return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
};

export function GuardianiaClient({
  tab,
  pagos,
  stats,
  deudas,
  perms,
  filters,
}: {
  tab: Tab;
  pagos: ListPagosResult;
  stats: GuardianiaStats;
  deudas: DeudaResult;
  perms: PermFlags;
  filters: { q: string; periodo: string; desde: string; hasta: string; bloque: string; morosos: boolean };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [cargosOpen, setCargosOpen] = useState(false);
  const [modo, setModo] = useState<"cobro" | "cubierto">("cobro");
  const [q, setQ] = useState(filters.q);
  const [showCustom, setShowCustom] = useState(false);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!qTimer.current) setQ(filters.q);
  }, [filters.q]);

  const updateParam = (entries: Record<string, string | undefined>, resetPage = true) => {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(entries)) {
      if (v && v !== "") p.set(k, v);
      else p.delete(k);
    }
    if (resetPage) p.delete("page");
    startTransition(() => router.push(`/guardiania?${p.toString()}`));
  };
  const goTab = (t: Tab) => updateParam({ tab: t === "ingresos" ? undefined : t }, false);

  const onSearch = (val: string) => {
    setQ(val);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      qTimer.current = null;
      updateParam({ q: val.trim() || undefined });
    }, 350);
  };
  const clearSearch = () => {
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = null;
    setQ("");
    updateParam({ q: undefined });
  };
  const cobroPreset = useMemo<"todo" | "mes" | "pasado" | "anio" | "custom">(() => {
    if (!filters.desde && !filters.hasta) return "todo";
    const m = rangeThisMonth(), l = rangeLastMonth(), y = rangeThisYear();
    if (filters.desde === m.desde && filters.hasta === m.hasta) return "mes";
    if (filters.desde === l.desde && filters.hasta === l.hasta) return "pasado";
    if (filters.desde === y.desde && filters.hasta === y.hasta) return "anio";
    return "custom";
  }, [filters.desde, filters.hasta]);
  const setCobro = (p: "todo" | "mes" | "pasado" | "anio") => {
    setShowCustom(false);
    if (p === "todo") return updateParam({ desde: undefined, hasta: undefined });
    const r = p === "mes" ? rangeThisMonth() : p === "pasado" ? rangeLastMonth() : rangeThisYear();
    updateParam({ desde: r.desde, hasta: r.hasta });
  };
  const cobroLabel =
    cobroPreset === "mes" ? "este mes"
    : cobroPreset === "pasado" ? "mes pasado"
    : cobroPreset === "anio" ? "este año"
    : [filters.desde && fmtFecha(filters.desde), filters.hasta && fmtFecha(filters.hasta)].filter(Boolean).join(" – ");
  const clearAll = () => {
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = null;
    setQ("");
    setShowCustom(false);
    updateParam({ q: undefined, periodo: undefined, desde: undefined, hasta: undefined });
  };

  const serie: IngresoMes[] = modo === "cobro" ? stats.porMesCobro : stats.porMesCubierto;
  const maxMonto = useMemo(() => Math.max(1, ...serie.map((s) => s.monto)), [serie]);
  const peak = useMemo(
    () => serie.reduce<IngresoMes | null>((a, b) => (!a || b.monto > a.monto ? b : a), null),
    [serie],
  );
  const years = useMemo(() => {
    const map = new Map<string, IngresoMes[]>();
    for (const m of serie) {
      const y = m.mes.slice(0, 4);
      const arr = map.get(y) ?? [];
      arr.push(m);
      map.set(y, arr);
    }
    return [...map.entries()].map(([year, months]) => ({
      year,
      months,
      subtotal: months.reduce((s, m) => s + m.monto, 0),
    }));
  }, [serie]);

  const exportPagosHref = useMemo(() => {
    const p = new URLSearchParams({ tipo: "pagos" });
    if (filters.q) p.set("q", filters.q);
    if (filters.periodo) p.set("periodo", filters.periodo);
    if (filters.desde) p.set("desde", filters.desde);
    if (filters.hasta) p.set("hasta", filters.hasta);
    return `/guardiania/export?${p.toString()}`;
  }, [filters]);
  const exportDeudasHref = `/guardiania/export?tipo=deudas&morosos=${filters.morosos ? "1" : "0"}`;

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este pago de guardianía?")) return;
    const res = await deletePago(id);
    if (!res.ok) return toast.error(res.error);
    toast.success("Pago eliminado.");
    startTransition(() => router.refresh());
  }

  const hasFilters = !!(filters.q || filters.periodo || filters.desde || filters.hasta);

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Guardianía</h1>
          <span className="socios-page__sub">
            Ingresos por servicio de seguridad · cobro mensual por puesto
            {pending && <span style={{ marginLeft: 10, color: "var(--accent)" }}>· actualizando…</span>}
          </span>
        </div>
        {perms.canWrite && (
          <button className="btn btn--primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={18} /> Registrar pago
          </button>
        )}
      </header>

      {/* KPIs */}
      <div className="gd-kpis">
        <div className="gd-kpi">
          <div className="gd-kpi__icon"><Icon name="card" size={20} /></div>
          <div className="gd-kpi__body">
            <span className="gd-kpi__value">{formatSoles(stats.totalCobrado)}</span>
            <span className="gd-kpi__label">Total recaudado</span>
            <span className="gd-kpi__hint">{stats.nPagos.toLocaleString("es-PE")} pagos registrados</span>
          </div>
        </div>
        <div className="gd-kpi">
          <div className="gd-kpi__icon"><Icon name="chart" size={20} /></div>
          <div className="gd-kpi__body">
            <span className="gd-kpi__value">{formatSoles(stats.cobrado12m)}</span>
            <span className="gd-kpi__label">Últimos 12 meses</span>
            <span className="gd-kpi__hint">cobrado reciente</span>
          </div>
        </div>
        <div className="gd-kpi">
          <div className="gd-kpi__icon"><Icon name="rules" size={20} /></div>
          <div className="gd-kpi__body">
            <span className="gd-kpi__value">{stats.nRecibos.toLocaleString("es-PE")}</span>
            <span className="gd-kpi__label">Recibos emitidos</span>
            <span className="gd-kpi__hint">N° de recibo únicos</span>
          </div>
        </div>
        <button className="gd-kpi gd-kpi--warn" onClick={() => goTab("deudas")} title="Ver deudas por puesto">
          <div className="gd-kpi__icon"><Icon name="hourglass" size={20} /></div>
          <div className="gd-kpi__body">
            <span className="gd-kpi__value">{formatSoles(deudas.deudaTotal)}</span>
            <span className="gd-kpi__label">Deuda estimada</span>
            <span className="gd-kpi__hint">{deudas.morososCount} puestos morosos →</span>
          </div>
        </button>
      </div>

      {/* Tabs */}
      <nav className="gd-tabs">
        <button className={`gd-tab ${tab === "ingresos" ? "is-active" : ""}`} onClick={() => goTab("ingresos")}>
          Ingresos por mes
        </button>
        <button className={`gd-tab ${tab === "recibos" ? "is-active" : ""}`} onClick={() => goTab("recibos")}>
          Recibos y pagos
        </button>
        <button className={`gd-tab ${tab === "deudas" ? "is-active" : ""}`} onClick={() => goTab("deudas")}>
          Deudas por puesto
        </button>
      </nav>

      {/* ── INGRESOS ── */}
      {tab === "ingresos" && (
        <section className="gd-panel">
          <div className="gd-panel__bar">
            <div className="gd-seg">
              <button className={modo === "cobro" ? "is-active" : ""} onClick={() => setModo("cobro")}>
                Por fecha de cobro
              </button>
              <button className={modo === "cubierto" ? "is-active" : ""} onClick={() => setModo("cubierto")}>
                Por mes cubierto
              </button>
            </div>
            <span className="socios-page__sub">
              {modo === "cobro" ? "Caja real: cuándo ingresó el dinero" : "Devengado: qué mes cubre cada pago"}
            </span>
          </div>

          <div className="gd-chart">
            <div className="gd-chart__head">
              <span className="gd-chart__peak">
                {peak ? <>Mejor mes: <b>{mesLargo(peak.mes)}</b> · {formatSoles(peak.monto)}</> : "Sin datos"}
              </span>
              <span className="gd-chart__peak">Máx. eje <b>{formatSoles(maxMonto)}</b></span>
            </div>
            <div className="gd-chart__scroll">
              <div className="gd-chart__plot">
                {years.length === 0 && <p className="gd-empty" style={{ margin: "auto" }}>Sin datos.</p>}
                {years.map((y) => (
                  <div className="gd-year" key={y.year}>
                    <div className="gd-year__bars">
                      {y.months.map((m) => (
                        <div className="gd-col" key={m.mes}>
                          <span className="gd-col__tip">
                            {mesLargo(m.mes)} · {formatSoles(m.monto)} · {m.count} pagos
                          </span>
                          <div className="gd-col__bar" style={{ height: `${Math.max(1, (m.monto / maxMonto) * 100)}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="gd-year__label">
                      <b>{y.year}</b>
                      <span>{formatSoles(y.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── RECIBOS ── */}
      {tab === "recibos" && (
        <section className="gd-panel">
          <div className="gd-filterbar">
            <div className="gd-toolbar">
              <div className="gd-search">
                <Icon name="search" size={16} />
                <input
                  className="input"
                  placeholder="Buscar por socio, N° de recibo o puesto…"
                  value={q}
                  onChange={(e) => onSearch(e.target.value)}
                />
                {q && (
                  <button className="gd-search__clear" onClick={clearSearch} aria-label="Limpiar búsqueda">
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
              <a className="btn btn--ghost gd-toolbar__excel" href={exportPagosHref}>
                <Icon name="download" size={16} /> Excel
              </a>
            </div>

            <div className="gd-periodrow">
              <div className="gd-fgroup">
                <span className="gd-fgroup__label">
                  Fecha de cobro <em>cuándo ingresó el dinero</em>
                </span>
                <div className="gd-chips">
                  <button className={`gd-fchip ${cobroPreset === "todo" ? "is-active" : ""}`} onClick={() => setCobro("todo")}>
                    Todo
                  </button>
                  <button className={`gd-fchip ${cobroPreset === "mes" ? "is-active" : ""}`} onClick={() => setCobro("mes")}>
                    Este mes
                  </button>
                  <button className={`gd-fchip ${cobroPreset === "pasado" ? "is-active" : ""}`} onClick={() => setCobro("pasado")}>
                    Mes pasado
                  </button>
                  <button className={`gd-fchip ${cobroPreset === "anio" ? "is-active" : ""}`} onClick={() => setCobro("anio")}>
                    Este año
                  </button>
                  <button
                    className={`gd-fchip ${cobroPreset === "custom" || showCustom ? "is-active" : ""}`}
                    onClick={() => setShowCustom((s) => !s)}
                  >
                    <Icon name="calendar" size={13} /> Otras fechas
                  </button>
                </div>
                {(showCustom || cobroPreset === "custom") && (
                  <div className="gd-daterange">
                    <label>
                      <span>Desde</span>
                      <input type="date" className="input" value={filters.desde}
                        onChange={(e) => updateParam({ desde: e.target.value || undefined })} />
                    </label>
                    <label>
                      <span>Hasta</span>
                      <input type="date" className="input" value={filters.hasta}
                        onChange={(e) => updateParam({ hasta: e.target.value || undefined })} />
                    </label>
                  </div>
                )}
              </div>

              <div className="gd-fgroup">
                <span className="gd-fgroup__label">
                  Mes que cubre <em>el mes de guardianía pagado</em>
                </span>
                <input type="month" className="input gd-monthinput" value={filters.periodo}
                  onChange={(e) => updateParam({ periodo: e.target.value || undefined })} />
              </div>
            </div>

            {hasFilters && (
              <div className="gd-active">
                <span className="gd-active__label"><Icon name="filter" size={13} /> Filtros activos</span>
                {filters.q && (
                  <button className="gd-tagchip" onClick={clearSearch}>
                    Búsqueda: “{filters.q}” <Icon name="close" size={12} />
                  </button>
                )}
                {filters.periodo && (
                  <button className="gd-tagchip" onClick={() => updateParam({ periodo: undefined })}>
                    Cubre: {mesLargo(filters.periodo)} <Icon name="close" size={12} />
                  </button>
                )}
                {(filters.desde || filters.hasta) && (
                  <button className="gd-tagchip" onClick={() => updateParam({ desde: undefined, hasta: undefined })}>
                    Cobrado: {cobroLabel} <Icon name="close" size={12} />
                  </button>
                )}
                <button className="gd-active__clear" onClick={clearAll}>Limpiar todo</button>
              </div>
            )}
          </div>
          <div className="gd-sumline">
            {pagos.total.toLocaleString("es-PE")} {pagos.total === 1 ? "pago" : "pagos"} · suma{" "}
            <b>{formatSoles(pagos.sumaFiltrada)}</b>
          </div>
          <div className="gd-tablewrap">
            <table className="socios-table gd-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Recibo</th>
                  <th>Mes cubierto</th>
                  <th>Puesto</th>
                  <th>Socio</th>
                  <th className="gd-num">Importe</th>
                  {perms.canDelete && <th aria-label="Acciones"></th>}
                </tr>
              </thead>
              <tbody>
                {pagos.items.length === 0 && (
                  <tr>
                    <td colSpan={perms.canDelete ? 7 : 6}>
                      <div className="gd-empty">
                        <strong>Sin pagos</strong>
                        {hasFilters ? "Ningún pago coincide con el filtro." : "Aún no hay pagos registrados."}
                      </div>
                    </td>
                  </tr>
                )}
                {pagos.items.map((p) => (
                  <tr key={p.id}>
                    <td className="gd-nowrap" data-label="Fecha">{fmtFecha(p.fecha)}</td>
                    <td data-label="Recibo">
                      {p.nroRecibo ? <span className="gd-recibo">{p.nroRecibo}</span> : <span className="gd-sub">—</span>}
                    </td>
                    <td data-label="Mes cubierto"><span className="gd-chip gd-chip--mes">{mesLargo(p.periodo)}</span></td>
                    <td data-label="Puesto">
                      {p.numeroPuesto != null ? (
                        <>
                          <span className="gd-puesto" title={`${p.bloque ?? ""} ${p.numeroPuesto}`}>
                            {p.bloque}-{p.numeroPuesto}
                          </span>
                          {!p.puestoId && (
                            <span className="gd-flag" title="No coincide con un puesto del padrón oficial">!</span>
                          )}
                        </>
                      ) : (
                        <span className="gd-sub">—</span>
                      )}
                    </td>
                    <td data-label="Socio">
                      <span className="gd-socio" title={p.socioNombre}>{p.socioNombre}</span>
                      {p.numeroPadron != null && <span className="gd-sub"> · P{p.numeroPadron}</span>}
                    </td>
                    <td className="gd-money" data-label="Importe">{formatSoles(p.importe)}</td>
                    {perms.canDelete && (
                      <td className="gd-num" data-label="">
                        <button className="iconbtn" onClick={() => onDelete(p.id)} title="Eliminar pago" aria-label="Eliminar">
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagos.page}
            pageSize={pagos.pageSize}
            total={pagos.total}
            pending={pending}
            noun="pago"
            onPage={(pg) => updateParam({ page: String(pg) }, false)}
            onPageSize={(size) => updateParam({ size: String(size) })}
          />
        </section>
      )}

      {/* ── DEUDAS ── */}
      {tab === "deudas" && (
        <section className="gd-panel">
          <div className="gd-panel__bar">
            <label className="gd-check">
              <input type="checkbox" checked={filters.morosos}
                onChange={(e) => updateParam({ morosos: e.target.checked ? undefined : "0" })} />
              Solo morosos
            </label>
            <span className="socios-page__sub">
              {deudas.cuentas.toLocaleString("es-PE")} cuentas · {deudas.morososCount} morosos · deuda estimada{" "}
              <b style={{ color: "var(--text)" }}>{formatSoles(deudas.deudaTotal)}</b>
            </span>
            <div className="gd-baractions">
              {perms.canWrite && (
                <button className="btn btn--primary" onClick={() => setCargosOpen(true)}>
                  <Icon name="rules" size={16} /> Generar cargos a socios
                </button>
              )}
              <a className="btn btn--ghost" href={exportDeudasHref}><Icon name="download" size={16} /> Excel</a>
            </div>
          </div>
          <div className="gd-tablewrap">
            <table className="socios-table gd-table">
              <thead>
                <tr>
                  <th>Puesto</th>
                  <th>Socio</th>
                  <th className="gd-num">Tarifa</th>
                  <th>Desde</th>
                  <th>Meses cubiertos</th>
                  <th className="gd-num">Cobrado</th>
                  <th className="gd-num">Deuda</th>
                </tr>
              </thead>
              <tbody>
                {deudas.items.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="gd-empty">
                        <strong>Sin deuda</strong>
                        {filters.morosos ? "Ningún puesto está moroso." : "No hay cuentas registradas."}
                      </div>
                    </td>
                  </tr>
                )}
                {deudas.items.map((d) => {
                  const pct = d.mesesEsperados ? (d.mesesCubiertos / d.mesesEsperados) * 100 : 100;
                  return (
                    <tr key={d.cuentaId}>
                      <td data-label="Puesto"><strong>{d.puestoCodigo}</strong></td>
                      <td data-label="Socio"><span className="gd-socio" title={d.socioNombre}>{d.socioNombre}</span></td>
                      <td className="gd-num" data-label="Tarifa">{formatSoles(d.tarifaMensual)}</td>
                      <td className="gd-nowrap" data-label="Desde">{mesLargo(d.inicioPeriodo)}</td>
                      <td data-label="Meses cubiertos">
                        <div className="gd-meses">
                          <span className="gd-meses__track">
                            <span className={`gd-meses__fill ${d.mesesDebidos > 0 ? "is-due" : ""}`} style={{ width: `${pct}%` }} />
                          </span>
                          <span className="gd-meses__txt">{d.mesesCubiertos}/{d.mesesEsperados}</span>
                        </div>
                      </td>
                      <td className="gd-num" data-label="Cobrado">{formatSoles(d.cobradoTotal)}</td>
                      <td className="gd-num" data-label="Deuda">
                        {d.deuda > 0
                          ? <span className="gd-chip gd-chip--warn">{formatSoles(d.deuda)}</span>
                          : <span className="gd-chip gd-chip--ok">al día</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {createOpen && (
        <RegistrarPagoModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {cargosOpen && (
        <GenerarCargosModal
          onClose={() => setCargosOpen(false)}
          onSaved={() => {
            setCargosOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}
