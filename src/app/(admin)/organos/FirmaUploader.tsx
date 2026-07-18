"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import {
  FOTO_ACCEPT,
  SNIFF_BYTES,
  sniffMime,
  validateUpload,
} from "@/lib/socios/limits";
import { subirFirma, eliminarFirma } from "./actions";

export function FirmaUploader({
  directivoId,
  firmaUrl,
  canWrite,
  onChange,
}: {
  directivoId: string;
  firmaUrl: string | null;
  canWrite: boolean;
  onChange: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;

    // Validación local (rápida) antes de subir: tamaño + contenido por magic bytes.
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const sniffed = sniffMime(head);
    const err = validateUpload(file, "foto", sniffed);
    if (err) {
      toast.error(err);
      return;
    }

    setBusy(true);
    const res = await subirFirma(directivoId, file);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Firma actualizada.");
    onChange();
  }

  async function onDelete() {
    setBusy(true);
    const res = await eliminarFirma(directivoId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Firma eliminada.");
    onChange();
  }

  return (
    <div className="org-firma">
      {firmaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="org-firma__img"
          src={firmaUrl}
          alt="Firma del directivo"
        />
      ) : (
        <span className="org-firma__empty">Sin firma</span>
      )}
      {canWrite && (
        <div className="org-firma__actions">
          <input
            ref={inputRef}
            type="file"
            accept={FOTO_ACCEPT}
            hidden
            onChange={onPick}
          />
          <button
            className="iconbtn"
            title={firmaUrl ? "Reemplazar firma" : "Subir firma"}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="plus" size={16} />
          </button>
          {firmaUrl && (
            <button
              className="iconbtn iconbtn--danger"
              title="Eliminar firma"
              disabled={busy}
              onClick={onDelete}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
