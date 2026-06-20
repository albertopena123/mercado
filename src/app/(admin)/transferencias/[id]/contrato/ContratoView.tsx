"use client";

import "../../../socios/[id]/constancia/constancia.css";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { fechaLarga } from "@/lib/fecha";
import { ORG } from "@/lib/org";

type Parte = {
  nombre: string;
  documento: string;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
};

type Data = {
  fecha: string;
  transferente: Parte & {
    sexo: string | null;
    estadoCivil: string | null;
    padron: number | null;
    anioEmpadronamiento: number;
  };
  adquiriente: Parte;
  puesto: {
    numero: number;
    bloque: string;
    rubro: string;
    dim: string;
    m2: string;
  };
};

function domicilio(p: Parte): string {
  const partes: string[] = [];
  if (p.direccion) partes.push(`domiciliado(a) en ${p.direccion}`);
  if (p.distrito) partes.push(`de la ciudad de ${p.distrito}`);
  if (p.provincia) partes.push(`provincia de ${p.provincia}`);
  if (p.departamento) partes.push(`departamento de ${p.departamento}`);
  return partes.join(", ");
}

function trato(sexo: string | null): string {
  return sexo === "F" ? "doña" : sexo === "M" ? "don" : "don(ña)";
}

export function ContratoView({ data }: { data: Data }) {
  const router = useRouter();
  const tr = data.transferente;
  const adq = data.adquiriente;
  const pu = data.puesto;

  return (
    <div className="constancia-page">
      <div className="constancia-toolbar no-print">
        <button
          className="btn btn--ghost"
          onClick={() => router.back()}
        >
          <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} />
          <span>Volver</span>
        </button>
        <button className="btn--cta" onClick={() => window.print()}>
          <Icon name="download" size={16} />
          <span>Imprimir / Guardar PDF</span>
        </button>
      </div>

      <article className="constancia">
        <div className="constancia__banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos_sistema/logo_header.png"
            alt="Gran Feria Mayorista Internacional MDD"
          />
        </div>
        <div className="constancia__membrete">
          <p className="constancia__lema">“{ORG.lemaAnio}”</p>
          <p className="constancia__partida">Partida N.° {ORG.partida}</p>
        </div>

        <h1 className="constancia__title">
          Contrato Privado de Transferencia de Acciones y Derecho de un Puesto de
          Venta
        </h1>

        <div className="constancia__body">
          <p>
            Que, otorga {trato(tr.sexo)}: <b>{tr.nombre}</b>, peruano(a),
            identificado(a) con {tr.documento}
            {tr.estadoCivil ? `, ${tr.estadoCivil}` : ""}
            {domicilio(tr) ? `, ${domicilio(tr)}` : ""}, en adelante{" "}
            <b>EL TRANSFERENTE</b>; en favor de <b>{adq.nombre}</b>, con{" "}
            {adq.documento}
            {domicilio(adq) ? `, ${domicilio(adq)}` : ""}, en adelante{" "}
            <b>EL ADQUIRIENTE</b>; en los siguientes términos:
          </p>

          <p>
            <b>PRIMERO.</b> — El transferente declara ser propietario del{" "}
            <b>PUESTO DE VENTA N.° {pu.numero}</b>, del RUBRO “{pu.rubro}”,{" "}
            <b>BLOQUE {pu.bloque}</b>, ubicado en la {ORG.nombreLegal}, de la
            ciudad de Puerto Maldonado, distrito y provincia de Tambopata,
            departamento de Madre de Dios, por ser socio(a) conductor(a) directo(a)
            del puesto de venta en referencia, así consta en el padrón de socio
            número <b>{tr.padron ?? "—"}</b> año de empadronamiento{" "}
            {tr.anioEmpadronamiento} de la {ORG.nombreLegal}, de un área de{" "}
            {pu.dim} por puesto que asciende a un total de ({pu.m2})
            aproximadamente, consiste en espacio, con techo, puerta enrollable y
            sin servicios básicos.
          </p>

          <p>
            <b>SEGUNDO.</b> — Conforme su calidad de propietario, entrega la
            totalidad de sus acciones y derechos del referido Puesto de Venta en
            calidad de <b>TRANSFERENTE</b> a favor de <b>{adq.nombre}</b>.
          </p>

          <p>
            <b>TERCERO.</b> — Las contratantes declaran que el presente acto
            jurídico lo realizan por propia voluntad y manifestación de las
            partes, habiéndose realizado mutuas concesiones en muestra de
            compensar esta cesión de derecho y acciones.
          </p>

          <p>
            <b>CUARTO.</b> — El adquiriente declara que acepta la presente
            transferencia en los términos de este contrato, quien hace uso y
            posesión de las acciones y derechos del puesto en calidad de
            COMPRADOR que adquiere a partir de la fecha. Declarando el
            transferente que renuncia a la posesión del puesto y a ser socio de
            la Asociación, a favor del adquiriente, el nuevo titular del puesto y
            socio de la {ORG.nombreLegal}.
          </p>

          <p>
            <b>QUINTO.</b> — Los otorgantes declaran que se ratifican en todos los
            términos de este contrato que celebran de libre y espontánea
            voluntad.
          </p>

          <p className="constancia__fecha">
            {ORG.ciudad}, {fechaLarga(data.fecha)}.
          </p>
        </div>

        <div className="constancia__firmas">
          <div className="constancia__firma">
            <div className="constancia__firma-line" />
            <div className="constancia__firma-label">{tr.nombre}</div>
            <div className="constancia__firma-sub">{tr.documento}</div>
            <div className="constancia__firma-sub">
              <b>TRANSFERENTE</b>
            </div>
          </div>
          <div className="constancia__firma">
            <div className="constancia__firma-line" />
            <div className="constancia__firma-label">{adq.nombre}</div>
            <div className="constancia__firma-sub">{adq.documento}</div>
            <div className="constancia__firma-sub">
              <b>ADQUIRIENTE</b>
            </div>
          </div>
        </div>

        <div className="constancia__domicilio">
          Domicilio: {ORG.domicilio} · Celular: {ORG.celular}
        </div>
      </article>
    </div>
  );
}
