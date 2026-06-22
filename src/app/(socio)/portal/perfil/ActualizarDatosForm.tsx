"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/toast";
import {
  lookupDniPortal,
  crearSolicitudActualizacion,
  cancelarMiSolicitud,
  type PerfilSelfInput,
} from "@/app/(socio)/portal/actions";
import type { MisDatosActuales } from "@/lib/portal/data";

type Props = { datos: MisDatosActuales; tienePendiente: boolean };

type Form = {
  tipoDocumento: string;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  fechaNacimiento: string;
  sexo: string;
  estadoCivil: string;
  telefono: string;
  email: string;
  direccion: string;
  distrito: string;
  provincia: string;
  departamento: string;
};

function toForm(d: MisDatosActuales): Form {
  return {
    tipoDocumento: d.tipoDocumento,
    numeroDocumento: d.documentoPendiente ? "" : d.numeroDocumento,
    apellidoPaterno: d.apellidoPaterno,
    apellidoMaterno: d.apellidoMaterno ?? "",
    nombres: d.nombres,
    fechaNacimiento: d.fechaNacimiento ?? "",
    sexo: d.sexo ?? "",
    estadoCivil: d.estadoCivil ?? "",
    telefono: d.telefono ?? "",
    email: d.email ?? "",
    direccion: d.direccion ?? "",
    distrito: d.distrito ?? "",
    provincia: d.provincia ?? "",
    departamento: d.departamento ?? "",
  };
}

