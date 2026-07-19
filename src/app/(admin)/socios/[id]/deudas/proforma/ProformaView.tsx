"use client";

import "./proforma.css";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { formatSoles } from "@/lib/money";
import { fechaCorta, hoyLarga } from "@/lib/fecha";
import { ORG } from "@/lib/org";
import type { EstadoSocio } from "@/generated/prisma/client";

type SocioHeader = {
  codigo: string;
  numeroPadron: number | null;
  estado: EstadoSocio;
  documento: string;
  nombre: string;
};

type Pendiente = {
  id: string;
  periodo: string;
  concepto: string;
  monto: number;
  vencimiento: string | null;
};

type Exonerada = {
  id: string;
  periodo: string;
  concepto: string;
  monto: number;
  motivo: string | null;
};

export function ProformaView({
  socioId,
  socio,
  pendientes,
  exoneradas,
}: {
  socioId: string;
  socio: SocioHeader;
  pendientes: Pendiente[];
  exoneradas: Exonerada[];
}) {
  const router = useRouter();
  const hoy = hoyLarga();
  const totalDeuda =
    Math.round(pendientes.reduce((a, c) => a + c.monto, 0) * 100) / 100;
  const totalExonerado =
    Math.round(exoneradas.reduce((a, c) => a + c.monto, 0) * 100) / 100;

  return (
    <div className="prof-page">
      <div className="prof-toolbar no-print">
        <button
          className="btn btn--ghost"
          onClick={() => router.push(`/socios/${socioId}/deudas`)}
        >
          <Icon
            name="chevron-right"
            size={14}
            style={{ transform: "rotate(180deg)" }}
          />
          <span>Volver</span>
        </button>
        <button className="btn--cta" onClick={() => window.print()}>
          <Icon name="download" size={16} />
          <span>Imprimir / Guardar PDF</span>
        </button>
      </div>

      <article className="prof">
        <header className="prof__head">
          <div className="prof__org">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="prof__logo"
              src="/logo-feria-milagros.png"
              alt="Logo de la feria"
            />
            <div className="prof__org-text">
              <div className="prof__org-name">{ORG.nombre}</div>
              <div className="prof__org-sub">
                {ORG.domicilio} · {ORG.ciudad}
              </div>
            </div>
          </div>
          <div className="prof__doc">
            <div className="prof__doc-title">Proforma de deuda</div>
            <div className="prof__doc-meta">{ORG.ciudad}, {hoy}</div>
          </div>
        </header>

        <section className="prof__socio">
          <div>
            <span className="prof__k">Socio</span>
            <span className="prof__v">{socio.nombre}</span>
          </div>
          <div>
            <span className="prof__k">Documento</span>
            <span className="prof__v">{socio.documento}</span>
          </div>
          <div>
            <span className="prof__k">Código</span>
            <span className="prof__v">
              {socio.codigo}
              {socio.numeroPadron != null && ` · Padrón ${socio.numeroPadron}`}
            </span>
          </div>
        </section>

        <h2 className="prof__h2">Cuotas pendientes</h2>
        {pendientes.length === 0 ? (
          <p className="prof__empty">El socio no tiene cuotas pendientes.</p>
        ) : (
          <table className="prof__table">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Concepto</th>
                <th>Vencimiento</th>
                <th className="prof__num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((c) => (
                <tr key={c.id}>
                  <td>{c.periodo}</td>
                  <td>{c.concepto}</td>
                  <td>{c.vencimiento ? fechaCorta(c.vencimiento) : "—"}</td>
                  <td className="prof__num">{formatSoles(c.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="prof__num prof__totlabel">
                  Total deuda
                </td>
                <td className="prof__num">{formatSoles(totalDeuda)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {exoneradas.length > 0 && (
          <>
            <h2 className="prof__h2">
              Cuotas exoneradas <span className="prof__hint">(no se cobran)</span>
            </h2>
            <table className="prof__table prof__table--exon">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Concepto</th>
                  <th>Motivo</th>
                  <th className="prof__num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {exoneradas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.periodo}</td>
                    <td>{c.concepto}</td>
                    <td>{c.motivo ?? "—"}</td>
                    <td className="prof__num">{formatSoles(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="prof__num prof__totlabel">
                    Total exonerado
                  </td>
                  <td className="prof__num">{formatSoles(totalExonerado)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        <section className="prof__resumen">
          <div className="prof__resumen-row prof__resumen-row--total">
            <span>Total a pagar</span>
            <span>{formatSoles(totalDeuda)}</span>
          </div>
        </section>

        <footer className="prof__foot">
          <div className="prof__firma">
            <div className="prof__firma-line" />
            <div>Tesorería</div>
          </div>
          <p className="prof__nota">
            Documento informativo (proforma). Los montos corresponden a las
            cuotas pendientes a la fecha de emisión y pueden variar. No constituye
            comprobante de pago.
          </p>
        </footer>
      </article>
    </div>
  );
}
