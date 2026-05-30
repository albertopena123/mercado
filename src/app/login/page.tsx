import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/server";
import { LoginForm } from "./LoginForm";
import "./login.css";

export const metadata = {
  title: "Iniciar sesión · UNAMAD Admin",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/usuarios");

  return (
    <main className="login">
      <div className="login__card">
        <div className="login__brand">
          <div className="login__brand-mark">U</div>
          <div>
            <div className="login__brand-name">UNAMAD</div>
            <div className="login__brand-sub">Consola de administración</div>
          </div>
        </div>

        <div className="login__head">
          <h1>Bienvenido</h1>
          <p>Inicia sesión con tu cuenta institucional para continuar.</p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <div className="login__foot">
          ¿Problemas para acceder? Contacta a{" "}
          <a href="mailto:oti@unamad.edu.pe">oti@unamad.edu.pe</a>
        </div>
      </div>
    </main>
  );
}
