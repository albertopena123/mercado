"use client";

import "../constancia/constancia.css";
import "./renuncia.css";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { hoyLarga } from "@/lib/fecha";
import { ORG } from "@/lib/org";
import { DIMENSION_LABEL } from "@/lib/puestos/giro";
import type { DimensionPuesto } from "@/generated/prisma/client";

type Data = {
  nombreCompleto: string;
  tipoDocumento: string;
  numeroDocumento: string;
  puestos: { codigo: string; dimension: DimensionPuesto }[];
  // true solo si el socio NO tiene deuda pendiente: la carta no debe afirmar
  // estar "al día en pagos" cuando hay cuotas pendientes.
  alDia: boolean;
  // Alcance: true = renuncia a la condición de socio (libera todos); false =
  // cesión de un puesto conservando la membresía y los demás puestos.
  alcanceTotal: boolean;
  conservaOtros: boolean;
};

export function RenunciaView({ data }: { data: Data }) {
  const router = useRouter();
  const hoy = hoyLarga();
  const unPuesto = data.puestos.length === 1;
  const puestosTxt = data.puestos
    .map((p) => `${p.codigo}, de dimensiones ${DIMENSION_LABEL[p.dimension]}`)
    .join("; ");

  return (
    <div className="constancia-page">
      <div className="constancia-toolbar no-print">
        <button
          className="btn btn--ghost"
          onClick={() => router.push("/socios")}
        >
          <Icon
            name="chevron-right"
            size={14}
            style={{ transform: "rotate(180deg)" }}
          />
          <span>Volver al padrón</span>
        </button>
        <button className="btn--cta" onClick={() => window.print()}>
          <Icon name="download" size={16} />
          <span>Imprimir / Guardar PDF</span>
        </button>
      </div>

      <article className="constancia renuncia">
        <div className="constancia__membrete">
          <p className="constancia__lema">“{ORG.lemaAnio}”</p>
          <p className="constancia__lema">“{ORG.lemaRegion}”</p>
        </div>

        <h1 className="constancia__title">
          {data.alcanceTotal ? "Carta de Renuncia" : "Carta de Renuncia a Puesto"}
        </h1>

        <div className="constancia__body renuncia__body">
          <p className="renuncia__fecha">
            {ORG.ciudad}, {hoy}.
          </p>

          <p>
            <b>Señor:</b>
            <br />
            <b>{ORG.presidente.toUpperCase()}</b>
            <br />
            Presidente de la {ORG.nombre}.
          </p>

          <p>
            <b>ASUNTO:</b>{" "}
            {data.alcanceTotal
              ? "Renuncia voluntaria e irrevocable como socio."
              : "Renuncia a la titularidad de puesto para su transferencia."}
          </p>

          <p>De mi consideración:</p>

          {data.alcanceTotal ? (
            <>
              <p>
                Yo, <b>{data.nombreCompleto}</b>, identificado(a) con{" "}
                {data.tipoDocumento} N.° <b>{data.numeroDocumento}</b>,
                peruano(a) de nacimiento, me dirijo a Usted con el debido respeto
                para presentar formalmente mi{" "}
                <b>RENUNCIA VOLUNTARIA E IRREVOCABLE</b> como socio(a) de la{" "}
                {ORG.nombre}.
              </p>

              {data.puestos.length > 0 && (
                <p>
                  La presente renuncia comprende{" "}
                  {unPuesto ? "el puesto" : "los puestos"} <b>{puestosTxt}</b>
                  {data.alDia ? (
                    <>
                      , respecto {unPuesto ? "del cual" : "de los cuales"} me
                      encuentro al día en el cumplimiento de todas mis
                      obligaciones y pagos ante la asociación.
                    </>
                  ) : (
                    <>.</>
                  )}
                </p>
              )}

              <p>
                Por tal motivo, solicito se me brinden las facilidades
                correspondientes para efectuar la transferencia y entrega de{" "}
                {unPuesto ? "dicho puesto" : "dichos puestos"} a los nuevos
                propietarios, conforme a las disposiciones establecidas en el
                Estatuto y Reglamento Interno de la institución.
              </p>

              <p>
                Asimismo, dejo constancia de que, a partir de la fecha de
                aceptación de la presente renuncia y formalización de la
                transferencia, los nuevos propietarios asumirán los derechos y
                obligaciones inherentes a dichos puestos, así como el
                cumplimiento de las normas que rigen la asociación.
              </p>
            </>
          ) : (
            <>
              <p>
                Yo, <b>{data.nombreCompleto}</b>, identificado(a) con{" "}
                {data.tipoDocumento} N.° <b>{data.numeroDocumento}</b>, socio(a)
                de la {ORG.nombre}, me dirijo a Usted con el debido respeto para
                presentar mi <b>RENUNCIA A LA TITULARIDAD</b>{" "}
                {unPuesto ? "del puesto" : "de los puestos"} <b>{puestosTxt}</b>,
                a fin de que se autorice su transferencia al nuevo propietario.
              </p>

              <p>
                Dejo expresa constancia de que{" "}
                <b>conservo mi condición de socio(a)</b> y la titularidad de mis
                demás puestos en la asociación; la presente renuncia se
                circunscribe únicamente{" "}
                {unPuesto ? "al puesto indicado" : "a los puestos indicados"}
                {data.alDia ? (
                  <>
                    , respecto {unPuesto ? "del cual" : "de los cuales"} me
                    encuentro al día en mis obligaciones y pagos ante la
                    asociación.
                  </>
                ) : (
                  <>.</>
                )}
              </p>

              <p>
                Por tal motivo, solicito se me brinden las facilidades
                correspondientes para efectuar la transferencia y entrega de{" "}
                {unPuesto ? "dicho puesto" : "dichos puestos"} al nuevo
                propietario, conforme a las disposiciones del Estatuto y
                Reglamento Interno de la institución.
              </p>
            </>
          )}

          <p>
            Sin otro particular, solicito se sirva atender la presente renuncia y
            realizar los trámites correspondientes conforme a las normas de la
            asociación.
          </p>

          <p>Atentamente,</p>
        </div>

        <div className="renuncia__firma">
          <div className="renuncia__firma-line" />
          <div className="renuncia__firma-name">{data.nombreCompleto}</div>
          <div className="renuncia__firma-doc">
            {data.tipoDocumento} N.° {data.numeroDocumento}
          </div>
        </div>
      </article>
    </div>
  );
}
