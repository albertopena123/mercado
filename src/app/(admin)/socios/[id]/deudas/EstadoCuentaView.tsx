"use client";

import "../../socios.css";
import "../../../cuotas/cuotas.css";
import "./estado-cuenta.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import { fechaCorta } from "@/lib/fecha";
import { getCuotasBySocio, revertirExoneracion } from "../../../cuotas/actions";
import { PagoPorMontoModal } from "../../../cuotas/PagoPorMontoModal";
import { PagarSeleccionModal } from "../../../cuotas/PagarSeleccionModal";
import { ExonerarModal } from "./ExonerarModal";
import { esAutovaluo } from "@/lib/cuotas/autovaluo";
import { EstadoBadge } from "../../EstadoBadge";
import type { CuotaRow, SocioCuotas } from "../../../cuotas/types";
import type { EstadoSocio } from "@/generated/prisma/client";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
  exonerada: "Exonerada",
};

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  yape: "Yape / Plin",
  otro: "Otro",
};

type SocioHeader = {
  id: string;
  codigo: string;
  numeroPadron: number | null;
  estado: EstadoSocio;
  documento: string;
  nombre: string;
  nombreCorto: string;
};

export function EstadoCuentaView({ socio }: { socio: SocioHeader }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<SocioCuotas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paySelOpen, setPaySelOpen] = useState(false);
  const [exonerar, setExonerar] = useState<CuotaRow | null>(null);
  const [revirtiendo, setRevirtiendo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<"todas" | CuotaRow["estado"]>("todas");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function onRevertir(c: CuotaRow) {
    if (revirtiendo) return;
    setRevirtiendo(c.id);
    const res = await revertirExoneracion(c.id);
    setRevirtiendo(null);
    if (res.ok) {
      toast.success("Exoneración revertida.");
      load();
    } else {
      toast.error(res.error);
    }
  }

  async function load() {
    const r = await getCuotasBySocio(socio.id);
    if (r.ok) setData(r.data!);
    else setError(r.error);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getCuotasBySocio(socio.id);
      if (cancelled) return;
      if (r.ok) setData(r.data!);
      else setError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [socio.id]);

  const pendientes = data
    ? data.cuotas
        .filter((c) => c.estado === "pendiente")
        .map((c) => ({
          id: c.id,
          periodo: c.periodo,
          monto: c.monto,
          concepto: c.concepto,
        }))
        .sort((a, b) => a.periodo.localeCompare(b.periodo))
    : [];

  // Selección múltiple (un solo comprobante). El autovalúo se excluye: cada
  // recibo exige su N.° de operación único, así que se paga individualmente.
  const selRows = data
    ? data.cuotas.filter(
        (c) =>
          selected.has(c.id) &&
          c.estado === "pendiente" &&
          !esAutovaluo(c.concepto),
      )
    : [];
  const selTotal =
    Math.round(selRows.reduce((a, c) => a + c.monto, 0) * 100) / 100;
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Búsqueda + filtro por estado (cliente): con guardianía un socio puede tener
  // decenas de cuotas, así que se filtran en memoria. `fold` ignora tildes para
  // que "guardiania" encuentre "Guardianía"; la búsqueda tokeniza (AND).
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const estadoCounts = useMemo(() => {
    const c: Record<string, number> = { todas: 0, pendiente: 0, pagada: 0, exonerada: 0, anulada: 0 };
    if (data) for (const q of data.cuotas) { c.todas++; c[q.estado] = (c[q.estado] ?? 0) + 1; }
    return c;
  }, [data]);
  const cuotasFiltradas = useMemo(() => {
    if (!data) return [];
    const tokens = fold(search.trim()).split(/\s+/).filter(Boolean);
    return data.cuotas.filter((c) => {
      if (estadoFilter !== "todas" && c.estado !== estadoFilter) return false;
      if (tokens.length) {
        const hay = fold(`${c.periodo} ${c.concepto}`);
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [data, search, estadoFilter]);
  const sumaFiltradaPend = useMemo(
    () => Math.round(cuotasFiltradas.filter((c) => c.estado === "pendiente").reduce((a, c) => a + c.monto, 0) * 100) / 100,
    [cuotasFiltradas],
  );
  const filtroActivo = search.trim() !== "" || estadoFilter !== "todas";

  // Paginación en cliente (las cuotas ya vienen cargadas). Cualquier cambio de
  // filtro/búsqueda/tamaño vuelve a la página 1 para no quedar fuera de rango.
  useEffect(() => { setPage(1); }, [search, estadoFilter, pageSize]);
  const paginadas = useMemo(
    () => cuotasFiltradas.slice((page - 1) * pageSize, page * pageSize),
    [cuotasFiltradas, page, pageSize],
  );

  const alDia = data ? data.deuda <= 0 : false;
  const canPay = data?.canPay ?? false;
  const canWrite = data?.canWrite ?? false;
  const hasActions = canPay || canWrite;

  return (
    <div className="socios-page ec-page">
      <div className="ec-topbar no-print">
        <button className="btn btn--ghost" onClick={() => router.push("/socios")}>
          <Icon
            name="chevron-right"
            size={14}
            style={{ transform: "rotate(180deg)" }}
          />
          <span>Volver al padrón</span>
        </button>
        <a
          className="btn btn--ghost"
          href={`/socios/${socio.id}/deudas/proforma`}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir la proforma de deuda para imprimir"
        >
          <Icon name="download" size={16} />
          <span>Proforma para imprimir</span>
        </a>
      </div>

      <header className="socios-page__header">
        <div>
          <div className="ec-eyebrow">
            Estado de cuenta · Socio {socio.codigo}
            {socio.numeroPadron != null && ` · Padrón ${socio.numeroPadron}`}
          </div>
          <h1 className="socios-page__title">{socio.nombre}</h1>
          <span className="socios-page__sub ec-sub">
            <span className="ec-doc">
              <Icon name="card" size={14} /> {socio.documento}
            </span>
            <EstadoBadge estado={socio.estado} />
          </span>
        </div>
      </header>

      {error && (
        <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="info" size={16} />
          <span>{error}</span>
        </div>
      )}

      {flash && (
        <div
          className="soc-error"
          role="status"
          style={{
            background: "#dcfce7",
            color: "#166534",
            borderColor: "#bbf7d0",
            marginBottom: 16,
          }}
        >
          <Icon name="check" size={16} />
          <span>{flash}</span>
        </div>
      )}

      {!data && !error && (
        <p style={{ color: "var(--text-muted)" }}>Cargando estado de cuenta…</p>
      )}

      {data && (
        <>
          <div className="soc-stats">
            <div
              className={`soc-stat soc-stat--${alDia ? "green" : "red"}`}
            >
              <span className="soc-stat__dot" aria-hidden />
              <span className="soc-stat__body">
                <span className="soc-stat__value" style={{ fontSize: 20 }}>
                  {formatSoles(data.deuda)}
                </span>
                <span className="soc-stat__label">
                  {alDia ? "Sin deuda pendiente" : "Deuda pendiente"}
                </span>
              </span>
            </div>
            <div className="soc-stat soc-stat--neutral">
              <span className="soc-stat__dot" aria-hidden />
              <span className="soc-stat__body">
                <span className="soc-stat__value" style={{ fontSize: 20 }}>
                  {pendientes.length}
                </span>
                <span className="soc-stat__label">Cuotas sin pagar</span>
              </span>
            </div>
          </div>

          {/* Guía clara de las formas de pago: resuelve la duda de qué hace
              cada botón (sobre todo "por monto", que aplica a las más antiguas). */}
          {canPay && (
            <section className="ec-how" aria-label="Cómo registrar un pago">
              <h2 className="ec-how__title">
                <Icon name="info" size={16} /> Cómo registrar un pago
              </h2>
              <ol className="ec-how__list">
                <li>
                  <b>Pago por monto</b> (lo más rápido para pagar todo) — ingresas
                  el importe recibido y el sistema salda{" "}
                  <b>las cuotas más antiguas primero</b>. El monto debe cubrir{" "}
                  <b>cuotas completas</b> (no se maneja saldo a favor). Si el pago
                  incluye <b>autovalúo</b>, te pedirá el <b>N.° de operación</b> de
                  cada recibo.
                </li>
                <li>
                  <b>Pagar (una cuota)</b> — con el botón{" "}
                  <span className="ec-chip">Pagar</span> de cada fila. Registras
                  su <b>N.° de operación del recibo</b> (obligatorio en el
                  autovalúo).
                </li>
                <li>
                  <b>Pagar seleccionadas</b> — marca varias cuotas con la casilla
                  y págalas juntas en <b>un solo comprobante</b>.
                </li>
              </ol>
            </section>
          )}

          {canPay && pendientes.length > 0 && (
            <div className="ec-actions">
              <button
                className="btn btn--primary"
                onClick={() => setPayOpen(true)}
              >
                <Icon name="chart" size={16} />
                <span>Registrar pago por monto (pagar todo)</span>
              </button>
            </div>
          )}

          {selRows.length > 0 && (
            <div
              className="cuo-selbar"
              role="region"
              aria-label="Pago de cuotas seleccionadas"
            >
              <div className="cuo-selbar__info">
                <b>{selRows.length}</b> cuota(s) · Total{" "}
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
                  onClick={() => setPaySelOpen(true)}
                >
                  Pagar seleccionadas
                </button>
              </div>
            </div>
          )}

          {data.cuotas.length === 0 ? (
            <div className="socios-empty">
              <p>Este socio no tiene cuotas registradas.</p>
            </div>
          ) : (
            <>
              {data.cuotas.length > 6 && (
                <div className="ec-filters no-print">
                  <div className="ec-search">
                    <Icon name="search" size={16} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por concepto, periodo o puesto…"
                    />
                    {search && (
                      <button
                        className="ec-search__clear"
                        onClick={() => setSearch("")}
                        aria-label="Limpiar búsqueda"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                  <div className="ec-fchips">
                    <button
                      className={`ec-fchip ${estadoFilter === "todas" ? "is-active" : ""}`}
                      onClick={() => setEstadoFilter("todas")}
                    >
                      Todas <span>{estadoCounts.todas}</span>
                    </button>
                    <button
                      className={`ec-fchip ${estadoFilter === "pendiente" ? "is-active" : ""}`}
                      onClick={() => setEstadoFilter("pendiente")}
                    >
                      Pendientes <span>{estadoCounts.pendiente}</span>
                    </button>
                    <button
                      className={`ec-fchip ${estadoFilter === "pagada" ? "is-active" : ""}`}
                      onClick={() => setEstadoFilter("pagada")}
                    >
                      Pagadas <span>{estadoCounts.pagada}</span>
                    </button>
                    {estadoCounts.exonerada > 0 && (
                      <button
                        className={`ec-fchip ${estadoFilter === "exonerada" ? "is-active" : ""}`}
                        onClick={() => setEstadoFilter("exonerada")}
                      >
                        Exoneradas <span>{estadoCounts.exonerada}</span>
                      </button>
                    )}
                    {estadoCounts.anulada > 0 && (
                      <button
                        className={`ec-fchip ${estadoFilter === "anulada" ? "is-active" : ""}`}
                        onClick={() => setEstadoFilter("anulada")}
                      >
                        Anuladas <span>{estadoCounts.anulada}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
              {data.cuotas.length > 6 && (
                <div className="ec-countline">
                  <b>{cuotasFiltradas.length}</b>{" "}
                  {cuotasFiltradas.length === 1 ? "cuota" : "cuotas"}
                  {filtroActivo && " (filtradas)"}
                  {sumaFiltradaPend > 0 && (
                    <> · pendiente <b>{formatSoles(sumaFiltradaPend)}</b></>
                  )}
                </div>
              )}
              <table className="socios-table ec-table">
              <thead>
                <tr>
                  {canPay && (
                    <th style={{ width: 36 }}>
                      <span
                        className="soc-th"
                        style={{ cursor: "default" }}
                        aria-label="Seleccionar"
                      />
                    </th>
                  )}
                  <th>
                    <span className="soc-th" style={{ cursor: "default" }}>
                      Periodo / concepto
                    </span>
                  </th>
                  <th>
                    <span className="soc-th" style={{ cursor: "default" }}>
                      Vencimiento
                    </span>
                  </th>
                  <th>
                    <span className="soc-th" style={{ cursor: "default" }}>
                      Monto
                    </span>
                  </th>
                  <th>
                    <span className="soc-th" style={{ cursor: "default" }}>
                      Estado
                    </span>
                  </th>
                  <th>
                    <span className="soc-th" style={{ cursor: "default" }}>
                      Pago
                    </span>
                  </th>
                  {hasActions && (
                    <th style={{ width: 160 }}>
                      <span
                        className="soc-th"
                        style={{ cursor: "default" }}
                        aria-label="Acciones"
                      />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {cuotasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={5 + (canPay ? 1 : 0) + (hasActions ? 1 : 0)}>
                      <div className="socios-empty" style={{ padding: "24px 8px" }}>
                        <p>Ninguna cuota coincide con la búsqueda o el filtro.</p>
                      </div>
                    </td>
                  </tr>
                ) : paginadas.map((c) => {
                  const auto = esAutovaluo(c.concepto);
                  const pendiente = c.estado === "pendiente";
                  return (
                    <tr
                      key={c.id}
                      className={selected.has(c.id) ? "is-selected" : undefined}
                    >
                      {canPay && (
                        <td style={{ width: 36, textAlign: "center" }}>
                          {pendiente && !auto ? (
                            <input
                              type="checkbox"
                              checked={selected.has(c.id)}
                              onChange={() => toggleSel(c.id)}
                              aria-label={`Seleccionar cuota ${c.periodo}`}
                            />
                          ) : null}
                        </td>
                      )}
                      <td>
                        <span className="soc-codigo">{c.periodo}</span>
                        <div className="ec-concepto">
                          {c.concepto}
                          {auto && (
                            <span className="ec-tag ec-tag--auto">Autovalúo</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="ec-venc">
                          {c.vencimiento ? fechaCorta(c.vencimiento) : "—"}
                        </span>
                      </td>
                      <td>
                        <span className="cuo-monto">{formatSoles(c.monto)}</span>
                      </td>
                      <td>
                        <span className={`cuo-badge cuo-badge--${c.estado}`}>
                          {ESTADO_LABEL[c.estado]}
                        </span>
                      </td>
                      <td>
                        {c.estado === "pagada" ? (
                          <div className="ec-pago">
                            <span>
                              {c.pagadoEn ? fechaCorta(c.pagadoEn) : "—"}
                              {c.metodoPago
                                ? ` · ${METODO_LABEL[c.metodoPago] ?? c.metodoPago}`
                                : ""}
                            </span>
                            {c.nroOperacion && (
                              <span className="ec-nroop">
                                N.° op. {c.nroOperacion}
                              </span>
                            )}
                          </div>
                        ) : c.estado === "exonerada" ? (
                          <div className="ec-pago ec-pago--exon">
                            <span className="ec-exon-label">Exonerada</span>
                            {c.motivo && (
                              <span className="ec-exon-motivo" title={c.motivo}>
                                {c.motivo}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      {hasActions && (
                        <td>
                          <div className="ec-rowactions">
                            {pendiente && canPay && (
                              <button
                                className="btn btn--primary btn--sm"
                                onClick={() =>
                                  router.push(
                                    `/socios/${socio.id}/deudas/pagar/${c.id}`,
                                  )
                                }
                                title={
                                  auto
                                    ? "Registrar el pago del autovalúo con su N.° de operación"
                                    : "Registrar el pago de esta cuota"
                                }
                              >
                                Pagar
                              </button>
                            )}
                            {pendiente && canWrite && (
                              <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => setExonerar(c)}
                                title="Exonerar (condonar) esta cuota con un motivo"
                              >
                                Exonerar
                              </button>
                            )}
                            {c.estado === "exonerada" && canWrite && (
                              <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => onRevertir(c)}
                                disabled={revirtiendo === c.id}
                                title="Revertir la exoneración (vuelve a ser deuda)"
                              >
                                {revirtiendo === c.id ? "Revirtiendo…" : "Revertir"}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {cuotasFiltradas.length > pageSize && (
              <Pagination
                total={cuotasFiltradas.length}
                page={page}
                pageSize={pageSize}
                noun="cuota"
                onPage={setPage}
                onPageSize={setPageSize}
              />
            )}
            </>
          )}
        </>
      )}

      {exonerar && (
        <ExonerarModal
          cuota={exonerar}
          onClose={() => setExonerar(null)}
          onDone={() => {
            setExonerar(null);
            load();
          }}
        />
      )}

      {payOpen && data && (
        <PagoPorMontoModal
          socioId={socio.id}
          socioNombre={socio.nombreCorto}
          deuda={data.deuda}
          pendientes={pendientes}
          onClose={() => setPayOpen(false)}
          onDone={(msg) => {
            setPayOpen(false);
            setSelected(new Set());
            setFlash(msg);
            load();
          }}
        />
      )}

      {paySelOpen && (
        <PagarSeleccionModal
          socioId={socio.id}
          socioNombre={socio.nombreCorto}
          cuotas={selRows.map((c) => ({
            id: c.id,
            periodo: c.periodo,
            concepto: c.concepto,
            monto: c.monto,
          }))}
          onClose={() => setPaySelOpen(false)}
          onDone={(msg) => {
            setPaySelOpen(false);
            setSelected(new Set());
            setFlash(msg);
            load();
          }}
        />
      )}
    </div>
  );
}
