"use client";

import "../../socios/socios.css";
import "../asambleas.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { Pagination } from "@/components/admin/Pagination";
import { useToast } from "@/components/admin/toast";
import { fechaLargaTS, horaLima } from "@/lib/fecha";
import { normalizeToken, splitSearchTokens } from "@/lib/socios/normalize";
import { useEscClose } from "@/lib/ui/useEscClose";
import { ConfirmDialog } from "../../socios/ConfirmDialog";
import { EditMultasModal } from "./EditMultasModal";
import {
  setAsistencia,
  deleteAsamblea,
  marcarTodosAsistencia,
  checkInByDni,
  checkInBySocio,
  aplicarMultasAsamblea,
  exportAsistenciaXlsx,
  setEstadoAsamblea,
} from "../actions";
import type { CheckInResult } from "../types";
import type {
  EstadoAsistencia,
  EstadoAsamblea,
} from "@/generated/prisma/client";
import type { AsambleaDetail, AsistenciaRow, PermFlags } from "../types";

type CheckLog = {
  id: number;
  ok: boolean;
  text: string;
  estado?: "presente" | "tardanza";
};

const SEG: { v: EstadoAsistencia; label: string; aria: string }[] = [
  { v: "presente", label: "Presente", aria: "Presente" },
  { v: "tardanza", label: "Tard.", aria: "Tardanza" },
  { v: "justificado", label: "Justif.", aria: "Justificado" },
  { v: "ausente", label: "Ausente", aria: "Ausente" },
];

const ESTADO_LABEL: Record<string, string> = {
  programada: "Programada",
  en_curso: "En curso",
  cerrada: "Cerrada",
};

