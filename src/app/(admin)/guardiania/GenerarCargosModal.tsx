"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import { generarCargosGuardiania } from "./actions";
import type { CargosResumen } from "./types";

const mesLargo = (mes: string) => {
  const M = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
  return `${M[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(0, 4)}`;
};
const mesSiguiente = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const nfmt = (n: number) => n.toLocaleString("es-PE");

export function GenerarCargosModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [preview, setPreview] = useState<CargosResumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEscClose(true, onClose, saving);

  useEffect(() => {
    (async () => {
      const res = await generarCargosGuardiania({ commit: false });
      if (res.ok) setPreview(res.data!);
      else setError(res.error);
      setLoading(false);
    })();
  }, []);

  async function confirmar() {
    if (saving) return;
    setSaving(true);
    const res = await generarCargosGuardiania({ commit: true });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${nfmt(res.data!.creadas)} cargos de guardianía generados.`);
    onSaved();
  }

  const nada = !!preview && preview.cuotasNuevas === 0;

  return (
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Generar cargos a socios</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar" disabled={saving}>
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          {error && (
            <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{error}</span>
            </div>
          )}

          {loading && <p className="gd-empty" style={{ padding: 32 }}>Calculando…</p>}

          {preview && (
            <>
              {nada ? (
                <p className="gd-cargos__lead">
                  <b>{mesLargo(preview.hasta)}</b> ya está generado — no hay cargos nuevos. Cuando inicie{" "}
                  <b>{mesLargo(mesSiguiente(preview.hasta))}</b>, vuelve a este botón para generar el mes
                  nuevo. Reejecutar no duplica.
                </p>
              ) : (
                <p className="gd-cargos__lead">
                  Se crea un cargo mensual de guardianía por cada puesto, desde su inicio hasta{" "}
                  <b>{mesLargo(preview.hasta)}</b>, en el estado de cuenta de cada socio. Los meses con
                  pago quedan <b>pagados</b>; los demás, <b>pendientes</b>. Reejecutar no duplica.
                </p>
              )}

              <div className="gd-cargos__grid">
                <div className="gd-cargos__stat gd-cargos__stat--new">
                  <span className="gd-cargos__num">{nfmt(preview.cuotasNuevas)}</span>
                  <span className="gd-cargos__lbl">cargos a crear</span>
                </div>
                <div className="gd-cargos__stat">
                  <span className="gd-cargos__num">{nfmt(preview.socios)}</span>
                  <span className="gd-cargos__lbl">socios · {nfmt(preview.cuentas)} puestos</span>
                </div>
                <div className="gd-cargos__stat">
                  <span className="gd-cargos__num">{formatSoles(preview.totalPendiente)}</span>
                  <span className="gd-cargos__lbl">deuda pendiente nueva</span>
                </div>
              </div>

              <ul className="gd-cargos__detail">
                <li><span>Meses pagados (del histórico)</span><b>{nfmt(preview.mesesPagados)}</b></li>
                <li><span>Meses pendientes</span><b>{nfmt(preview.mesesPendientes)}</b></li>
                <li><span>Ya existían (se omiten)</span><b>{nfmt(preview.cuotasExistentes)}</b></li>
              </ul>
            </>
          )}
        </div>

        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            {nada ? "Cerrar" : "Cancelar"}
          </button>
          {!nada && (
            <button type="button" className="btn btn--primary" onClick={confirmar} disabled={loading || saving || !preview}>
              {saving ? "Generando…" : `Generar ${preview ? nfmt(preview.cuotasNuevas) : ""} cargos`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
