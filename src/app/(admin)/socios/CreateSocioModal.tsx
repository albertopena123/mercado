"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { hoyISOPeru } from "@/lib/fecha";
import { DocumentoInput } from "./DocumentoInput";
import { createSocio, lookupDniAction } from "./actions";
import { validateNumeroDocumento } from "@/lib/socios/document";
import type { TipoDocumento, Sexo } from "@/generated/prisma/client";
import type { CreateSocioInput } from "./types";

type LookupStatus = "idle" | "loading" | "success" | "error";

function initialsFor(first: string, last: string): string {
  const a = first.trim().charAt(0).toUpperCase();
  const b = last.trim().charAt(0).toUpperCase();
  return (a + b) || "";
}

export function CreateSocioModal({
  onClose,
  onCreated,
  canCreateUser,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  canCreateUser: boolean;
}) {
  const toast = useToast();
  const today = hoyISOPeru(); // hoy en Perú (no UTC) para el max de fechas
  const [tipo, setTipo] = useState<TipoDocumento>("DNI");
  const [numero, setNumero] = useState("");
  const [apellidoPaterno, setAP] = useState("");
  const [apellidoMaterno, setAM] = useState("");
  const [nombres, setNombres] = useState("");
  const [fechaNacimiento, setFN] = useState("");
  const [sexo, setSexo] = useState<Sexo | "">("");
  const [estadoCivil, setEC] = useState("");
  const [telefono, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDir] = useState("");
  const [distrito, setDis] = useState("");
  const [provincia, setProv] = useState("");
  const [departamento, setDept] = useState("");
  const [fechaIngreso, setFI] = useState(today);
  const [numeroPadron, setNumeroPadron] = useState("");
  const [observaciones, setObs] = useState("");
  // Acceso al portal (opcional)
  const [darAcceso, setDarAcceso] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  // Cuota de inscripción (opcional) → ingreso a caja
  const [montoInscripcion, setMontoInscripcion] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);

  // DNI auto-lookup (RENIEC via UNAMAD)
  const [, startLookup] = useTransition();
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookedUpDni, setLookedUpDni] = useState<string | null>(null);
  // Evita que una respuesta lenta y obsoleta pise a una consulta más reciente.
  const reqIdRef = useRef(0);
  // Snapshot de lo último que autocompletó RENIEC. Sirve para distinguir un
  // campo auto-rellenado (que SÍ se reemplaza al cambiar de DNI) de uno que el
  // usuario editó a mano (que se conserva).
  const autoRef = useRef({
    ap: "",
    am: "",
    nombres: "",
    fn: "",
    sexo: "",
    ec: "",
    dir: "",
  });

  useEscClose(true, onClose, submitting || lookupStatus === "loading");

  // Cambio de documento: actualiza valores y resetea el status de la consulta
  // si deja de ser un DNI válido (en el handler, no en un efecto).
  function onDocChange(t: TipoDocumento, n: string) {
    setTipo(t);
    setNumero(n);
    if (t !== "DNI" || !/^\d{8}$/.test(n)) {
      setLookupStatus("idle");
      setLookupMessage(null);
    }
  }

  // Auto-lookup con debounce cuando hay 8 dígitos
  useEffect(() => {
    if (tipo !== "DNI" || !/^\d{8}$/.test(numero)) return;
    if (lookedUpDni === numero) return; // ya consultado

    const timer = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      setLookupStatus("loading");
      setLookupMessage("Consultando RENIEC…");
      startLookup(async () => {
        const res = await lookupDniAction(numero);
        // Una consulta más reciente ya tomó el control: descartamos esta.
        if (reqId !== reqIdRef.current) return;
        setLookedUpDni(numero);

        if (!res.ok) {
          setLookupMessage(res.error);
          setLookupStatus("error");
          // Limpia los datos que RENIEC autocompletó para un DNI anterior (sin
          // tocar lo que el usuario escribió a mano) para no quedarte con la
          // identidad equivocada en este nuevo DNI.
          const snap = autoRef.current;
          setAP((p) => (p === snap.ap ? "" : p));
          setAM((p) => (p === snap.am ? "" : p));
          setNombres((p) => (p === snap.nombres ? "" : p));
          setFN((p) => (p === snap.fn ? "" : p));
          setSexo((p) => (p === snap.sexo ? "" : p));
          setEC((p) => (p === snap.ec ? "" : p));
          setDir((p) => (p === snap.dir ? "" : p));
          autoRef.current = { ap: "", am: "", nombres: "", fn: "", sexo: "", ec: "", dir: "" };
          return;
        }

        const d = res.data!;
        const sexoVal = (d.sexo ?? "") as Sexo | "";
        const fnVal = d.fechaNacimiento ?? "";
        const ecVal = d.estadoCivil ?? "";
        const dirVal = d.direccion ?? "";
        // Reemplaza cada campo de identidad con los datos del DNI consultado,
        // SALVO que el usuario lo haya editado a mano (lo detectamos comparando
        // el valor actual con el último auto-relleno).
        const snap = autoRef.current;
        setAP((p) => (!p.trim() || p === snap.ap ? d.apellidoPaterno : p));
        setAM((p) => (!p.trim() || p === snap.am ? d.apellidoMaterno : p));
        setNombres((p) => (!p.trim() || p === snap.nombres ? d.nombres : p));
        setFN((p) => (!p || p === snap.fn ? fnVal : p));
        setSexo((p) => (!p || p === snap.sexo ? sexoVal : p));
        setEC((p) => (!p.trim() || p === snap.ec ? ecVal : p));
        setDir((p) => (!p.trim() || p === snap.dir ? dirVal : p));
        autoRef.current = {
          ap: d.apellidoPaterno,
          am: d.apellidoMaterno,
          nombres: d.nombres,
          fn: fnVal,
          sexo: sexoVal,
          ec: ecVal,
          dir: dirVal,
        };
        setLookupMessage(`${d.nombres} ${d.apellidoPaterno} ${d.apellidoMaterno}`);
        setLookupStatus("success");
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [tipo, numero, lookedUpDni]);

  const valid =
    apellidoPaterno.trim().length >= 2 &&
    nombres.trim().length >= 2 &&
    numero.trim().length > 0 &&
    validateNumeroDocumento(tipo, numero) &&
    !!fechaIngreso &&
    (!darAcceso || portalPassword.length >= 6);

  const initials = useMemo(
    () => initialsFor(nombres, apellidoPaterno),
    [nombres, apellidoPaterno],
  );

  const subject = useMemo(() => {
    const apellidos = [apellidoPaterno, apellidoMaterno]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    const nom = nombres.trim();
    if (!apellidos && !nom) return null;
    return `${apellidos}${apellidos && nom ? ", " : ""}${nom}`;
  }, [apellidoPaterno, apellidoMaterno, nombres]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setFieldErrors({});
    const input: CreateSocioInput = {
      tipoDocumento: tipo,
      numeroDocumento: numero,
      apellidoPaterno: apellidoPaterno.trim(),
      apellidoMaterno: apellidoMaterno.trim() || undefined,
      nombres: nombres.trim(),
      fechaNacimiento: fechaNacimiento || undefined,
      sexo: (sexo as Sexo) || undefined,
      estadoCivil: estadoCivil.trim() || undefined,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      direccion: direccion.trim() || undefined,
      distrito: distrito.trim() || undefined,
      provincia: provincia.trim() || undefined,
      departamento: departamento.trim() || undefined,
      fechaIngreso,
      numeroPadron: numeroPadron.trim() ? Number(numeroPadron) : undefined,
      observaciones: observaciones.trim() || undefined,
      portalPassword:
        canCreateUser && darAcceso && portalPassword ? portalPassword : undefined,
      montoInscripcion:
        montoInscripcion.trim() && Number(montoInscripcion) > 0
          ? Number(montoInscripcion)
          : undefined,
    };
    const res = await createSocio(input);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo crear el socio.");
      setFieldErrors((res.fieldErrors as Record<string, string>) ?? {});
      setSubmitting(false);
      return;
    }
    onCreated(res.data!.id);
  }

  const fe = fieldErrors;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head modal__head--rich">
          <div className="modal__head-main">
            <div className="modal__avatar">
              {initials || <Icon name="user" size={24} />}
            </div>
            <div className="modal__head-text">
              <h2>Nuevo socio</h2>
              <div className="modal__subject">
                {subject ?? "Completa los datos para registrar al socio"}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="iconbtn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          <h4 className="modal__section">Identificación</h4>
          <DocumentoInput
            tipo={tipo}
            numero={numero}
            onChange={onDocChange}
            fieldErrors={{
              tipoDocumento: fe.tipoDocumento,
              numeroDocumento: fe.numeroDocumento,
            }}
            disabled={submitting}
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
              {lookupStatus === "success" && (
                <Icon name="check" size={14} />
              )}
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
                type="text"
                value={apellidoPaterno}
                onChange={(e) => setAP(e.target.value)}
                placeholder="p. ej. Peña"
                aria-invalid={!!fe.apellidoPaterno}
                disabled={submitting}
                autoFocus
              />
              {fe.apellidoPaterno && (
                <span className="field-error">{fe.apellidoPaterno}</span>
              )}
            </label>
            <label className="field">
              <span className="field__label">Apellido materno</span>
              <input
                type="text"
                value={apellidoMaterno}
                onChange={(e) => setAM(e.target.value)}
                placeholder="p. ej. Mondragón"
                disabled={submitting}
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label">
              Nombres<span className="field__req">*</span>
            </span>
            <input
              type="text"
              value={nombres}
              onChange={(e) => setNombres(e.target.value)}
              placeholder="p. ej. María del Carmen"
              aria-invalid={!!fe.nombres}
              disabled={submitting}
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
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Sexo</span>
              <div className="sexo-pills" role="radiogroup" aria-label="Sexo">
                <button
                  type="button"
                  role="radio"
                  aria-checked={sexo === ""}
                  className={`sexo-pills__opt ${sexo === "" ? "is-on" : ""}`}
                  onClick={() => setSexo("")}
                  disabled={submitting}
                >
                  —
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={sexo === "M"}
                  className={`sexo-pills__opt ${sexo === "M" ? "is-on" : ""}`}
                  onClick={() => setSexo("M")}
                  disabled={submitting}
                >
                  Masculino
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={sexo === "F"}
                  className={`sexo-pills__opt ${sexo === "F" ? "is-on" : ""}`}
                  onClick={() => setSexo("F")}
                  disabled={submitting}
                >
                  Femenino
                </button>
              </div>
            </label>
          </div>

          <label className="field">
            <span className="field__label">Estado civil</span>
            <input
              type="text"
              value={estadoCivil}
              onChange={(e) => setEC(e.target.value)}
              placeholder="soltero / casado / conviviente…"
              disabled={submitting}
            />
          </label>

          <h4 className="modal__section">Contacto</h4>
          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Teléfono</span>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTel(e.target.value)}
                placeholder="9XXXXXXXX"
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="opcional"
                aria-invalid={!!fe.email}
                disabled={submitting}
              />
              {fe.email && <span className="field-error">{fe.email}</span>}
            </label>
          </div>

          <label className="field">
            <span className="field__label">Dirección</span>
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDir(e.target.value)}
              placeholder="Av./Jr./Calle Nº"
              disabled={submitting}
            />
          </label>

          <div
            className="soc-formgrid"
            style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}
          >
            <label className="field">
              <span className="field__label">Distrito</span>
              <input
                type="text"
                value={distrito}
                onChange={(e) => setDis(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Provincia</span>
              <input
                type="text"
                value={provincia}
                onChange={(e) => setProv(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Departamento</span>
              <input
                type="text"
                value={departamento}
                onChange={(e) => setDept(e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>

          <h4 className="modal__section">Asociación</h4>
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
                required
                aria-invalid={!!fe.fechaIngreso}
                disabled={submitting}
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
                placeholder="opcional"
                aria-invalid={!!fe.numeroPadron}
                disabled={submitting}
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
              placeholder="cualquier nota adicional sobre el socio"
              disabled={submitting}
            />
          </label>

          <label className="field">
            <span className="field__label">Cuota de inscripción (S/)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={montoInscripcion}
              onChange={(e) => setMontoInscripcion(e.target.value)}
              placeholder="opcional — se registra como ingreso en caja"
              disabled={submitting}
            />
          </label>

          {canCreateUser && (
            <>
              <h4 className="modal__section">Acceso al portal</h4>
              <label
                className="field"
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={darAcceso}
                  onChange={(e) => setDarAcceso(e.target.checked)}
                  disabled={submitting}
                  style={{ width: 16, height: 16 }}
                />
                <span className="field__label" style={{ margin: 0 }}>
                  Crear acceso al portal del socio
                </span>
              </label>
              {darAcceso && (
                <label className="field">
                  <span className="field__label">
                    Contraseña inicial<span className="field__req">*</span>
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder="mínimo 6 caracteres"
                    autoComplete="new-password"
                    aria-invalid={!!fe.portalPassword}
                    disabled={submitting}
                  />
                  {fe.portalPassword && (
                    <span className="field-error">{fe.portalPassword}</span>
                  )}
                  <label
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      fontSize: 12,
                      marginTop: 6,
                      color: "var(--text-muted)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                    />
                    Mostrar contraseña
                  </label>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    Ingresará con su documento{email.trim() ? " o correo" : ""} y
                    esta contraseña.
                  </span>
                </label>
              )}
            </>
          )}
        </div>

        <footer className="modal__foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!valid || submitting}
          >
            {submitting ? "Creando…" : "Crear socio"}
          </button>
        </footer>
      </form>
    </div>
  );
}