export function AsambleaDetailClient({
  initial,
  perms,
}: {
  initial: AsambleaDetail;
  perms: PermFlags;
}) {
  const router = useRouter();
  const toast = useToast();
  const [asistencias, setAsistencias] = useState<AsistenciaRow[]>(
    initial.asistencias,
  );
  const [filter, setFilter] = useState("");
  // Vista de la lista: "registrados" (solo presentes/tardanzas, creciendo en
  // vivo al registrar) es la principal; "todos" expone el padrón completo para
  // correcciones (justificar, marcar ausente). Por defecto: registrados.
  const [view, setView] = useState<"registrados" | "todos">("registrados");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [, startTransition] = useTransition();
  const [bulkPending, setBulkPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<EstadoAsistencia | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [confirmMultas, setConfirmMultas] = useState(false);
  const [multasPending, setMultasPending] = useState(false);
  const [editingMultas, setEditingMultas] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [estado, setEstado] = useState<EstadoAsamblea>(initial.estado);
  const [pendingEstado, setPendingEstado] = useState<EstadoAsamblea | null>(null);
  const [confirmEstado, setConfirmEstado] = useState<EstadoAsamblea | null>(null);
  const estadoPending = pendingEstado !== null;

  // Reconciliar con el servidor cuando llegan props nuevas (tras router.refresh):
  // permite converger con check-ins hechos desde otro dispositivo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAsistencias(initial.asistencias);
  }, [initial.asistencias]);

  // Mantener el estado local de la asamblea en sincronía con el servidor.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado(initial.estado);
  }, [initial.estado]);

  async function cambiarEstado(next: EstadoAsamblea) {
    if (estadoPending || next === estado) return;
    setPendingEstado(next);
    const res = await setEstadoAsamblea(initial.id, next);
    if (!res.ok) {
      setPendingEstado(null);
      toast.error(res.error);
      return;
    }
    setEstado(next);
    setPendingEstado(null);
    setConfirmEstado(null);
    toast.success(
      next === "en_curso" && estado === "cerrada"
        ? "Asamblea reabierta."
        : next === "en_curso"
          ? "Registro de asistencia abierto. Los socios ya pueden marcar."
          : "Asamblea cerrada. La asistencia quedó finalizada.",
    );
    router.refresh();
  }

  // Modo puerta (check-in por DNI, nombre o apellidos)
  const [query, setQuery] = useState("");
  const [checking, setChecking] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [success, setSuccess] = useState<CheckInResult | null>(null);
  const [log, setLog] = useState<CheckLog[]>([]);
  const logSeq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Coincidencias contra la lista de la asamblea (ya está toda en memoria):
  // por nombre/apellidos, código o DNI, tolerando acentos y puntuación.
  const matches = useMemo(() => {
    const tokens = splitSearchTokens(query).map(normalizeToken).filter(Boolean);
    if (tokens.length === 0) return [];
    return asistencias
      .filter((a) => {
        const hay = normalizeToken(
          `${a.socioNombre} ${a.socioCodigo} ${a.socioDni ?? ""}`,
        );
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 8);
  }, [asistencias, query]);

  // Procesa el resultado del servidor (por DNI o por socio): refleja en la lista,
  // apila el log de la puerta y abre el modal de confirmación.
  function procesarResultado(
    res: Awaited<ReturnType<typeof checkInBySocio>>,
    errorPrefix = "",
  ) {
    if (!res.ok) {
      setLog((prev) =>
        [
          {
            id: logSeq.current++,
            ok: false,
            text: `${errorPrefix}${res.error}`,
          },
          ...prev,
        ].slice(0, 8),
      );
      toast.error(`${errorPrefix}${res.error}`);
      return;
    }
    const d = res.data!;
    setAsistencias((prev) =>
      prev.map((a) =>
        a.socioCodigo === d.socioCodigo
          ? { ...a, estado: d.estado, marcadoEn: d.hora }
          : a,
      ),
    );
    const horaTxt = horaLima(d.hora);
    const estadoTxt = d.estado === "presente" ? "Presente" : "Tardanza";
    setLog((prev) =>
      [
        {
          id: logSeq.current++,
          ok: true,
          estado: d.estado,
          text: `${d.socioNombre} — ${estadoTxt} ${horaTxt}${
            d.yaRegistrado ? " (ya estaba registrado)" : ""
          }`,
        },
        ...prev,
      ].slice(0, 8),
    );
    setSuccess(d);
    setQuery("");
    setActiveIdx(0);
    router.refresh();
  }

  // Registra por socioId (selección desde el buscador por nombre).
  async function registrarSocio(socioId: string) {
    if (checking) return;
    setChecking(true);
    const res = await checkInBySocio(initial.id, socioId);
    setChecking(false);
    searchRef.current?.focus();
    procesarResultado(res);
  }

  // Enter/Registrar: si hay coincidencias, marca la seleccionada; si no hay pero
  // el texto es un DNI, cae al servidor por DNI (da errores precisos: socio que no
  // existe o no pertenece a la asamblea). Para escáneres de DNI el flujo es directo.
  async function doCheckIn() {
    if (checking) return;
    const raw = query.trim();
    if (!raw) return;
    if (matches.length > 0) {
      const chosen = matches[Math.min(activeIdx, matches.length - 1)];
      await registrarSocio(chosen.socioId);
      return;
    }
    if (/^\d{6,12}$/.test(raw)) {
      setChecking(true);
      const res = await checkInByDni(initial.id, raw);
      setChecking(false);
      searchRef.current?.focus();
      procesarResultado(res, `DNI ${raw}: `);
      return;
    }
    toast.error("Sin coincidencias. Escribe DNI, nombre o apellidos.");
  }

  const counts = useMemo(() => {
    const c = { presente: 0, ausente: 0, justificado: 0, tardanza: 0 };
    for (const a of asistencias) c[a.estado]++;
    return c;
  }, [asistencias]);

  const total = asistencias.length;
  const asistieron = counts.presente + counts.tardanza;
  const pct = total > 0 ? Math.round((asistieron / total) * 100) : 0;
  const hasQuorum =
    initial.quorumMinimo != null ? pct >= initial.quorumMinimo : null;

  // Multas: montos definidos en la asamblea + preview de cuánto se cargaría
  // según la asistencia actual (presentes y justificados no pagan).
  const mt = initial.multaTardanza ?? 0;
  const mi = initial.multaInasistencia ?? 0;
  const tieneMultas = mt > 0 || mi > 0;
  const multaTotal =
    (mt > 0 ? counts.tardanza : 0) * mt + (mi > 0 ? counts.ausente : 0) * mi;

  const filtered = useMemo(() => {
    // Base según la vista: "registrados" = presentes/tardanzas, con el último
    // marcado arriba (la lista crece desde el tope al registrar); "todos" = el
    // padrón completo en orden alfabético del servidor.
    const base =
      view === "registrados"
        ? asistencias
            .filter((a) => a.estado === "presente" || a.estado === "tardanza")
            .slice()
            .sort((a, b) =>
              (b.marcadoEn ?? "").localeCompare(a.marcadoEn ?? ""),
            )
        : asistencias;
    const q = filter.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (a) =>
        a.socioNombre.toLowerCase().includes(q) ||
        a.socioCodigo.toLowerCase().includes(q),
    );
  }, [asistencias, filter, view]);

  // Paginación client-side (10/pág por defecto). currentPage va acotado por si
  // el filtro reduce los resultados por debajo de la página actual.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  async function marcarTodos(estado: EstadoAsistencia) {
    if (!perms.canAttendance || bulkPending) return;
    const label = estado === "presente" ? "presentes" : "ausentes";
    // Snapshot del estado ACTUAL (no del prop inicial) para revertir sin perder
    // los check-ins/cambios hechos durante la sesión si la acción falla.
    const prev = asistencias;
    setBulkPending(true);
    const now = new Date().toISOString();
    const marca = estado === "presente" || estado === "tardanza";
    // Optimista
    setAsistencias((p) =>
      p.map((a) => ({ ...a, estado, marcadoEn: marca ? now : a.marcadoEn })),
    );
    const res = await marcarTodosAsistencia(initial.id, estado);
    setBulkPending(false);
    if (!res.ok) {
      setAsistencias(prev);
      toast.error(res.error);
    } else {
      toast.success(`${total} socios marcados como ${label}.`);
      router.refresh();
    }
  }

  function mark(row: AsistenciaRow, estado: EstadoAsistencia) {
    if (!perms.canAttendance || row.estado === estado || savingIds.has(row.id))
      return;
    setSavingIds((s) => new Set(s).add(row.id));
    // Al marcar asistencia manualmente, sella la hora para que suba al tope de
    // "Registrados"; los demás estados conservan su marca previa.
    const marcadoEn =
      estado === "presente" || estado === "tardanza"
        ? new Date().toISOString()
        : row.marcadoEn;
    // Optimista
    setAsistencias((prev) =>
      prev.map((a) => (a.id === row.id ? { ...a, estado, marcadoEn } : a)),
    );
    startTransition(async () => {
      const res = await setAsistencia(row.id, estado);
      if (!res.ok) {
        // revertir
        setAsistencias((prev) =>
          prev.map((a) =>
            a.id === row.id
              ? { ...a, estado: row.estado, marcadoEn: row.marcadoEn }
              : a,
          ),
        );
        toast.error(res.error);
      }
      setSavingIds((s) => {
        const n = new Set(s);
        n.delete(row.id);
        return n;
      });
    });
  }

  const handleAplicarMultas = async () => {
    if (multasPending) return;
    setMultasPending(true);
    const res = await aplicarMultasAsamblea(initial.id);
    setMultasPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const d = res.data!;
    const nuevas = d.tardanzas + d.ausentes;
    toast.success(
      nuevas > 0
        ? `Multas cargadas: ${d.tardanzas} tardanza(s) + ${d.ausentes} ausente(s) = S/ ${d.total.toFixed(2)}${
            d.yaExistentes ? ` · ${d.yaExistentes} ya estaban` : ""
          }`
        : `Sin multas nuevas — las ${d.yaExistentes} ya estaban cargadas.`,
    );
    setConfirmMultas(false);
    router.refresh();
  };

  const handleExportAsistencia = async () => {
    if (exporting) return;
    setExporting(true);
    const res = await exportAsistenciaXlsx(initial.id);
    if (!res.ok) {
      toast.error(res.error);
      setExporting(false);
      return;
    }
    const d = res.data!;
    if (d.count === 0) {
      toast.error(
        "Aún no hay asistentes (presente o tardanza) para la hoja de firmas.",
      );
      setExporting(false);
      return;
    }
    // base64 → bytes → Blob .xlsx (igual que el export de socios).
    const bin = atob(d.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = d.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Hoja de firmas generada (${d.count} asistentes).`);
    setExporting(false);
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const res = await deleteAsamblea(initial.id);
    setDeleting(false);
    if (res.ok) {
      toast.success("Asamblea eliminada.");
      router.push("/asambleas");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <button
            className="btn btn--ghost"
            style={{ padding: "4px 8px", marginBottom: 8 }}
            onClick={() => router.push("/asambleas")}
          >
            <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} />
            <span>Asambleas</span>
          </button>
          <h1 className="socios-page__title">{initial.titulo}</h1>
          <span className="socios-page__sub">
            {fechaLargaTS(initial.fecha)}{" "}
            · <span style={{ textTransform: "capitalize" }}>{initial.tipo}</span>{" "}
            ·{" "}
            <span className={`asm-badge asm-badge--${estado}`}>
              {ESTADO_LABEL[estado]}
            </span>
            {initial.lugar ? ` · ${initial.lugar}` : ""}
            {tieneMultas
              ? ` · Multas: ${mt > 0 ? `tardanza S/ ${mt.toFixed(2)}` : ""}${
                  mt > 0 && mi > 0 ? " · " : ""
                }${mi > 0 ? `inasistencia S/ ${mi.toFixed(2)}` : ""}${
                  initial.multasAplicadasEn ? " (aplicadas)" : ""
                }`
              : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {perms.canAttendance && estado === "programada" && (
            <button
              className="btn btn--primary"
              onClick={() => cambiarEstado("en_curso")}
              disabled={estadoPending}
              title="Abre el registro de asistencia: los socios ya pueden marcar al escanear el QR, aunque aún no llegue la hora de inicio"
            >
              <Icon name="check" size={16} />
              <span>{estadoPending ? "Abriendo…" : "Iniciar asistencia"}</span>
            </button>
          )}
          {perms.canAttendance && estado === "en_curso" && (
            <button
              className="btn btn--ghost"
              onClick={() => setConfirmEstado("cerrada")}
              disabled={estadoPending}
              title="Cierra la asamblea y finaliza la asistencia (ya no se admiten más registros)"
            >
              <Icon name="lock" size={16} />
              <span>{estadoPending ? "Cerrando…" : "Cerrar asamblea"}</span>
            </button>
          )}
          {perms.canAttendance && estado === "cerrada" && (
            <button
              className="btn btn--ghost"
              onClick={() => setConfirmEstado("en_curso")}
              disabled={estadoPending}
              title="Reabre el registro de asistencia (corrección)"
            >
              <Icon name="clock" size={16} />
              <span>{estadoPending ? "Reabriendo…" : "Reabrir"}</span>
            </button>
          )}
          {perms.canAttendance && (
            <Link href={`/asambleas/${initial.id}/qr`} className="btn btn--ghost">
              <Icon name="apps" size={16} />
              <span>QR de asistencia</span>
            </Link>
          )}
          {perms.canWrite && (
            <button
              className="btn btn--ghost"
              onClick={() => setEditingMultas(true)}
              title="Definir o editar los montos de multa por tardanza e inasistencia"
            >
              <Icon name="settings" size={16} />
              <span>{tieneMultas ? "Editar multas" : "Definir multas"}</span>
            </button>
          )}
          {tieneMultas && perms.canAttendance && (
            <button
              className="btn btn--ghost"
              onClick={() => setConfirmMultas(true)}
              disabled={multasPending}
              title="Cargar como deuda las multas por tardanza e inasistencia"
            >
              <Icon name="card" size={16} />
              <span>
                {initial.multasAplicadasEn ? "Reaplicar multas" : "Aplicar multas"}
              </span>
            </button>
          )}
          {perms.canDelete && (
            <button
              className="btn btn--ghost"
              style={{ color: "#b91c1c" }}
              onClick={() => setConfirmingDelete(true)}
              disabled={deleting}
            >
              <Icon name="trash" size={16} />
              <span>Eliminar</span>
            </button>
          )}
        </div>
      </header>

      {initial.agenda && (
        <div
          style={{
            background: "var(--bg-soft)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13.5,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          <strong style={{ display: "block", marginBottom: 4 }}>Agenda</strong>
          {initial.agenda}
        </div>
      )}

      <div className="quorum">
        <div className="quorum__top">
          <div className="quorum__pct">
            {pct}%
            {hasQuorum != null && (
              <span
                style={{
                  fontSize: 14,
                  marginLeft: 10,
                  color: hasQuorum ? "#16a34a" : "#d97706",
                  fontWeight: 600,
                }}
              >
                {hasQuorum ? "✓ Quórum alcanzado" : "Sin quórum"}
              </span>
            )}
          </div>
          <div className="quorum__label">
            {asistieron} de {total} asistieron
            {initial.quorumMinimo != null
              ? ` · mínimo ${initial.quorumMinimo}%`
              : ""}
          </div>
        </div>
        <div className="quorum__bar">
          <div
            className={`quorum__fill ${
              hasQuorum === false ? "quorum__fill--low" : "quorum__fill--ok"
            }`}
            style={{ width: `${pct}%` }}
          />
          {initial.quorumMinimo != null && (
            <span
              className="quorum__min"
              style={{ left: `${initial.quorumMinimo}%` }}
            />
          )}
        </div>
        <div className="quorum__breakdown">
          <span className="quorum__chip">
            <span className="quorum__dot quorum__dot--presente" />
            {counts.presente} presentes
          </span>
          <span className="quorum__chip">
            <span className="quorum__dot quorum__dot--tardanza" />
            {counts.tardanza} tardanzas
          </span>
          <span className="quorum__chip">
            <span className="quorum__dot quorum__dot--justificado" />
            {counts.justificado} justificados
          </span>
          <span className="quorum__chip">
            <span className="quorum__dot quorum__dot--ausente" />
            {counts.ausente} ausentes
          </span>
        </div>
      </div>

      {perms.canAttendance && total > 0 && (
        <div className="checkin">
          <div className="checkin__head">
            <div>
              <div className="checkin__title">
                <Icon name="device" size={16} /> Check-in en la puerta
              </div>
              <div className="checkin__sub">
                Entrada {horaLima(initial.fecha)} · tolerancia{" "}
                {initial.toleranciaMin} min · presente hasta{" "}
                {horaLima(
                  new Date(
                    new Date(initial.fecha).getTime() +
                      initial.toleranciaMin * 60000,
                  ),
                )}
              </div>
            </div>
          </div>
          <form
            className="checkin__form"
            onSubmit={(e) => {
              e.preventDefault();
              doCheckIn();
            }}
          >
            <div className="checkin__search">
              <input
                ref={searchRef}
                className="checkin__input"
                autoFocus
                autoComplete="off"
                placeholder="Escanea el DNI o escribe nombre / apellidos y presiona Enter"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                onKeyDown={(e) => {
                  if (matches.length === 0) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIdx((i) => Math.min(i + 1, matches.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(i - 1, 0));
                  }
                }}
                disabled={checking}
              />
              {matches.length > 0 && (
                <ul className="checkin__dropdown">
                  {matches.map((m, i) => {
                    const marcado =
                      m.estado === "presente" || m.estado === "tardanza";
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          className={`checkin__opt${
                            i === activeIdx ? " is-active" : ""
                          }`}
                          onMouseEnter={() => setActiveIdx(i)}
                          onClick={() => registrarSocio(m.socioId)}
                          disabled={checking}
                        >
                          <span className="checkin__opt-name">
                            {m.socioNombre}
                          </span>
                          <span className="checkin__opt-meta">
                            {m.socioDni ? `DNI ${m.socioDni}` : "Sin DNI"} ·{" "}
                            {m.socioCodigo}
                            {marcado && (
                              <span className="checkin__opt-flag">
                                ✓{" "}
                                {m.estado === "presente"
                                  ? "Presente"
                                  : "Tardanza"}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={checking || query.trim() === ""}
            >
              {checking ? "Registrando…" : "Registrar"}
            </button>
          </form>
          {log.length > 0 && (
            <ul className="checkin__log">
              {log.map((l) => (
                <li
                  key={l.id}
                  className={
                    l.ok
                      ? l.estado === "tardanza"
                        ? "checkin__log--tarde"
                        : "checkin__log--ok"
                      : "checkin__log--err"
                  }
                >
                  <Icon
                    name={l.ok ? "check" : "close"}
                    size={14}
                  />
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="asm-toolbar">
        {total > 0 && (
          <div
            className="asm-viewtabs"
            role="tablist"
            aria-label="Vista de asistencia"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "registrados"}
              className={`asm-viewtab${view === "registrados" ? " is-active" : ""}`}
              onClick={() => {
                setView("registrados");
                setPage(1);
              }}
            >
              Registrados
              <span className="asm-viewtab__n">{asistieron}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "todos"}
              className={`asm-viewtab${view === "todos" ? " is-active" : ""}`}
              onClick={() => {
                setView("todos");
                setPage(1);
              }}
            >
              Todos
              <span className="asm-viewtab__n">{total}</span>
            </button>
          </div>
        )}
        <input
          className="socios-toolbar__search"
          placeholder="Filtrar socio por nombre o código…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        />
        {total > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleExportAsistencia}
            disabled={exporting}
            title="Descargar la hoja de firmas de los asistidos (Excel), ordenada por llegada"
          >
            <Icon name="download" size={15} />
            <span>{exporting ? "Generando…" : "Hoja de firmas"}</span>
          </button>
        )}
        {perms.canAttendance && total > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setBulkConfirm("presente")}
              disabled={bulkPending}
            >
              <Icon name="check" size={15} />
              <span>Todos presente</span>
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setBulkConfirm("ausente")}
              disabled={bulkPending}
            >
              Todos ausente
            </button>
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="socios-empty">
          <p>
            No hay socios en la lista de asistencia. La asamblea se creó sin
            socios activos en el padrón.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="socios-empty">
          {filter.trim() !== "" ? (
            <p>Sin coincidencias para “{filter}”.</p>
          ) : view === "registrados" ? (
            <p>
              Aún no hay socios registrados. Escanea el DNI o busca al socio
              arriba para registrar la asistencia; irán apareciendo aquí.
            </p>
          ) : (
            <p>No hay socios en la lista.</p>
          )}
        </div>
      ) : (
        <>
          <div className="asis-list">
            <div className="asis-head">
              <span className="asis-head__num">#</span>
              <span className="asis-head__socio">Socio</span>
              <span className="asis-head__estado">Estado</span>
            </div>
            {paged.map((row, i) => (
              <div className="asis-row" key={row.id}>
                <span className="asis-row__num">
                  {(currentPage - 1) * pageSize + i + 1}
                </span>
                <div className="asis-row__info">
                  <div className="asis-row__name">{row.socioNombre}</div>
                  <div className="asis-row__codigo">{row.socioCodigo}</div>
                </div>
                <div
                  className="asis-seg"
                  role="group"
                  aria-label={`Estado de ${row.socioNombre}`}
                >
                  {SEG.map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      className={row.estado === s.v ? `is-on--${s.v}` : ""}
                      aria-pressed={row.estado === s.v}
                      aria-label={s.aria}
                      onClick={() => mark(row, s.v)}
                      disabled={!perms.canAttendance || savingIds.has(row.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Pagination
            total={filtered.length}
            page={currentPage}
            pageSize={pageSize}
            noun="socio"
            pageSizes={[10, 25, 50, 100]}
            onPage={(p) => setPage(p)}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </>
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title="Marcar asistencia"
          description={
            <>
              ¿Marcar a los <b>{total}</b> socios como{" "}
              {bulkConfirm === "presente" ? "presentes" : "ausentes"}?
              {filter.trim() !== "" && (
                <div style={{ marginTop: 8, color: "#b45309", fontSize: 13 }}>
                  Se aplica a <b>todos</b> los {total} socios, no solo a los{" "}
                  {filtered.length} del filtro actual.
                </div>
              )}
            </>
          }
          confirmLabel="Marcar"
          busy={bulkPending}
          onConfirm={async () => {
            if (!bulkConfirm) return;
            await marcarTodos(bulkConfirm);
            setBulkConfirm(null);
          }}
          onClose={() => !bulkPending && setBulkConfirm(null)}
        />
      )}

      {confirmEstado && (
        <ConfirmDialog
          title={
            confirmEstado === "cerrada" ? "Cerrar asamblea" : "Reabrir asamblea"
          }
          description={
            confirmEstado === "cerrada" ? (
              <>
                Se finaliza la asistencia: los socios y la puerta ya no podrán
                registrar más asistencias. Podrás reabrirla después si necesitas
                corregir.
              </>
            ) : (
              <>
                Reabrir vuelve a admitir registros de asistencia en una asamblea
                ya cerrada. Esto puede <b>alterar el quórum y las multas</b> si
                ya se aplicaron. Úsalo solo para corregir.
              </>
            )
          }
          confirmLabel={confirmEstado === "cerrada" ? "Cerrar" : "Reabrir"}
          tone={confirmEstado === "en_curso" ? "danger" : undefined}
          busy={estadoPending}
          onConfirm={() => cambiarEstado(confirmEstado)}
          onClose={() => !estadoPending && setConfirmEstado(null)}
        />
      )}

      {confirmMultas && (
        <ConfirmDialog
          title="Aplicar multas de la asamblea"
          description={
            <>
              Se cargará como <b>deuda</b>:
              {mt > 0 && (
                <div style={{ marginTop: 4 }}>
                  · {counts.tardanza} en tardanza × S/ {mt.toFixed(2)} = S/{" "}
                  {(counts.tardanza * mt).toFixed(2)}
                </div>
              )}
              {mi > 0 && (
                <div style={{ marginTop: 4 }}>
                  · {counts.ausente} ausente(s) × S/ {mi.toFixed(2)} = S/{" "}
                  {(counts.ausente * mi).toFixed(2)}
                </div>
              )}
              <div style={{ marginTop: 8, fontWeight: 700 }}>
                Total: S/ {multaTotal.toFixed(2)}
              </div>
              <div
                style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}
              >
                Presentes y justificados no pagan.
                {initial.multasAplicadasEn
                  ? " Ya se aplicaron antes — no se duplican las existentes."
                  : ""}
              </div>
            </>
          }
          confirmLabel="Aplicar multas"
          busy={multasPending}
          onConfirm={handleAplicarMultas}
          onClose={() => !multasPending && setConfirmMultas(false)}
        />
      )}

      {editingMultas && (
        <EditMultasModal
          asambleaId={initial.id}
          initialTardanza={initial.multaTardanza}
          initialInasistencia={initial.multaInasistencia}
          yaAplicadas={initial.multasAplicadasEn != null}
          onClose={() => setEditingMultas(false)}
          onSaved={() => {
            setEditingMultas(false);
            toast.success("Multas actualizadas.");
            router.refresh();
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Eliminar “${initial.titulo}”`}
          description={
            <>
              Esta acción es <b>irreversible</b>. Se elimina la asamblea y todos
              sus registros de asistencia.
            </>
          }
          confirmLabel="Eliminar definitivamente"
          tone="danger"
          busy={deleting}
          onConfirm={handleDelete}
          onClose={() => !deleting && setConfirmingDelete(false)}
        />
      )}

      {success && (
        <CheckinSuccessModal
          result={success}
          onClose={() => {
            setSuccess(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

// Modal de confirmación tras registrar la asistencia por la puerta. Se cierra con
// Esc, clic fuera o el botón "Listo" (autoenfocado para poder cerrarlo con Enter y
// seguir escaneando).
function CheckinSuccessModal({
  result,
  onClose,
}: {
  result: CheckInResult;
  onClose: () => void;
}) {
  useEscClose(true, onClose, false);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btnRef.current?.focus();
  }, []);
  const estadoTxt = result.estado === "tardanza" ? "Tardanza" : "Presente";
  // Un re-escaneo de alguien ya marcado NO registra nada (gana el primer
  // registro). Se distingue visualmente del alta real —banda ámbar + reloj en
  // vez de verde/azul + check— para que el operador de la puerta lo note de un
  // vistazo y no crea que acaba de registrarlo.
  const ya = result.yaRegistrado;
  const tone = ya ? "ya" : result.estado;
  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div
        className="confirm checkin-ok"
        role="alertdialog"
        aria-live="assertive"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`checkin-ok__banner checkin-ok__banner--${tone}`}>
          <div className="checkin-ok__icon">
            <Icon name={ya ? "clock" : "check"} size={30} />
          </div>
          <p className="checkin-ok__estado">{ya ? "Ya registrado" : estadoTxt}</p>
          <p className="checkin-ok__time">{horaLima(result.hora)}</p>
        </div>
        <div className="checkin-ok__body">
          <p className="checkin-ok__name">{result.socioNombre}</p>
          <p className="checkin-ok__code">{result.socioCodigo}</p>
          <p className="checkin-ok__status">
            {ya
              ? `Se conserva su registro original (${estadoTxt}) — sin cambios.`
              : "Asistencia registrada correctamente."}
          </p>
          <button
            ref={btnRef}
            className="btn btn--primary checkin-ok__done"
            onClick={onClose}
          >
            Listo
          </button>
          <p className="checkin-ok__hint">
            Pulsa <kbd>Enter</kbd> para seguir registrando
          </p>
        </div>
      </div>
    </div>
  );
}
