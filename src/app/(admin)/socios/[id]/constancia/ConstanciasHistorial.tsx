"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/toast";
import { fechaHora, fechaLargaTS } from "@/lib/fecha";
import { anularConstancia } from "./actions";

export type HistorialItem = {
  id: string;
  tipo: "socio_habil" | "no_adeudo";
  folio: string;
  codigo: string;
  motivo: string | null;
  emitidoEn: string;
  validoHasta: string | null;
  anulada: boolean;
  motivoAnulacion: string | null;
};

type Estado = "vigente" | "vencida" | "anulada";

function estadoDe(c: HistorialItem): Estado {
  if (c.anulada) return "anulada";
  if (c.validoHasta && new Date() > new Date(c.validoHasta)) return "vencida";
  return "vigente";
}

const ESTADO_LABEL: Record<Estado, string> = {
  vigente: "Vigente",
  vencida: "Vencida",
  anulada: "Anulada",
};

export function ConstanciasHistorial({ items }: { items: HistorialItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  if (items.length === 0) return null;

  async function confirmar(id: string) {
    if (busy) return;
    if (!motivo.trim()) {
      toast.error("Indica el motivo de la anulación.");
      return;
    }
    setBusy(true);
    const res = await anularConstancia(id, motivo.trim());
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Constancia anulada. Su código QR mostrará “ANULADA”.");
    setAnulandoId(null);
    setMotivo("");
    router.refresh();
  }

  return (
    <section className="no-print constancia-historial">
      <h3 className="constancia-historial__title">Constancias emitidas</h3>
      <p className="constancia-historial__hint">
        Anular una constancia la <b>revoca</b>: al escanear su QR se mostrará
        “ANULADA”, incluso en fotocopias ya entregadas. Úsalo si detectas un uso
        indebido (por ejemplo, exhibirla para “vender” un puesto).
      </p>
      <ul className="constancia-historial__list">
        {items.map((c) => {
          const est = estadoDe(c);
          return (
            <li key={c.id} className={`constancia-historial__item is-${est}`}>
              <div className="constancia-historial__row">
                <div className="constancia-historial__main">
                  <b>{c.tipo === "no_adeudo" ? "No adeudo" : "Socio"}</b>
                  <span className="constancia-historial__folio">
                    N.° {c.folio}
                  </span>
                  <span className={`constancia-historial__badge is-${est}`}>
                    {ESTADO_LABEL[est]}
                  </span>
                </div>
                {est !== "anulada" &&
                  (anulandoId === c.id ? null : (
                    <button
                      type="button"
                      className="btn btn--ghost constancia-historial__anularbtn"
                      onClick={() => {
                        setAnulandoId(c.id);
                        setMotivo("");
                      }}
                    >
                      Anular
                    </button>
                  ))}
              </div>
              <div className="constancia-historial__meta">
                <span>Emitida {fechaHora(c.emitidoEn)}</span>
                {c.validoHasta && (
                  <span> · Válida hasta {fechaLargaTS(c.validoHasta)}</span>
                )}
                {c.motivo && <span> · Para: {c.motivo}</span>}
                {c.anulada && c.motivoAnulacion && (
                  <span className="constancia-historial__anulmotivo">
                    {" "}
                    · Anulada: {c.motivoAnulacion}
                  </span>
                )}
              </div>
              {anulandoId === c.id && (
                <div className="constancia-historial__anular">
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo de la anulación…"
                    disabled={busy}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ color: "#b91c1c", fontWeight: 600 }}
                    onClick={() => confirmar(c.id)}
                    disabled={busy}
                  >
                    {busy ? "Anulando…" : "Confirmar anulación"}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setAnulandoId(null);
                      setMotivo("");
                    }}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
