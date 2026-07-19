"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { fechaCorta, fechaTS, fechaHora, hoyISOPeru } from "@/lib/fecha";
import { getSocio, updateSocio, deleteSocio, lookupDniAction } from "./actions";
import { EstadoBadge } from "./EstadoBadge";
import { DocumentoInput } from "./DocumentoInput";
import { AdjuntosPanel } from "./AdjuntosPanel";
import { ChangeEstadoModal } from "./ChangeEstadoModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { SocioCuotasTab } from "./SocioCuotasTab";
import type { SocioDetail, PermFlags, UpdateSocioPatch } from "./types";
import type {
  TipoDocumento,
  Sexo,
  EstadoPuesto,
  CargoDirectivo,
} from "@/generated/prisma/client";
import { GIRO_LABEL, DIMENSION_LABEL } from "@/lib/puestos/giro";

type Tab = "datos" | "puestos" | "adjuntos" | "cuotas" | "historial";
type LookupStatus = "idle" | "loading" | "success" | "error";

const CARGO_DIRECTIVO_LBL: Record<CargoDirectivo, string> = {
  presidente: "Presidente",
  vicepresidente: "Vicepresidente",
  secretario: "Secretario",
  tesorero: "Tesorero",
  fiscal: "Fiscal",
  vocal: "Vocal",
  coordinador: "Coordinador",
  otro: "Directivo",
};

const PUESTO_ESTADO_LBL: Record<EstadoPuesto, string> = {
  activo: "Activo",
  vacio: "Vacío",
  clausurado: "Clausurado",
  construccion: "En construcción",
};
const PUESTO_ESTADO_CLS: Record<EstadoPuesto, string> = {
  activo: "badge--green",
  vacio: "badge--neutral",
  clausurado: "badge--red",
  construccion: "badge--amber",
};

