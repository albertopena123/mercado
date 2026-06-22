"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { lookupDniPublico, enviarRegistroPublico } from "./actions";

export function FormularioPublico() {
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [correo, setCorreo] = useState("");
  const [fe, setFe] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [dniState, setDniState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [enviado, setEnviado] = useState(false);
  const [sending, startSend] = useTransition();
  const [, startLookup] = useTransition();
  const reqIdRef = useRef(0);
  const lookedRef = useRef("");
  const autoNombreRef = useRef("");

  /* eslint-disable react-hooks/set-state-in-effect */
  // Debounced DNI lookup: calls setState inside effect intentionally; stale-guard via reqIdRef.
  useEffect(() => {
    const d = dni.trim();
    // Al cambiar el DNI respecto al último consultado, limpia de INMEDIATO el
    // nombre AUTOLLENADO (conserva lo que el socio escribió a mano) para que no
    // quede a la vista la info del DNI anterior mientras teclea el nuevo. Reinicia
    // lookedRef para que incluso volver al DNI previo se vuelva a consultar.
    if (d !== lookedRef.current) {
      if (autoNombreRef.current) {
        setNombre((cur) => (cur === autoNombreRef.current ? "" : cur));
        autoNombreRef.current = "";
      }
      lookedRef.current = "";
    }
    if (!/^\d{8}$/.test(d)) { setDniState("idle"); return; }
    if (d === lookedRef.current) return;
    const id = ++reqIdRef.current;
    setDniState("loading");
    const t = setTimeout(() => {
      startLookup(async () => {
        const res = await lookupDniPublico(d);
        if (id !== reqIdRef.current) return;
        if (!res.ok) { setDniState("error"); return; }
        lookedRef.current = d;
        setDniState("ok");
        // Solo autollenar si el usuario no escribió su propio nombre.
        setNombre((cur) => (cur === "" || cur === autoNombreRef.current ? res.nombre : cur));
        autoNombreRef.current = res.nombre;
      });
    }, 450);
    return () => clearTimeout(t);
  }, [dni]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFe({}); setMsg(null);
    startSend(async () => {
      const res = await enviarRegistroPublico({
        numeroDocumento: dni,
        nombreCompleto: nombre,
        telefono: celular,
        email: correo || undefined,
      });
      if (!res.ok) {
        setMsg(res.error);
        if (res.fieldErrors) setFe(res.fieldErrors);
        return;
      }
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="fp-done">
        <div className="fp-check">✓</div>
        <h2>¡Gracias!</h2>
        <p>Tus datos fueron enviados. La administración los revisará y actualizará tu registro.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="fp-form">
      <label className="fp-field">
        <span>DNI</span>
        <input inputMode="numeric" maxLength={8} value={dni}
          onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
          aria-invalid={!!fe.numeroDocumento} placeholder="8 dígitos" disabled={sending} />
        {dniState === "loading" && <small className="fp-hint">Consultando…</small>}
        {dniState === "ok" && <small className="fp-hint fp-hint--ok">Datos encontrados. Revisa tu nombre.</small>}
        {dniState === "error" && <small className="fp-hint">No se encontró; escribe tu nombre a mano.</small>}
        {fe.numeroDocumento && <small className="fp-err">{fe.numeroDocumento}</small>}
      </label>

      <label className="fp-field">
        <span>Apellidos y nombres</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)}
          aria-invalid={!!fe.nombreCompleto} disabled={sending} />
        {fe.nombreCompleto && <small className="fp-err">{fe.nombreCompleto}</small>}
      </label>

      <label className="fp-field">
        <span>Celular</span>
        <input inputMode="numeric" value={celular}
          onChange={(e) => setCelular(e.target.value)} aria-invalid={!!fe.telefono}
          placeholder="9XX XXX XXX" disabled={sending} />
        {fe.telefono && <small className="fp-err">{fe.telefono}</small>}
      </label>

      <label className="fp-field">
        <span>Correo <em>(opcional)</em></span>
        <input type="email" inputMode="email" value={correo}
          onChange={(e) => setCorreo(e.target.value)} aria-invalid={!!fe.email} disabled={sending} />
        {fe.email && <small className="fp-err">{fe.email}</small>}
      </label>

      {msg && <p className="fp-msg">{msg}</p>}
      <button type="submit" className="fp-btn" disabled={sending}>
        {sending ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}