export function ActualizarDatosForm({ datos, tienePendiente }: Props) {
  const { documentoPendiente } = datos;
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => toForm(datos));
  const [fe, setFe] = useState<Record<string, string>>({});
  const [dniState, setDniState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [saving, startSaving] = useTransition();
  const [, startLookup] = useTransition();

  // Snapshot de lo autollenado: solo se sobrescribe un campo si el socio no lo
  // editó (sigue igual al último autollenado) o está vacío. Preserva ediciones.
  const autoRef = useRef<Partial<Form>>({});
  const lookedUpRef = useRef<string>("");
  const reqIdRef = useRef(0);

  function set<K extends keyof Form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Lookup con debounce 450ms cuando hay DNI de 8 dígitos distinto al anterior.
  useEffect(() => {
    if (form.tipoDocumento !== "DNI") return;
    const dni = form.numeroDocumento.trim();

    // Bug 2 fix: cuando el DNI tipado difiere del último consultado, limpia de
    // inmediato los campos AUTO-LLENADOS (preserva ediciones manuales) para que
    // no quede visible la info del DNI anterior mientras el socio teclea el nuevo.
    // IMPORTANTE: capturamos prevSnap ANTES de resetear el ref; el updater de
    // setForm corre DIFERIDO y si comparara contra autoRef.current ya estaría vacío.
    if (dni !== lookedUpRef.current) {
      const prevSnap = { ...autoRef.current };
      if (Object.keys(prevSnap).length > 0) {
        autoRef.current = {};
        setForm((f) => {
          const cleared = { ...f };
          (Object.keys(prevSnap) as (keyof Form)[]).forEach((k) => {
            if (cleared[k] === prevSnap[k]) {
              cleared[k] = "" as string;
            }
          });
          return cleared;
        });
      }
      lookedUpRef.current = "";
    }

    if (!/^\d{8}$/.test(dni)) {
      setDniState("idle");
      return;
    }
    if (dni === lookedUpRef.current) return;
    const id = ++reqIdRef.current;
    setDniState("loading");
    const t = setTimeout(() => {
      startLookup(async () => {
        const res = await lookupDniPortal(dni);
        if (id !== reqIdRef.current) return; // respuesta obsoleta
        if (!res.ok) {
          setDniState("error");
          return;
        }
        lookedUpRef.current = dni;
        setDniState("ok");
        const d = res.data!;
        const next: Partial<Form> = {
          apellidoPaterno: d.apellidoPaterno,
          apellidoMaterno: d.apellidoMaterno,
          nombres: d.nombres,
          fechaNacimiento: d.fechaNacimiento ?? "",
          sexo: d.sexo ?? "",
          estadoCivil: d.estadoCivil ?? "",
          direccion: d.direccion ?? "",
        };
        // Bug 1 fix: capturamos prevSnap ANTES de llamar setForm. El updater
        // funcional corre DIFERIDO; si leyera autoRef.current directamente ya
        // tendría los nuevos valores y la comparación `cur === prevAuto`
        // siempre fallaría → el segundo DNI nunca actualizaría el formulario.
        const prevSnap = { ...autoRef.current };
        setForm((f) => {
          const merged = { ...f };
          (Object.keys(next) as (keyof Form)[]).forEach((k) => {
            const prevAuto = prevSnap[k];
            const cur = f[k];
            if (cur === "" || cur === prevAuto) {
              merged[k] = next[k] as string;
            }
          });
          return merged;
        });
        autoRef.current = { ...autoRef.current, ...next };
      });
    }, 450);
    return () => clearTimeout(t);
  }, [form.tipoDocumento, form.numeroDocumento]);

  function buildInput(): PerfilSelfInput {
    return {
      tipoDocumento: form.tipoDocumento as PerfilSelfInput["tipoDocumento"],
      numeroDocumento: form.numeroDocumento,
      apellidoPaterno: form.apellidoPaterno,
      apellidoMaterno: form.apellidoMaterno || undefined,
      nombres: form.nombres,
      fechaNacimiento: form.fechaNacimiento || undefined,
      sexo: (form.sexo || undefined) as PerfilSelfInput["sexo"],
      estadoCivil: form.estadoCivil || undefined,
      telefono: form.telefono || undefined,
      email: form.email || undefined,
      direccion: form.direccion || undefined,
      distrito: form.distrito || undefined,
      provincia: form.provincia || undefined,
      departamento: form.departamento || undefined,
    };
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || tienePendiente) return;
    setFe({});
    startSaving(async () => {
      const res = await crearSolicitudActualizacion(buildInput());
      if (!res.ok) {
        toast.error(res.error);
        if (res.fieldErrors) setFe(res.fieldErrors as Record<string, string>);
        return;
      }
      toast.success("Solicitud enviada. Quedó en revisión.");
      router.refresh();
    });
  }

  function cancelar() {
    startSaving(async () => {
      const res = await cancelarMiSolicitud();
      if (!res.ok) return toast.error(res.error);
      toast.success("Solicitud cancelada.");
      router.refresh();
    });
  }

  if (tienePendiente) {
    return (
      <div className="pt-panel">
        <p>Tu solicitud está en revisión. No puedes enviar otra hasta que se resuelva.</p>
        <button className="pt-btn" onClick={cancelar} disabled={saving}>
          {saving ? "Cancelando…" : "Cancelar solicitud"}
        </button>
      </div>
    );
  }

  const txt = (k: keyof Form, label: string, extra?: { type?: string; inputMode?: "numeric" | "text" | "email"; maxLength?: number }) => (
    <div className="pt-field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <input
        id={`f-${k}`}
        type={extra?.type ?? "text"}
        inputMode={extra?.inputMode}
        maxLength={extra?.maxLength}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={!!fe[k]}
        disabled={saving}
      />
      {fe[k] && <span className="pt-field__err">{fe[k]}</span>}
    </div>
  );

  return (
    <form onSubmit={submit}>
      <div className="pt-field">
        <label htmlFor="f-tipo">Tipo de documento</label>
        <select
          id="f-tipo"
          value={form.tipoDocumento}
          onChange={(e) => set("tipoDocumento", e.target.value)}
          disabled={saving}
        >
          <option value="DNI">DNI</option>
          <option value="CE">CE</option>
          <option value="PASAPORTE">Pasaporte</option>
          <option value="RUC">RUC</option>
        </select>
      </div>

      <div className="pt-field">
        <label htmlFor="f-doc">Número de documento</label>
        <input
          id="f-doc"
          inputMode={form.tipoDocumento === "DNI" ? "numeric" : "text"}
          maxLength={form.tipoDocumento === "DNI" ? 8 : 20}
          value={form.numeroDocumento}
          onChange={(e) => set("numeroDocumento", e.target.value)}
          aria-invalid={!!fe.numeroDocumento}
          disabled={saving}
          placeholder={form.tipoDocumento === "DNI" ? "8 dígitos" : ""}
        />
        {form.tipoDocumento === "DNI" && dniState === "loading" && (
          <span className="pt-field__err" style={{ color: "var(--muted, #888)" }}>
            Consultando RENIEC…
          </span>
        )}
        {form.tipoDocumento === "DNI" && dniState === "ok" && (
          <span className="pt-field__err" style={{ color: "green" }}>
            Datos encontrados. Revísalos y corrige lo que falte.
          </span>
        )}
        {form.tipoDocumento === "DNI" && dniState === "error" && (
          <span className="pt-field__err">
            No se pudo autollenar. Puedes escribir tus datos a mano.
          </span>
        )}
        {fe.numeroDocumento && <span className="pt-field__err">{fe.numeroDocumento}</span>}
        {/* Bug 3 fix: SIN-DNI UX — orienta al socio a ingresar su DNI real */}
        {documentoPendiente && (
          <small style={{ color: "var(--muted, #888)", display: "block", marginTop: "0.25rem" }}>
            Tu documento aún no está registrado. Ingresa tu DNI real para regularizarlo.
          </small>
        )}
      </div>

      {txt("apellidoPaterno", "Apellido paterno")}
      {txt("apellidoMaterno", "Apellido materno")}
      {txt("nombres", "Nombres")}
      {txt("fechaNacimiento", "Fecha de nacimiento", { type: "date" })}

      <div className="pt-field">
        <label htmlFor="f-sexo">Sexo</label>
        <select id="f-sexo" value={form.sexo} onChange={(e) => set("sexo", e.target.value)} disabled={saving}>
          <option value="">—</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
        </select>
      </div>

      {txt("estadoCivil", "Estado civil")}
      {txt("telefono", "Teléfono", { inputMode: "numeric", maxLength: 20 })}
      {txt("email", "Correo", { type: "email", inputMode: "email" })}
      {txt("direccion", "Dirección")}
      {txt("distrito", "Distrito")}
      {txt("provincia", "Provincia")}
      {txt("departamento", "Departamento")}

      <button type="submit" className="pt-btn" disabled={saving}>
        {saving ? "Enviando…" : "Enviar para revisión"}
      </button>
    </form>
  );
}
