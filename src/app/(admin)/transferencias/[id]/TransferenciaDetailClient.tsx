"use client";

import "../../socios/socios.css";
import "../transferencias.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import { fechaCorta, fechaHora } from "@/lib/fecha";
import { ConfirmDialog } from "../../socios/ConfirmDialog";
import {
  formalizarTransferencia,
  anularTransferencia,
  subirDocumento,
  quitarDocumento,
} from "../actions";
import type { TransferenciaDetail } from "../types";

const ESTADO_LABEL: Record<string, string> = {
  borrador: "Borrador",
  completada: "Completada",
  anulada: "Anulada",
};

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="tr-kv">
      <span className="tr-kv__k">{k}</span>
      <span className="tr-kv__v">{v}</span>
    </div>
  );
}

export function TransferenciaDetailClient({
  initial,
  canWrite,
}: {
  initial: TransferenciaDetail;
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = initial;
  const [confirmar, setConfirmar] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<"renuncia" | "contrato" | null>(
    null,
  );

  const esBorrador = t.estado === "borrador";
  const conDeuda = t.transferenteDeuda > 0;
  const editable = esBorrador && canWrite;
  const faltanDocs = !t.renunciaUrl || !t.contratoUrl;
  const puedeFormalizar = !conDeuda && !faltanDocs;

  const requisitos: {
    ok: boolean;
    label: string;
    okText: React.ReactNode;
    pendiente: React.ReactNode;
  }[] = [
    {
      ok: !conDeuda,
      label: "Transferente sin deuda",
      okText: "Al día",
      pendiente: (
        <>
          Debe <b>{formatSoles(t.transferenteDeuda)}</b> ·{" "}
          <a href={`/socios/${t.transferenteId}/deudas`}>ver estado de cuenta</a>
        </>
      ),
    },
    {
      ok: !!t.renunciaUrl,
      label: "Carta de renuncia firmada",
      okText: "Firmada y cargada",
      pendiente: "Imprime la plantilla, fírmala, escanéala y súbela abajo",
    },
    {
      ok: !!t.contratoUrl,
      label: "Contrato de transferencia firmado",
      okText: "Firmado y cargado",
      pendiente: "Imprime la plantilla, fírmalo, escanéalo y súbelo abajo",
    },
  ];
  const pendientes = requisitos.filter((r) => !r.ok).length;
  const adq = t.adquiriente;
  const adqNombre = `${adq.nombres} ${adq.apellidoPaterno} ${adq.apellidoMaterno ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const adqUbic =
    [adq.distrito, adq.provincia, adq.departamento].filter(Boolean).join(", ") ||
    "—";

  async function onFormalizar() {
    if (pending) return;
    setPending(true);
    const res = await formalizarTransferencia(t.id);
    setPending(false);
    setConfirmar(false);
    if (!res.ok) return toast.error(res.error);
    const d = res.data!;
    toast.success(
      `Transferencia formalizada. Socio nuevo ${d.adquirienteSocioCodigo}.${
        d.transferenteRetirado ? " Transferente retirado." : ""
      }`,
    );
    router.refresh();
  }

  async function onAnular() {
    setPending(true);
    const res = await anularTransferencia(t.id);
    setPending(false);
    setAnulando(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Transferencia anulada.");
    router.refresh();
  }

  async function handleUpload(tipo: "renuncia" | "contrato", file: File) {
    setUploading(tipo);
    const res = await subirDocumento(t.id, tipo, file);
    setUploading(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Documento cargado.");
    router.refresh();
  }

  async function handleRemove(tipo: "renuncia" | "contrato") {
    const res = await quitarDocumento(t.id, tipo);
    if (!res.ok) return toast.error(res.error);
    toast.success("Documento quitado.");
    router.refresh();
  }

  const reqDoc = (
    tipo: "renuncia" | "contrato",
    icon: "mail" | "external",
    title: string,
    printHref: string,
    url: string | null,
    por: string | null,
    en: string | null,
  ) => (
    <div className="tr-docreq">
      <div className="tr-docreq__head">
        <span className="tr-docreq__icon">
          <Icon name={icon} size={18} />
        </span>
        <div className="tr-docreq__txt">
          <div className="tr-docreq__title">{title}</div>
          <div className="tr-docreq__sub">
            {url
              ? por
                ? `Subido por ${por}${en ? ` · ${fechaHora(en)}` : ""}`
                : "Escaneo firmado cargado"
              : "Imprime la plantilla, fírmala, escanéala y súbela"}
          </div>
        </div>
        <span className={`tr-docreq__status ${url ? "is-ok" : "is-pending"}`}>
          {url ? (
            <>
              <Icon name="check" size={12} /> Cargado
            </>
          ) : (
            <>
              <span className="tr-pill__dot" /> Pendiente
            </>
          )}
        </span>
      </div>
      <div className="tr-docreq__actions">
        <a href={printHref} target="_blank" rel="noreferrer">
          Imprimir plantilla
        </a>
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            Ver escaneo
          </a>
        )}
        {editable && (
          <label
            className={`tr-filebtn ${uploading === tipo ? "is-busy" : ""}`}
          >
            <Icon
              name="download"
              size={14}
              style={{ transform: "rotate(180deg)" }}
            />
            {uploading === tipo
              ? "Subiendo…"
              : url
                ? "Reemplazar"
                : "Subir firmado"}
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) handleUpload(tipo, f);
              }}
            />
          </label>
        )}
        {editable && url && (
          <button
            type="button"
            className="tr-linkbtn"
            onClick={() => handleRemove(tipo)}
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <button
            className="btn btn--ghost"
            style={{ padding: "4px 8px", marginBottom: 8 }}
            onClick={() => router.push("/transferencias")}
          >
            <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} />
            <span>Transferencias</span>
          </button>
          <h1 className="socios-page__title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 22 }}>
              {t.codigo}
            </span>
            <span className={`tr-pill tr-pill--${t.estado}`}>
              <span className="tr-pill__dot" />
              {ESTADO_LABEL[t.estado]}
            </span>
          </h1>
          <span className="socios-page__sub">
            Fecha del contrato: {fechaCorta(t.fecha)}
            {t.completadaEn ? ` · Formalizada ${fechaHora(t.completadaEn)}` : ""}
            {t.monto != null ? ` · Venta ${formatSoles(t.monto)} (interno)` : ""}
          </span>
        </div>
      </header>

      {t.estado === "completada" && (
        <div className="tr-note tr-note--ok">
          <Icon name="check" size={16} />
          <span>
            Transferencia completada. El adquiriente quedó como socio{" "}
            <b>{t.adquirienteSocioCodigo}</b> y se le movió el puesto{" "}
            <b>{t.puestoCodigo}</b>.
          </span>
        </div>
      )}
      {esBorrador && (
        <div className={`tr-gate${puedeFormalizar ? " tr-gate--ready" : ""}`}>
          <div className="tr-gate__head">
            <Icon name="check" size={16} />
            <span className="tr-gate__title">
              Requisitos para formalizar
            </span>
            {puedeFormalizar ? (
              <span className="tr-gate__chip tr-gate__chip--ready">
                <Icon name="check" size={13} /> Listo para formalizar
              </span>
            ) : (
              <span className="tr-gate__chip tr-gate__chip--pending">
                {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"}
              </span>
            )}
          </div>
          {requisitos.map((r, i) => (
            <div className="tr-gate__req" key={i}>
              <span
                className={`tr-gate__reqicon ${
                  r.ok ? "tr-gate__reqicon--ok" : "tr-gate__reqicon--pending"
                }`}
              >
                <Icon name={r.ok ? "check" : "info"} size={16} />
              </span>
              <span className="tr-gate__reqtxt">
                <span className="tr-gate__reqlabel">{r.label}</span>
                <span
                  className={`tr-gate__reqstate${
                    r.ok ? " tr-gate__reqstate--ok" : ""
                  }`}
                >
                  {r.ok ? r.okText : r.pendiente}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Hero del handoff */}
      <div className="tr-hero">
        <div className="tr-hero__party">
          <div className="tr-hero__role">Transferente</div>
          <div className="tr-hero__name">{t.transferenteNombre}</div>
          <div className="tr-hero__meta">
            {t.transferenteCodigo} · {t.transferenteDoc}
          </div>
        </div>
        <div className="tr-hero__conn">
          <span className="tr-hero__puesto">{t.puestoCodigo}</span>
          <span className="tr-hero__puestosub">{t.puestoDimension}</span>
          <Icon name="chevron-right" size={26} className="tr-hero__arrow" />
        </div>
        <div className="tr-hero__party tr-hero__party--to">
          <div className="tr-hero__role">Adquiriente</div>
          <div className="tr-hero__name">{adqNombre}</div>
          <div className="tr-hero__meta">
            {adq.tipoDocumento} {adq.numeroDocumento}
            {t.adquirienteSocioCodigo ? ` · ${t.adquirienteSocioCodigo}` : ""}
          </div>
        </div>
      </div>

      {/* Paneles de datos */}
      <div className="tr-grid">
        <section className="tr-panel">
          <h3>
            <Icon name="user" size={16} /> Transferente
          </h3>
          <KV k="Socio" v={t.transferenteNombre} />
          <KV k="Código" v={t.transferenteCodigo} />
          <KV k="Documento" v={t.transferenteDoc} />
          <KV k="N° padrón" v={t.transferentePadron ?? "—"} />
          <KV
            k="Deuda"
            v={
              conDeuda ? (
                <span style={{ color: "#b91c1c" }}>
                  {formatSoles(t.transferenteDeuda)}
                </span>
              ) : (
                <span style={{ color: "#16a34a" }}>Al día</span>
              )
            }
          />
        </section>

        <section className="tr-panel">
          <h3>
            <Icon name="home" size={16} /> Puesto
          </h3>
          <KV k="Código" v={t.puestoCodigo} />
          <KV k="Bloque" v={t.puestoBloque} />
          <KV k="N°" v={t.puestoNumero} />
          <KV k="Etapa" v={t.puestoEtapa} />
          <KV k="Dimensiones" v={t.puestoDimension} />
          <KV k="Rubro" v={t.puestoGiro ?? "—"} />
        </section>

        <section className="tr-panel">
          <h3>
            <Icon name="user" size={16} /> Adquiriente
          </h3>
          <KV k="Nombre" v={adqNombre} />
          <KV k="Documento" v={`${adq.tipoDocumento} ${adq.numeroDocumento}`} />
          <KV k="Estado civil" v={adq.estadoCivil ?? "—"} />
          <KV k="Domicilio" v={adq.direccion ?? "—"} />
          <KV k="Ubicación" v={adqUbic} />
          {t.adquirienteSocioCodigo && (
            <KV k="Socio creado" v={t.adquirienteSocioCodigo} />
          )}
        </section>
      </div>

      {/* Documentos */}
      <section className="tr-panel" style={{ marginBottom: 20 }}>
        <h3>
          <Icon name="folder" size={16} /> Documentos del trámite
        </h3>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            margin: "0 0 14px",
            lineHeight: 1.5,
          }}
        >
          La carta de renuncia y el contrato deben subirse{" "}
          <b>firmados y escaneados</b> para poder formalizar el traspaso.
        </p>
        {reqDoc(
          "renuncia",
          "mail",
          "Carta de renuncia",
          `/transferencias/${t.id}/renuncia`,
          t.renunciaUrl,
          t.renunciaUploadedPor,
          t.renunciaUploadedEn,
        )}
        {reqDoc(
          "contrato",
          "external",
          "Contrato de transferencia",
          `/transferencias/${t.id}/contrato`,
          t.contratoUrl,
          t.contratoUploadedPor,
          t.contratoUploadedEn,
        )}
        <div className="tr-docextra">
          Constancia de no adeudo del transferente:{" "}
          <a
            href={`/socios/${t.transferenteId}/constancia`}
            target="_blank"
            rel="noreferrer"
          >
            imprimir
          </a>{" "}
          — el sistema verifica la deuda automáticamente.
        </div>
      </section>

      {esBorrador && canWrite && (
        <div>
          <div className="tr-actions">
            <button
              className="btn btn--primary"
              onClick={() => setConfirmar(true)}
              disabled={pending || !puedeFormalizar}
              title={
                conDeuda
                  ? "El transferente debe regularizar su deuda primero"
                  : faltanDocs
                    ? "Sube la carta de renuncia y el contrato firmados primero"
                    : "Dar de alta al adquiriente, mover el puesto y retirar al transferente"
              }
            >
              <Icon name="check" size={16} />
              <span>Formalizar transferencia</span>
            </button>
            <button
              className="btn btn--ghost"
              style={{ color: "#b91c1c" }}
              onClick={() => setAnulando(true)}
              disabled={pending}
            >
              <Icon name="trash" size={16} />
              <span>Anular</span>
            </button>
          </div>
        </div>
      )}

      {confirmar && (
        <ConfirmDialog
          title="Formalizar transferencia"
          description={
            <>
              Esta acción es <b>irreversible</b>. En una sola operación:
              <div style={{ marginTop: 8 }}>· Alta de <b>{adqNombre}</b> como socio nuevo.</div>
              <div>· El puesto <b>{t.puestoCodigo}</b> pasa al adquiriente.</div>
              <div>
                · <b>{t.transferenteNombre}</b> se retira (si no le quedan otros
                puestos).
              </div>
            </>
          }
          confirmLabel="Formalizar"
          busy={pending}
          onConfirm={onFormalizar}
          onClose={() => !pending && setConfirmar(false)}
        />
      )}
      {anulando && (
        <ConfirmDialog
          title="Anular transferencia"
          description="El expediente quedará anulado. No se mueve ningún puesto ni socio."
          confirmLabel="Anular"
          tone="danger"
          busy={pending}
          onConfirm={onAnular}
          onClose={() => !pending && setAnulando(false)}
        />
      )}
    </div>
  );
}
