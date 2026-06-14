"use client";

import "../../socios/socios.css";
import "../asambleas.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { fechaLargaTS, horaLima } from "@/lib/fecha";
import { ConfirmDialog } from "../../socios/ConfirmDialog";
import {
  setAsistencia,
  deleteAsamblea,
  marcarTodosAsistencia,
  checkInByDni,
} from "../actions";
import type { EstadoAsistencia } from "@/generated/prisma/client";
import type { AsambleaDetail, AsistenciaRow, PermFlags } from "../types";

type CheckLog = {
  id: number;
  ok: boolean;
  text: string;
  estado?: "presente" | "tardanza";
};

const SEG: { v: EstadoAsistencia; label: string }[] = [
  { v: "presente", label: "Presente" },
  { v: "tardanza", label: "Tard." },
  { v: "justificado", label: "Justif." },
  { v: "ausente", label: "Ausente" },
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
  const [, startTransition] = useTransition();
  const [bulkPending, setBulkPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<EstadoAsistencia | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Reconciliar con el servidor cuando llegan props nuevas (tras router.refresh):
  // permite converger con check-ins hechos desde otro dispositivo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAsistencias(initial.asistencias);
  }, [initial.asistencias]);

  // Modo puerta (check-in por DNI)
  const [dni, setDni] = useState("");
  const [checking, setChecking] = useState(false);
  const [log, setLog] = useState<CheckLog[]>([]);
  const logSeq = useRef(0);
  const dniRef = useRef<HTMLInputElement>(null);

  async function doCheckIn() {
    const num = dni.trim();
    if (checking) return;
    if (!/^\d{6,12}$/.test(num)) {
      toast.error("Ingresa un documento de 6 a 12 dígitos.");
      return;
    }
    setChecking(true);
    const res = await checkInByDni(initial.id, num);
    setChecking(false);
    setDni("");
    dniRef.current?.focus();
    if (!res.ok) {
      setLog((prev) =>
        [
          { id: logSeq.current++, ok: false, text: `DNI ${num}: ${res.error}` },
          ...prev,
        ].slice(0, 8),
      );
      toast.error(`DNI ${num}: ${res.error}`);
      return;
    }
    const d = res.data!;
    // Reflejar en la lista local
    setAsistencias((prev) =>
      prev.map((a) =>
        a.socioCodigo === d.socioCodigo ? { ...a, estado: d.estado } : a,
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
    toast.success(
      `${estadoTxt}: ${d.socioNombre}${d.yaRegistrado ? " (ya registrado)" : ""}`,
    );
    router.refresh();
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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return asistencias;
    return asistencias.filter(
      (a) =>
        a.socioNombre.toLowerCase().includes(q) ||
        a.socioCodigo.toLowerCase().includes(q),
    );
  }, [asistencias, filter]);

  async function marcarTodos(estado: EstadoAsistencia) {
    if (!perms.canAttendance || bulkPending) return;
    const label = estado === "presente" ? "presentes" : "ausentes";
    // Snapshot del estado ACTUAL (no del prop inicial) para revertir sin perder
    // los check-ins/cambios hechos durante la sesión si la acción falla.
    const prev = asistencias;
    setBulkPending(true);
    // Optimista
    setAsistencias((p) => p.map((a) => ({ ...a, estado })));
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
    // Optimista
    setAsistencias((prev) =>
      prev.map((a) => (a.id === row.id ? { ...a, estado } : a)),
    );
    startTransition(async () => {
      const res = await setAsistencia(row.id, estado);
      if (!res.ok) {
        // revertir
        setAsistencias((prev) =>
          prev.map((a) => (a.id === row.id ? { ...a, estado: row.estado } : a)),
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
            <span className={`asm-badge asm-badge--${initial.estado}`}>
              {ESTADO_LABEL[initial.estado]}
            </span>
            {initial.lugar ? ` · ${initial.lugar}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Link href={`/asambleas/${initial.id}/qr`} className="btn btn--ghost">
            <Icon name="apps" size={16} />
            <span>QR de asistencia</span>
          </Link>
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
            <input
              ref={dniRef}
              className="checkin__input"
              inputMode="numeric"
              autoFocus
              placeholder="Escanea o escribe el DNI y presiona Enter"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
              disabled={checking}
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={checking || !/^\d{6,12}$/.test(dni)}
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
        <input
          className="socios-toolbar__search"
          placeholder="Filtrar socio por nombre o código…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
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
      ) : (
        <div className="asis-list">
          {filtered.map((row) => (
            <div className="asis-row" key={row.id}>
              <div className="asis-row__info">
                <div className="asis-row__name">{row.socioNombre}</div>
                <div className="asis-row__codigo">{row.socioCodigo}</div>
              </div>
              <div className="asis-seg">
                {SEG.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    className={row.estado === s.v ? `is-on--${s.v}` : ""}
                    onClick={() => mark(row, s.v)}
                    disabled={!perms.canAttendance || savingIds.has(row.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="asis-row" style={{ color: "var(--text-muted)" }}>
              Sin coincidencias para “{filter}”.
            </div>
          )}
        </div>
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title="Marcar asistencia"
          description={`¿Marcar a los ${total} socios como ${
            bulkConfirm === "presente" ? "presentes" : "ausentes"
          }?`}
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
    </div>
  );
}
