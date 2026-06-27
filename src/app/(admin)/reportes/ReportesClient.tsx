"use client";

import "../socios/socios.css";
import "./reportes.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Icon, type IconName } from "@/components/admin/Icon";
import { formatSoles } from "@/lib/money";
import { fechaTS, hoyISOPeru } from "@/lib/fecha";
import { CATEGORIA_LABEL } from "@/lib/caja/labels";
import {
  REPORT_TABS,
  TABS_CON_FECHA,
  type ReportTab,
  type ReportData,
  type FinancieroReport,
  type CobranzasReport,
  type PadronReport,
  type PuestosReport,
  type AsistenciaReport,
} from "./types";

const TAB_META: Record<ReportTab, { label: string; icon: IconName }> = {
  financiero: { label: "Financiero", icon: "card" },
  cobranzas: { label: "Cobranzas", icon: "chart" },
  padron: { label: "Padrón", icon: "users" },
  puestos: { label: "Puestos", icon: "folder" },
  asistencia: { label: "Asistencia", icon: "calendar" },
};

const ESTADO_SOCIO_LABEL: Record<string, string> = {
  activo: "Activos",
  suspendido: "Suspendidos",
  retirado: "Retirados",
  fallecido: "Fallecidos",
};
const ESTADO_PUESTO_LABEL: Record<string, string> = {
  activo: "Ocupados",
  vacio: "Vacíos",
  clausurado: "Clausurados",
  construccion: "En construcción",
};
const ESTADO_ASAMBLEA_LABEL: Record<string, string> = {
  programada: "Programada",
  en_curso: "En curso",
  cerrada: "Cerrada",
};

function fmtMes(mes: string): string {
  const [y, m] = mes.split("-");
  const meses = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Set", "Oct", "Nov", "Dic",
  ];
  const idx = parseInt(m, 10) - 1;
  return idx >= 0 && idx < 12 ? `${meses[idx]} ${y}` : mes;
}

type BarTone = "accent" | "green" | "red" | "amber" | "neutral";

