"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { getBien } from "./actions";
import { TIPO_MOV_LABEL } from "./labels";
import type { BienRow, BienDetail } from "./types";

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistorialBienModal({
  bien,
  onClose,
}: {
  bien: BienRow;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<BienDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEscClose(true, onClose, false);

  useEffect(() => {
    let alive = true;
    getBien(bien.id).then((res) => {
      if (!alive) return;
      if (res.ok) setDetail(res.data!);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [bien.id]);

  const movs = detail?.movimientos ?? [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2>Historial de stock</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          <p className="modal__intro">
            {bien.codigo} · <b>{bien.nombre}</b> — stock actual{" "}
            <b>{bien.cantidad}</b> {bien.unidad}
          </p>

          {error && (
            <div className="inv-error" role="alert">
              <Icon name="info" size={16} />
              <span>{error}</span>
            </div>
          )}

          {!detail && !error && (
            <p className="inv-kardex__empty">Cargando…</p>
          )}

          {detail && movs.length === 0 && (
            <p className="inv-kardex__empty">
              Aún no hay movimientos registrados para este bien.
            </p>
          )}

          {movs.length > 0 && (
            <ul className="inv-kardex">
              {movs.map((m) => (
                <li key={m.id}>
                  <span className={`inv-kardex__tag inv-kardex__tag--${m.tipo}`}>
                    {TIPO_MOV_LABEL[m.tipo]}
                  </span>
                  <div className="inv-kardex__main">
                    <div className="inv-kardex__chg">
                      {m.cantidadAnterior} → {m.cantidadNueva}
                      {m.tipo !== "ajuste" && (
                        <span className="inv-unit">
                          {" "}
                          ({m.tipo === "entrada" ? "+" : "−"}
                          {m.cantidad})
                        </span>
                      )}
                    </div>
                    <div className="inv-kardex__meta">
                      {fmt(m.createdAt)}
                      {m.byUser ? ` · ${m.byUser}` : ""}
                      {m.motivo ? ` · ${m.motivo}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
