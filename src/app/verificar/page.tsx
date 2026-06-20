import "./verificar.css";
import { ORG } from "@/lib/org";
import { VerificarForm } from "./VerificarForm";

export const metadata = { title: "Verificar constancia" };

export default function Page() {
  return (
    <main className="verif">
      <div className="verif__card">
        <div className="verif__org">
          <p className="verif__org-name">{ORG.nombreLegal}</p>
          <p className="verif__org-sub">
            Verificación de autenticidad de constancia
          </p>
        </div>
        <p className="verif__intro">
          Ingrese el <b>código de verificación</b> impreso en la constancia (o
          escanee el código QR del documento) para comprobar su autenticidad.
        </p>
        <VerificarForm />
      </div>
      <p className="verif__foot">
        El código figura al pie de la constancia, junto al código QR.
      </p>
    </main>
  );
}