function Bar({
  label,
  valueText,
  ratio,
  tone = "accent",
}: {
  label: string;
  valueText: string;
  ratio: number; // 0..1
  tone?: BarTone;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const toneClass = tone === "accent" ? "" : ` rep-bar__fill--${tone}`;
  return (
    <div className="rep-bar">
      <div className="rep-bar__head">
        <span>{label}</span>
        <span className="rep-bar__val">{valueText}</span>
      </div>
      <div className="rep-bar__track">
        <div className={`rep-bar__fill${toneClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Card({
  value,
  label,
  tone = "accent",
}: {
  value: string | number;
  label: string;
  tone?: "accent" | "green" | "red" | "amber";
}) {
  return (
    <div className={`rep-card rep-card--${tone}`}>
      <span className="rep-card__value">{value}</span>
      <span className="rep-card__label">{label}</span>
    </div>
  );
}

/* ════════════════════ Vista: Financiero ════════════════════ */
function FinancieroView({ data }: { data: FinancieroReport }) {
  const maxCat = Math.max(1, ...data.porCategoria.map((c) => c.total));
  return (
    <>
      <div className="rep-cards">
        <Card value={formatSoles(data.ingresos)} label="Ingresos" tone="green" />
        <Card value={formatSoles(data.egresos)} label="Egresos" tone="red" />
        <Card
          value={formatSoles(data.balance)}
          label="Balance"
          tone={data.balance >= 0 ? "accent" : "red"}
        />
        <Card value={data.totalMovimientos} label="Movimientos" tone="amber" />
      </div>

      <div className="rep-grid2">
        <div className="rep-section">
          <h3 className="rep-section__title">Resultado por mes</h3>
          {data.porMes.length === 0 ? (
            <p className="rep-empty">Sin movimientos en el período.</p>
          ) : (
            <table className="socios-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Ingresos</th>
                  <th>Egresos</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.porMes.map((m) => (
                  <tr key={m.mes}>
                    <td data-label="Mes">{fmtMes(m.mes)}</td>
                    <td data-label="Ingresos">
                      <span className="rep-pos">{formatSoles(m.ingresos)}</span>
                    </td>
                    <td data-label="Egresos">
                      <span className="rep-neg">{formatSoles(m.egresos)}</span>
                    </td>
                    <td data-label="Balance">
                      <span className={m.balance >= 0 ? "rep-pos" : "rep-neg"}>
                        {formatSoles(m.balance)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rep-section">
          <h3 className="rep-section__title">Por categoría</h3>
          {data.porCategoria.length === 0 ? (
            <p className="rep-empty">Sin movimientos en el período.</p>
          ) : (
            <div className="rep-bars">
              {data.porCategoria.map((c) => (
                <Bar
                  key={`${c.tipo}-${c.categoria}`}
                  label={CATEGORIA_LABEL[c.categoria]}
                  valueText={`${c.tipo === "ingreso" ? "+" : "−"}${formatSoles(c.total)}`}
                  ratio={c.total / maxCat}
                  tone={c.tipo === "ingreso" ? "green" : "red"}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ════════════════════ Vista: Cobranzas ════════════════════ */
function CobranzasView({ data }: { data: CobranzasReport }) {
  const maxConcepto = Math.max(1, ...data.porConcepto.map((c) => c.total));
  return (
    <>
      <div className="rep-cards">
        <Card value={formatSoles(data.deudaPendiente)} label="Deuda pendiente" tone="red" />
        <Card value={data.sociosConDeuda} label="Socios con deuda" tone="amber" />
        <Card value={data.pendienteCount} label="Cuotas pendientes" tone="accent" />
        <Card value={formatSoles(data.recaudado)} label="Recaudado (histórico)" tone="green" />
      </div>

      <div className="rep-section">
        <h3 className="rep-section__title">
          Mayores deudores{" "}
          {data.totalDeudores > data.topDeudores.length &&
            `(top ${data.topDeudores.length} de ${data.totalDeudores})`}
        </h3>
        {data.topDeudores.length === 0 ? (
          <p className="rep-empty">No hay socios con deuda pendiente. 🎉</p>
        ) : (
          <>
            <table className="socios-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Socio</th>
                  <th>Documento</th>
                  <th>Cuotas</th>
                  <th>Deuda</th>
                </tr>
              </thead>
              <tbody>
                {data.topDeudores.map((d) => (
                  <tr key={d.socioId}>
                    <td data-label="Código">{d.codigo}</td>
                    <td data-label="Socio">{d.nombre}</td>
                    <td data-label="Documento">{d.documento}</td>
                    <td data-label="Cuotas">{d.cuotas}</td>
                    <td data-label="Deuda">
                      <span className="rep-neg">{formatSoles(d.total)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.totalDeudores > data.topDeudores.length && (
              <p className="rep-note">
                Se muestran los {data.topDeudores.length} mayores. Exporta a Excel
                para ver los {data.totalDeudores} deudores completos.
              </p>
            )}
          </>
        )}
      </div>

      {data.porConcepto.length > 0 && (
        <div className="rep-section">
          <h3 className="rep-section__title">Deuda pendiente por concepto</h3>
          <div className="rep-bars">
            {data.porConcepto.map((c) => (
              <Bar
                key={c.concepto}
                label={`${c.concepto} (${c.count})`}
                valueText={formatSoles(c.total)}
                ratio={c.total / maxConcepto}
                tone="red"
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════ Vista: Padrón ════════════════════ */
function PadronView({ data }: { data: PadronReport }) {
  const maxEstado = Math.max(1, ...data.porEstado.map((e) => e.count));
  const maxSexo = Math.max(1, ...data.porSexo.map((s) => s.count));
  const maxAnio = Math.max(1, ...data.altasPorAnio.map((a) => a.count));
  const estadoTone: Record<string, BarTone> = {
    activo: "green",
    suspendido: "amber",
    retirado: "neutral",
    fallecido: "red",
  };
  return (
    <>
      <div className="rep-cards">
        <Card value={data.total} label="Total de socios" tone="accent" />
        <Card value={data.conDni} label="Con DNI" tone="green" />
        <Card value={data.sinDni} label="Sin DNI" tone="amber" />
        <Card value={data.duplicados.length} label="Grupos posibles duplicados" tone="red" />
      </div>

      <div className="rep-grid2">
        <div className="rep-section">
          <h3 className="rep-section__title">Por estado</h3>
          <div className="rep-bars">
            {data.porEstado.map((e) => (
              <Bar
                key={e.estado}
                label={ESTADO_SOCIO_LABEL[e.estado] ?? e.estado}
                valueText={String(e.count)}
                ratio={e.count / maxEstado}
                tone={estadoTone[e.estado] ?? "accent"}
              />
            ))}
          </div>
        </div>

        <div className="rep-section">
          <h3 className="rep-section__title">Por sexo</h3>
          <div className="rep-bars">
            {data.porSexo.map((s) => (
              <Bar
                key={s.sexo}
                label={s.sexo}
                valueText={String(s.count)}
                ratio={s.count / maxSexo}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rep-section">
        <h3 className="rep-section__title">Altas por año</h3>
        {data.altasPorAnio.length === 0 ? (
          <p className="rep-empty">Sin datos.</p>
        ) : (
          <div className="rep-bars">
            {data.altasPorAnio.map((a) => (
              <Bar
                key={a.anio}
                label={a.anio}
                valueText={String(a.count)}
                ratio={a.count / maxAnio}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rep-section">
        <h3 className="rep-section__title">
          Posibles duplicados ({data.duplicados.length})
        </h3>
        {data.duplicados.length === 0 ? (
          <p className="rep-empty">No se detectaron posibles duplicados. ✓</p>
        ) : (
          <>
            <div className="rep-dups">
              {data.duplicados.map((g) => (
                <div className="rep-dup" key={g.key}>
                  <div className="rep-dup__head">
                    <span>{g.nombre}</span>
                    <span className="rep-dup__count">{g.socios.length} fichas</span>
                  </div>
                  <table className="socios-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Socio</th>
                        <th>Documento</th>
                        <th>Estado</th>
                        <th>Puestos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.socios.map((s) => (
                        <tr key={s.id}>
                          <td data-label="Código">{s.codigo}</td>
                          <td data-label="Socio">{s.nombre}</td>
                          <td data-label="Documento">
                            {s.sinDni ? (
                              <span className="rep-chip">Sin DNI</span>
                            ) : (
                              s.documento
                            )}
                          </td>
                          <td data-label="Estado">
                            {ESTADO_SOCIO_LABEL[s.estado] ?? s.estado}
                          </td>
                          <td data-label="Puestos">{s.puestos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <p className="rep-note">
              Heurística: mismas apellidos + primer nombre. Revisa cada grupo: si
              son la misma persona, consolida en una sola ficha (una persona = un
              DNI) en vez de duplicar el documento.
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ════════════════════ Vista: Puestos ════════════════════ */
function PuestosView({ data }: { data: PuestosReport }) {
  const maxEstado = Math.max(1, ...data.porEstado.map((e) => e.count));
  const maxGiro = Math.max(1, ...data.porGiro.map((g) => g.count));
  const pctOcup = data.total > 0 ? Math.round((data.ocupados / data.total) * 100) : 0;
  const estadoTone: Record<string, BarTone> = {
    activo: "green",
    vacio: "amber",
    clausurado: "red",
    construccion: "neutral",
  };
  return (
    <>
      <div className="rep-cards">
        <Card value={data.total} label="Total de puestos" tone="accent" />
        <Card value={data.ocupados} label="Ocupados" tone="green" />
        <Card value={data.vacios} label="Vacíos" tone="amber" />
        <Card value={`${pctOcup}%`} label="Ocupación" tone="accent" />
      </div>

      <div className="rep-grid2">
        <div className="rep-section">
          <h3 className="rep-section__title">Por estado</h3>
          <div className="rep-bars">
            {data.porEstado.map((e) => (
              <Bar
                key={e.estado}
                label={ESTADO_PUESTO_LABEL[e.estado] ?? e.estado}
                valueText={String(e.count)}
                ratio={e.count / maxEstado}
                tone={estadoTone[e.estado] ?? "accent"}
              />
            ))}
          </div>
        </div>

        <div className="rep-section">
          <h3 className="rep-section__title">Por giro</h3>
          {data.porGiro.length === 0 ? (
            <p className="rep-empty">Sin datos.</p>
          ) : (
            <div className="rep-bars">
              {data.porGiro.map((g) => (
                <Bar
                  key={g.giro}
                  label={g.giro}
                  valueText={String(g.count)}
                  ratio={g.count / maxGiro}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rep-section">
        <h3 className="rep-section__title">Ocupación por bloque</h3>
        <table className="socios-table">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Bloque</th>
              <th>Total</th>
              <th>Ocupados</th>
              <th>Vacíos</th>
            </tr>
          </thead>
          <tbody>
            {data.porBloque.map((b) => (
              <tr key={`${b.etapa}-${b.bloque}`}>
                <td data-label="Etapa">E{b.etapa}</td>
                <td data-label="Bloque">{b.bloque}</td>
                <td data-label="Total">{b.total}</td>
                <td data-label="Ocupados">{b.ocupados}</td>
                <td data-label="Vacíos">{b.vacios}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rep-section">
        <h3 className="rep-section__title">
          Puestos vacíos (disponibles){" "}
          {data.totalVacios > data.vaciosList.length &&
            `· top ${data.vaciosList.length} de ${data.totalVacios}`}
        </h3>
        {data.vaciosList.length === 0 ? (
          <p className="rep-empty">No hay puestos vacíos.</p>
        ) : (
          <>
            <table className="socios-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Etapa</th>
                  <th>Bloque</th>
                  <th>Giro</th>
                </tr>
              </thead>
              <tbody>
                {data.vaciosList.map((p) => (
                  <tr key={p.codigo}>
                    <td data-label="Código">{p.codigo}</td>
                    <td data-label="Etapa">E{p.etapa}</td>
                    <td data-label="Bloque">{p.bloque}</td>
                    <td data-label="Giro">{p.giro ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.totalVacios > data.vaciosList.length && (
              <p className="rep-note">
                Exporta a Excel para ver los {data.totalVacios} puestos vacíos.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ════════════════════ Vista: Asistencia ════════════════════ */
function AsistenciaView({ data }: { data: AsistenciaReport }) {
  const pctTone = (pct: number) =>
    pct >= 70 ? "rep-pos" : pct >= 40 ? "" : "rep-neg";
  return (
    <>
      <div className="rep-section">
        <h3 className="rep-section__title">Asistencia por asamblea</h3>
        {data.asambleas.length === 0 ? (
          <p className="rep-empty">Aún no hay asambleas registradas.</p>
        ) : (
          <table className="socios-table">
            <thead>
              <tr>
                <th>Asamblea</th>
                <th>Fecha</th>
                <th>Presentes</th>
                <th>Tardanza</th>
                <th>Ausentes</th>
                <th>Justif.</th>
                <th>Registr.</th>
                <th>% Asist.</th>
              </tr>
            </thead>
            <tbody>
              {data.asambleas.map((a) => (
                <tr key={a.id}>
                  <td data-label="Asamblea">{a.titulo}</td>
                  <td data-label="Fecha">{fechaTS(a.fecha)}</td>
                  <td data-label="Presentes">{a.presente}</td>
                  <td data-label="Tardanza">{a.tardanza}</td>
                  <td data-label="Ausentes">{a.ausente}</td>
                  <td data-label="Justif.">{a.justificado}</td>
                  <td data-label="Registr.">{a.totalRegistrados}</td>
                  <td data-label="% Asist.">
                    {a.pctAsistencia === null ? (
                      // Asamblea aún no cerrada: el % no es real (nómina sembrada).
                      <span className="rep-chip">
                        {ESTADO_ASAMBLEA_LABEL[a.estado] ?? "—"}
                      </span>
                    ) : (
                      <span className={`rep-pct ${pctTone(a.pctAsistencia)}`}>
                        {a.pctAsistencia}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rep-section">
        <h3 className="rep-section__title">
          Socios con más ausencias{" "}
          {data.topAusentes.length > 0 && `(top ${data.topAusentes.length})`}
        </h3>
        {data.topAusentes.length === 0 ? (
          <p className="rep-empty">Sin ausencias registradas.</p>
        ) : (
          <table className="socios-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Socio</th>
                <th>Ausencias</th>
              </tr>
            </thead>
            <tbody>
              {data.topAusentes.map((a) => (
                <tr key={a.socioId}>
                  <td data-label="Código">{a.codigo}</td>
                  <td data-label="Socio">{a.nombre}</td>
                  <td data-label="Ausencias">{a.ausencias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ════════════════════ Shell ════════════════════ */
export function ReportesClient({
  report,
  filters,
}: {
  report: ReportData;
  filters: { desde: string; hasta: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeTab = report.tab;
  const showFechas = TABS_CON_FECHA.includes(activeTab);

  const goTab = (tab: ReportTab) => {
    if (tab === activeTab) return;
    const p = new URLSearchParams();
    p.set("tab", tab);
    // Conservar el rango de fechas solo en pestañas que lo usan.
    if (TABS_CON_FECHA.includes(tab)) {
      if (filters.desde) p.set("desde", filters.desde);
      if (filters.hasta) p.set("hasta", filters.hasta);
    }
    startTransition(() => router.push(`/reportes?${p.toString()}`));
  };

  const updateFecha = (entries: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", activeTab);
    for (const [k, v] of Object.entries(entries)) {
      if (v && v !== "") p.set(k, v);
      else p.delete(k);
    }
    startTransition(() => router.push(`/reportes?${p.toString()}`));
  };

  function handleExport() {
    // Descarga nativa vía el route handler GET (Content-Disposition: attachment).
    // El atributo `download` + mismo origen hace que el navegador guarde el
    // archivo sin abandonar la página.
    const p = new URLSearchParams();
    p.set("tab", activeTab);
    if (TABS_CON_FECHA.includes(activeTab)) {
      if (filters.desde) p.set("desde", filters.desde);
      if (filters.hasta) p.set("hasta", filters.hasta);
    }
    // Nombre EXPLÍCITO con .xlsx: con download="" Chrome ignora el
    // Content-Disposition y baja un archivo UUID sin extensión (no se abre como
    // Excel). Fijar el nombre garantiza la extensión correcta.
    const hoy = hoyISOPeru();
    const a = document.createElement("a");
    a.href = `/reportes/export?${p.toString()}`;
    a.download = `reporte-${activeTab}-${hoy}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Reportes</h1>
          <span className="socios-page__sub">
            {TAB_META[activeTab].label}
            {pending && (
              <span style={{ marginLeft: 10, color: "var(--accent)" }}>
                · actualizando…
              </span>
            )}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="btn btn--ghost"
            onClick={handleExport}
            title="Exportar este reporte a Excel"
          >
            <Icon name="download" size={16} />
            <span>Exportar Excel</span>
          </button>
        </div>
      </header>

      <nav className="rep-tabs">
        {REPORT_TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`rep-tab ${t === activeTab ? "is-active" : ""}`}
            onClick={() => goTab(t)}
          >
            <Icon name={TAB_META[t].icon} size={16} />
            <span>{TAB_META[t].label}</span>
          </button>
        ))}
      </nav>

      {showFechas && (
        <div className="socios-toolbar" style={{ marginBottom: 18 }}>
          <input
            type="date"
            className="socios-toolbar__select"
            value={filters.desde}
            onChange={(e) => updateFecha({ desde: e.target.value || undefined })}
            title="Desde"
          />
          <input
            type="date"
            className="socios-toolbar__select"
            value={filters.hasta}
            onChange={(e) => updateFecha({ hasta: e.target.value || undefined })}
            title="Hasta"
          />
          {(filters.desde || filters.hasta) && (
            <button
              className="btn btn--ghost"
              onClick={() => updateFecha({ desde: undefined, hasta: undefined })}
            >
              Limpiar fechas
            </button>
          )}
        </div>
      )}

      {report.tab === "financiero" && <FinancieroView data={report.data} />}
      {report.tab === "cobranzas" && <CobranzasView data={report.data} />}
      {report.tab === "padron" && <PadronView data={report.data} />}
      {report.tab === "puestos" && <PuestosView data={report.data} />}
      {report.tab === "asistencia" && <AsistenciaView data={report.data} />}
    </div>
  );
}