export function SocioDetailDrawer({
  socioId,
  perms,
  onClose,
}: {
  socioId: string;
  perms: PermFlags;
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [socio, setSocio] = useState<SocioDetail | null>(null);
  const [tab, setTab] = useState<Tab>("datos");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEscClose(true, onClose, deleting);

  async function reload() {
    const r = await getSocio(socioId);
    if (r.ok) setSocio(r.data!);
    else setLoadError(r.error);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getSocio(socioId);
      if (cancelled) return;
      if (r.ok) setSocio(r.data!);
      else setLoadError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [socioId]);

  const handleConfirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const res = await deleteSocio(socioId);
    setDeleting(false);
    if (res.ok) {
      setConfirmingDelete(false);
      toast.success("Socio eliminado.");
      onClose();
    } else {
      toast.error(res.error);
    }
  };

  if (loadError && !socio) {
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <aside
          className="drawer"
          onClick={(e) => e.stopPropagation()}
          style={{ padding: 24 }}
        >
          <p className="soc-error">{loadError}</p>
        </aside>
      </div>
    );
  }

  if (!socio) {
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <aside
          className="drawer"
          onClick={(e) => e.stopPropagation()}
          style={{ padding: 24 }}
        >
          <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
        </aside>
      </div>
    );
  }

  const initials = initialsFor(`${socio.apellidoPaterno} ${socio.nombres}`);
  const adjuntosCount = socio.adjuntos.filter((a) => a.tipo !== "foto").length;
  const fechaIngresoFmt = fechaCorta(socio.fechaIngreso);
  const updatedFmt = fechaTS(socio.updatedAt);
  const puestosVigentes = socio.puestos.filter((p) => p.hasta === null);
  const puestosHistoricos = socio.puestos.filter((p) => p.hasta !== null);

  // Lleva al plano de puestos resaltando los puestos de este socio (en la etapa
  // del puesto elegido). Ver focusSocioId en PuestoPlanoView.
  const verEnPlano = (etapa: number) =>
    router.push(`/puestos?view=plano&etapa=${etapa}&socio=${socio.id}`);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <header className="drawer__head">
          <div style={{ display: "flex", gap: 16, minWidth: 0, flex: 1 }}>
            <div className="soc-avatar">
              {socio.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={socio.fotoUrl} alt={`Foto de ${socio.nombres}`} />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="drawer__eyebrow">
                Socio · {socio.codigo}
                {socio.numeroPadron != null && ` · Padrón ${socio.numeroPadron}`}
              </div>
              <h2>
                {socio.apellidoPaterno} {socio.apellidoMaterno ?? ""},{" "}
                {socio.nombres}
              </h2>
              <div className="drawer__email">
                <Icon name="card" size={14} />
                {socio.tipoDocumento} {socio.numeroDocumento}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <EstadoBadge estado={socio.estado} />
                {socio.portalEnabled && (
                  <span className="badge badge--accent">Portal</span>
                )}
                {puestosVigentes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="badge badge--green soc-puesto-chip"
                    onClick={() => verEnPlano(p.etapa)}
                    title="Ver en el plano"
                  >
                    <Icon name="home" size={12} /> {p.codigo}
                  </button>
                ))}
                {socio.directivos.map((d) => (
                  <span
                    key={d.id}
                    className="badge"
                    style={{
                      background: "#ede9fe",
                      color: "#5b21b6",
                      borderColor: "#ddd6fe",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    title="Cargo directivo vigente"
                  >
                    <Icon name="shield" size={12} />
                    {CARGO_DIRECTIVO_LBL[d.cargo]}
                    {d.cargo === "coordinador" && d.bloque
                      ? ` · Bloque ${d.bloque}`
                      : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="drawer__stats">
          <div className="stat">
            <div className="stat__v">{adjuntosCount}</div>
            <div className="stat__l">Adjuntos</div>
          </div>
          <div className="stat">
            <div className="stat__v" style={{ fontSize: 14 }}>
              {fechaIngresoFmt}
            </div>
            <div className="stat__l">Fecha de ingreso</div>
          </div>
          <div className="stat">
            <div className="stat__v" style={{ fontSize: 14 }}>
              {updatedFmt}
            </div>
            <div className="stat__l">Actualizado</div>
          </div>
        </div>

        <div className="soc-tabs">
          <button
            className={`soc-tab ${tab === "datos" ? "is-active" : ""}`}
            onClick={() => setTab("datos")}
          >
            Datos
          </button>
          <button
            className={`soc-tab ${tab === "puestos" ? "is-active" : ""}`}
            onClick={() => setTab("puestos")}
          >
            Puestos
            {puestosVigentes.length > 0 && (
              <span className="soc-tab__count">{puestosVigentes.length}</span>
            )}
          </button>
          <button
            className={`soc-tab ${tab === "adjuntos" ? "is-active" : ""}`}
            onClick={() => setTab("adjuntos")}
          >
            Adjuntos
          </button>
          <button
            className={`soc-tab ${tab === "cuotas" ? "is-active" : ""}`}
            onClick={() => setTab("cuotas")}
          >
            Cuotas
          </button>
          <button
            className={`soc-tab ${tab === "historial" ? "is-active" : ""}`}
            onClick={() => setTab("historial")}
          >
            Historial
          </button>
        </div>

        <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
          {tab === "datos" && (
            <DatosForm
              key={socio.updatedAt}
              socio={socio}
              canWrite={perms.canWrite}
              canChangeState={perms.canChangeState}
              onReload={reload}
              onOpenChangeEstado={() => setChangeOpen(true)}
            />
          )}
          {tab === "puestos" && (
            <div className="soc-puestos">
              {socio.puestos.length === 0 ? (
                <div className="soc-puestos__empty">
                  <Icon name="home" size={28} />
                  <p>Este socio no tiene puestos asignados.</p>
                </div>
              ) : (
                <>
                  {puestosVigentes.length > 0 && (
                    <section>
                      <h4>
                        Puestos vigentes
                        {puestosVigentes.length > 1 && (
                          <button
                            type="button"
                            className="soc-puesto__verplano-all"
                            onClick={() => verEnPlano(puestosVigentes[0].etapa)}
                          >
                            <Icon name="apps" size={13} /> Ver los{" "}
                            {puestosVigentes.length} en el plano
                          </button>
                        )}
                      </h4>
                      {puestosVigentes.map((p) => (
                        <article
                          key={p.id}
                          className="soc-puesto soc-puesto--vigente soc-puesto--link"
                          role="button"
                          tabIndex={0}
                          title="Ver en el plano"
                          onClick={() => verEnPlano(p.etapa)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              verEnPlano(p.etapa);
                            }
                          }}
                        >
                          <div className="soc-puesto__head">
                            <span className="soc-puesto__code">
                              <Icon name="home" size={15} /> {p.codigo}
                            </span>
                            <span
                              className={`badge ${PUESTO_ESTADO_CLS[p.estadoPuesto]}`}
                            >
                              {PUESTO_ESTADO_LBL[p.estadoPuesto]}
                            </span>
                          </div>
                          <div className="soc-puesto__meta">
                            {p.giro && <span>{GIRO_LABEL[p.giro]}</span>}
                            <span>{DIMENSION_LABEL[p.dimension]}</span>
                          </div>
                          <div className="soc-puesto__dates">
                            Asignado desde {fechaTS(p.desde)}
                          </div>
                          <span className="soc-puesto__verplano">
                            <Icon name="apps" size={13} /> Ver en el plano
                          </span>
                        </article>
                      ))}
                    </section>
                  )}
                  {puestosHistoricos.length > 0 && (
                    <section>
                      <h4>Historial de asignaciones</h4>
                      {puestosHistoricos.map((p) => (
                        <article key={p.id} className="soc-puesto">
                          <div className="soc-puesto__head">
                            <span className="soc-puesto__code">{p.codigo}</span>
                            <span className="soc-puesto__period">
                              {fechaTS(p.desde)} – {fechaTS(p.hasta!)}
                            </span>
                          </div>
                          {p.motivo && (
                            <div className="soc-puesto__dates">
                              Motivo: {p.motivo}
                            </div>
                          )}
                        </article>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          )}
          {tab === "adjuntos" && (
            <AdjuntosPanel
              socio={socio}
              canWrite={perms.canWrite}
              onChanged={reload}
            />
          )}
          {tab === "cuotas" && <SocioCuotasTab socioId={socio.id} />}
          {tab === "historial" && (
            <ol className="historial">
              {socio.estadoLog.map((l) => (
                <li key={l.id}>
                  <span className="historial__time">
                    {fechaHora(l.createdAt)}
                  </span>
                  <strong className="historial__transition">
                    {l.fromEstado === l.toEstado
                      ? `Alta · ${l.toEstado}`
                      : `${l.fromEstado} → ${l.toEstado}`}
                  </strong>
                  <span className="historial__actor">
                    por {l.byUser?.name ?? "sistema"}
                  </span>
                  <p className="historial__motivo">{l.motivo}</p>
                </li>
              ))}
              {socio.estadoLog.length === 0 && (
                <li>
                  <span className="historial__actor">
                    No hay cambios de estado registrados.
                  </span>
                </li>
              )}
            </ol>
          )}
        </div>

        <footer className="drawer__foot">
          <button
            className="btn btn--ghost"
            style={{ color: "#b91c1c" }}
            onClick={() => setConfirmingDelete(true)}
            disabled={!perms.canDelete || deleting}
          >
            {deleting ? "Eliminando…" : "Eliminar socio"}
          </button>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Constancias (socio / no adeudo): se eligen en esa página. La de
                socio se emite a cualquier activo; la de no adeudo exige sin
                deuda. */}
            <a
              className="btn btn--ghost"
              href={`/socios/${socio.id}/constancia`}
              target="_blank"
              rel="noreferrer"
              title={
                socio.estado === "activo"
                  ? "Emitir constancia del socio (socio / no adeudo)"
                  : "Solo se emite a socios activos"
              }
            >
              <Icon
                name={socio.estado === "activo" ? "external" : "lock"}
                size={16}
              />
              <span>Constancia</span>
            </a>
            <a
              className="btn btn--ghost"
              href={`/socios/${socio.id}/renuncia`}
              target="_blank"
              rel="noreferrer"
              title="Generar la carta de renuncia del socio (para firmar)"
            >
              <Icon name="mail" size={16} />
              <span>Carta de renuncia</span>
            </a>
            <button className="btn btn--primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </footer>
      </aside>

      {changeOpen && (
        <ChangeEstadoModal
          socioId={socio.id}
          current={socio.estado}
          onClose={() => setChangeOpen(false)}
          onDone={() => {
            setChangeOpen(false);
            toast.success("Estado del socio actualizado.");
            reload();
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Eliminar a ${socio.apellidoPaterno} ${socio.nombres}`}
          description={
            <>
              Esta acción es <b>irreversible</b>. Se eliminarán los adjuntos
              del socio, su historial de estados y el registro en el padrón.
              Esta acción no se puede deshacer.
            </>
          }
          confirmLabel="Eliminar definitivamente"
          tone="danger"
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onClose={() => !deleting && setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/* ────────────────────── DatosForm ────────────────────── */

function DatosForm({
  socio,
  canWrite,
  canChangeState,
  onReload,
  onOpenChangeEstado,
}: {
  socio: SocioDetail;
  canWrite: boolean;
  canChangeState: boolean;
  onReload: () => void;
  onOpenChangeEstado: () => void;
}) {
  // Initial values derived from socio. We track dirty by comparing to these.
  type InitialState = {
    tipoDocumento: TipoDocumento;
    numeroDocumento: string;
    numeroPadron: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    nombres: string;
    fechaNacimiento: string;
    sexo: Sexo | "";
    estadoCivil: string;
    telefono: string;
    email: string;
    direccion: string;
    distrito: string;
    provincia: string;
    departamento: string;
    fechaIngreso: string;
    observaciones: string;
  };
  const initial = useMemo<InitialState>(
    () => ({
      tipoDocumento: socio.tipoDocumento,
      numeroDocumento: socio.numeroDocumento,
      numeroPadron: socio.numeroPadron != null ? String(socio.numeroPadron) : "",
      apellidoPaterno: socio.apellidoPaterno,
      apellidoMaterno: socio.apellidoMaterno ?? "",
      nombres: socio.nombres,
      fechaNacimiento: socio.fechaNacimiento
        ? socio.fechaNacimiento.slice(0, 10)
        : "",
      sexo: socio.sexo ?? "",
      estadoCivil: socio.estadoCivil ?? "",
      telefono: socio.telefono ?? "",
      email: socio.email ?? "",
      direccion: socio.direccion ?? "",
      distrito: socio.distrito ?? "",
      provincia: socio.provincia ?? "",
      departamento: socio.departamento ?? "",
      fechaIngreso: socio.fechaIngreso.slice(0, 10),
      observaciones: socio.observaciones ?? "",
    }),
    [socio],
  );

  const toast = useToast();
  const [tipo, setTipo] = useState<TipoDocumento>(initial.tipoDocumento);
  const [numero, setNumero] = useState(initial.numeroDocumento);
  const [numeroPadron, setNumeroPadron] = useState(initial.numeroPadron);
  const [ap, setAP] = useState(initial.apellidoPaterno);
  const [am, setAM] = useState(initial.apellidoMaterno);
  const [nombres, setNombres] = useState(initial.nombres);
  const [fechaNacimiento, setFN] = useState(initial.fechaNacimiento);
  const [sexo, setSexo] = useState<Sexo | "">(initial.sexo);
  const [estadoCivil, setEC] = useState(initial.estadoCivil);
  const [telefono, setTel] = useState(initial.telefono);
  const [email, setEmail] = useState(initial.email);
  const [direccion, setDir] = useState(initial.direccion);
  const [distrito, setDis] = useState(initial.distrito);
  const [provincia, setProv] = useState(initial.provincia);
  const [departamento, setDept] = useState(initial.departamento);
  const [fechaIngreso, setFI] = useState(initial.fechaIngreso);
  const [observaciones, setObs] = useState(initial.observaciones);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  // Autocompletado por DNI (RENIEC vía UNAMAD) al editar: si cambias el documento
  // a un DNI de 8 dígitos distinto, trae los datos y los SOBREESCRIBE (para corregir).
  const [, startLookup] = useTransition();
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  // Init al DNI actual → no consulta al abrir el socio; solo cuando lo cambias.
  const [lookedUpDni, setLookedUpDni] = useState<string | null>(
    initial.numeroDocumento,
  );
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (tipo !== "DNI" || !/^\d{8}$/.test(numero)) {
      // Reset del estado transitorio del lookup cuando el documento deja de ser
      // un DNI válido (mismo patrón de disable que AdminShell para esta regla).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLookupStatus("idle");
      setLookupMessage(null);
      return;
    }
    if (lookedUpDni === numero) return;
    const timer = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      setLookupStatus("loading");
      setLookupMessage("Consultando RENIEC…");
      startLookup(async () => {
        const res = await lookupDniAction(numero);
        if (reqId !== reqIdRef.current) return;
        setLookedUpDni(numero);
        if (!res.ok) {
          // En edición no borramos lo existente si la consulta falla.
          setLookupMessage(res.error);
          setLookupStatus("error");
          return;
        }
        const d = res.data!;
        setAP(d.apellidoPaterno);
        setAM(d.apellidoMaterno);
        setNombres(d.nombres);
        if (d.fechaNacimiento) setFN(d.fechaNacimiento);
        if (d.sexo) setSexo(d.sexo as Sexo);
        if (d.estadoCivil) setEC(d.estadoCivil);
        if (d.direccion) setDir(d.direccion);
        setLookupMessage(`${d.nombres} ${d.apellidoPaterno} ${d.apellidoMaterno}`);
        setLookupStatus("success");
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [tipo, numero, lookedUpDni]);

  // El reset al cambiar de socio / tras guardar se hace remontando el form
  // vía `key={socio.updatedAt}` en el padre (evita setState-en-effect).

  const isDirty =
    tipo !== initial.tipoDocumento ||
    numero !== initial.numeroDocumento ||
    numeroPadron !== initial.numeroPadron ||
    ap !== initial.apellidoPaterno ||
    am !== initial.apellidoMaterno ||
    nombres !== initial.nombres ||
    fechaNacimiento !== initial.fechaNacimiento ||
    sexo !== initial.sexo ||
    estadoCivil !== initial.estadoCivil ||
    telefono !== initial.telefono ||
    email !== initial.email ||
    direccion !== initial.direccion ||
    distrito !== initial.distrito ||
    provincia !== initial.provincia ||
    departamento !== initial.departamento ||
    fechaIngreso !== initial.fechaIngreso ||
    observaciones !== initial.observaciones;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty || pending) return;
    setFieldErrors({});

    const patch: UpdateSocioPatch = {
      tipoDocumento: tipo,
      numeroDocumento: numero,
      numeroPadron: numeroPadron.trim() === "" ? null : Number(numeroPadron),
      apellidoPaterno: ap,
      apellidoMaterno: am || undefined,
      nombres,
      fechaNacimiento: fechaNacimiento || undefined,
      sexo: (sexo as Sexo) || undefined,
      estadoCivil: estadoCivil || undefined,
      telefono: telefono || undefined,
      email: email || undefined,
      direccion: direccion || undefined,
      distrito: distrito || undefined,
      provincia: provincia || undefined,
      departamento: departamento || undefined,
      fechaIngreso: fechaIngreso || undefined,
      observaciones: observaciones || undefined,
    };

    setPending(true);
    const res = await updateSocio(socio.id, patch);
    setPending(false);
    if (!res.ok) {
      setFieldErrors((res.fieldErrors as Record<string, string>) ?? {});
      toast.error(res.error);
      return;
    }
    toast.success("Datos del socio actualizados.");
    onReload();
  }

  const fe = fieldErrors;
  const disabled = !canWrite || pending;
  const today = hoyISOPeru(); // hoy en Perú (no UTC) para el max de fechas

  return (
    <form onSubmit={submit} className="soc-formgrid">
      <h4>Identificación</h4>
      <DocumentoInput
        tipo={tipo}
        numero={numero}
        onChange={(t, n) => {
          setTipo(t);
          setNumero(n);
        }}
        fieldErrors={{
          tipoDocumento: fe.tipoDocumento,
          numeroDocumento: fe.numeroDocumento,
        }}
        disabled={disabled}
      />

      {tipo === "DNI" && lookupStatus !== "idle" && (
        <div
          className={`dni-status dni-status--${lookupStatus}`}
          role="status"
          aria-live="polite"
        >
          {lookupStatus === "loading" && (
            <span className="dni-status__spinner" aria-hidden />
          )}
          {lookupStatus === "success" && <Icon name="check" size={14} />}
          {lookupStatus === "error" && <Icon name="info" size={14} />}
          <span>
            {lookupStatus === "success"
              ? `RENIEC · ${lookupMessage}`
              : lookupMessage}
          </span>
        </div>
      )}

      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">
            Apellido paterno<span className="field__req">*</span>
          </span>
          <input
            value={ap}
            onChange={(e) => setAP(e.target.value)}
            disabled={disabled}
          />
          {fe.apellidoPaterno && (
            <span className="field-error">{fe.apellidoPaterno}</span>
          )}
        </label>
        <label className="field">
          <span className="field__label">Apellido materno</span>
          <input
            value={am}
            onChange={(e) => setAM(e.target.value)}
            disabled={disabled}
          />
        </label>
      </div>

      <label className="field">
        <span className="field__label">
          Nombres<span className="field__req">*</span>
        </span>
        <input
          value={nombres}
          onChange={(e) => setNombres(e.target.value)}
          disabled={disabled}
        />
        {fe.nombres && <span className="field-error">{fe.nombres}</span>}
      </label>

      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">Fecha de nacimiento</span>
          <input
            type="date"
            value={fechaNacimiento}
            onChange={(e) => setFN(e.target.value)}
            max={today}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span className="field__label">Sexo</span>
          <select
            value={sexo}
            onChange={(e) => setSexo(e.target.value as Sexo | "")}
            disabled={disabled}
          >
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field__label">Estado civil</span>
        <input
          value={estadoCivil}
          onChange={(e) => setEC(e.target.value)}
          placeholder="soltero / casado / conviviente…"
          disabled={disabled}
        />
      </label>

      <h4>Contacto</h4>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">Teléfono</span>
          <input
            value={telefono}
            onChange={(e) => setTel(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span className="field__label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
          />
          {fe.email && <span className="field-error">{fe.email}</span>}
        </label>
      </div>

      <label className="field">
        <span className="field__label">Dirección</span>
        <input
          value={direccion}
          onChange={(e) => setDir(e.target.value)}
          disabled={disabled}
        />
      </label>

      <div
        className="soc-formgrid"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}
      >
        <label className="field">
          <span className="field__label">Distrito</span>
          <input
            value={distrito}
            onChange={(e) => setDis(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span className="field__label">Provincia</span>
          <input
            value={provincia}
            onChange={(e) => setProv(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span className="field__label">Departamento</span>
          <input
            value={departamento}
            onChange={(e) => setDept(e.target.value)}
            disabled={disabled}
          />
        </label>
      </div>

      <h4>Asociación</h4>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">
            Fecha de ingreso<span className="field__req">*</span>
          </span>
          <input
            type="date"
            value={fechaIngreso}
            onChange={(e) => setFI(e.target.value)}
            max={today}
            disabled={disabled}
          />
          {fe.fechaIngreso && (
            <span className="field-error">{fe.fechaIngreso}</span>
          )}
        </label>
        <label className="field">
          <span className="field__label">Nº de padrón</span>
          <input
            type="number"
            min="1"
            step="1"
            value={numeroPadron}
            onChange={(e) => setNumeroPadron(e.target.value)}
            placeholder="sin registrar"
            aria-invalid={!!fe.numeroPadron}
            disabled={disabled}
          />
          {fe.numeroPadron && (
            <span className="field-error">{fe.numeroPadron}</span>
          )}
        </label>
      </div>

      <label className="field">
        <span className="field__label">Observaciones</span>
        <textarea
          rows={3}
          value={observaciones}
          onChange={(e) => setObs(e.target.value)}
          disabled={disabled}
        />
      </label>

      <div
        style={{
          padding: "12px 14px",
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
            Estado del socio
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Para cambiar el estado se requiere registrar un motivo. Cada
            cambio queda en el historial.
          </div>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onOpenChangeEstado}
          disabled={!canChangeState || pending}
        >
          Cambiar estado
        </button>
      </div>

      {canWrite && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={disabled || !isDirty}
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      )}
    </form>
  );
}
