import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/server";
import { LoginForm } from "./LoginForm";
import "./login.css";

export const metadata = {
  title: "Iniciar sesión · Mercado Milagros",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/usuarios");

  return (
    <main className="login">
      {/* Fondo: ilustración del mercado (puestos con toldos y luces) */}
      <svg
        className="login__scene"
        viewBox="0 0 1440 440"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <defs>
          <g
            id="lm-stall"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          >
            <path d="M-104 150 H104 V168 q-17.3 16 -34.6 0 q-17.3 16 -34.6 0 q-17.3 16 -34.6 0 q-17.3 16 -34.6 0 q-17.3 16 -34.6 0 q-17.3 16 -34.6 0 Z" />
            <path d="M-104 150 L0 120 L104 150" />
            <path d="M-92 168 V360 M92 168 V360" />
            <path d="M-100 300 H100 M-100 300 V356 H100 V300" />
            <circle cx="-62" cy="289" r="10" />
            <circle cx="-40" cy="289" r="10" />
            <circle cx="-18" cy="289" r="10" />
            <path d="M28 299 h46 l-7 -23 h-32 Z" />
          </g>
        </defs>

        {/* Fila de fondo */}
        <g className="login__row login__row--back">
          <use href="#lm-stall" transform="translate(300 30) scale(0.82)" />
          <use href="#lm-stall" transform="translate(620 22) scale(0.82)" />
          <use href="#lm-stall" transform="translate(940 30) scale(0.82)" />
          <use href="#lm-stall" transform="translate(1240 24) scale(0.82)" />
        </g>

        {/* Fila frontal */}
        <g className="login__row login__row--front">
          <use href="#lm-stall" transform="translate(150 60)" />
          <use href="#lm-stall" transform="translate(470 60)" />
          <use href="#lm-stall" transform="translate(790 60)" />
          <use href="#lm-stall" transform="translate(1110 60)" />
          <use href="#lm-stall" transform="translate(1410 60)" />
        </g>

        {/* Luces colgantes */}
        <g className="login__lights">
          <path
            d="M0 92 Q360 158 720 102 T1440 112"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.5"
          />
          <g className="login__bulbs">
            <g transform="translate(120 116)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(240 136)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(360 150)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(480 138)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(600 116)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(720 104)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(840 110)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(960 118)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(1080 122)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(1200 120)"><line y2="9" /><circle cy="14" r="4.5" /></g>
            <g transform="translate(1320 114)"><line y2="9" /><circle cy="14" r="4.5" /></g>
          </g>
        </g>
      </svg>

      <div className="login__card">
        <div className="login__brand">
          <div className="login__mark">M</div>
          <div>
            <div className="login__brand-name">Mercado Milagros</div>
            <div className="login__brand-sub">Consola de administración</div>
          </div>
        </div>

        <div className="login__head">
          <h1>Bienvenido</h1>
          <p>Inicia sesión con tu correo y contraseña para continuar.</p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <div className="login__foot">
          ¿Problemas para acceder? Contacta al administrador del sistema.
        </div>
      </div>
    </main>
  );
}
