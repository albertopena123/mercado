import "./formulario.css";
import { FormularioHeader } from "./FormularioHeader";
import { FormularioPublico } from "./FormularioPublico";

export const metadata = { title: "Actualiza tus datos · Feria Mayorista Internacional Milagros" };
export const dynamic = "force-dynamic";

export default function FormularioPage() {
  return (
    <>
      <FormularioHeader />
      <main className="fp-wrap">
        <div className="fp-card">
        <h1 className="fp-title">Actualiza tus datos</h1>
        <p className="fp-sub">
          Socios de la Feria Mayorista Internacional Milagros: ingresa tu DNI,
          celular y correo. La administración revisará y actualizará tu registro.
        </p>
        <FormularioPublico />
      </div>
      </main>
    </>
  );
}
