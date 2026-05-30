// Límites y formatos permitidos para las subidas de socios (foto y documentos).
//
// A diferencia de `storage.ts`, este módulo NO es "server-only": se importa
// también desde el cliente para (a) mostrarle al usuario el límite antes de
// subir y (b) validar el archivo localmente sin esperar la subida completa.
// Es la única fuente de verdad: el servidor y el cliente leen de aquí, así no
// se desincronizan.

export const MAX_UPLOAD_MB = 5;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// La foto del socio solo puede ser una imagen.
export const FOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
// Los documentos admiten además PDF.
export const DOC_MIME = [...FOTO_MIME, "application/pdf"] as const;

// Valor para el atributo `accept` del <input type="file">.
export const FOTO_ACCEPT = FOTO_MIME.join(",");
export const DOC_ACCEPT = DOC_MIME.join(",");

// Texto legible para el usuario.
export const FOTO_FORMATOS = "JPG, PNG o WebP";
export const DOC_FORMATOS = "JPG, PNG, WebP o PDF";

export type UploadKind = "foto" | "doc";

const FOTO_MIME_SET: ReadonlySet<string> = new Set(FOTO_MIME);
const DOC_MIME_SET: ReadonlySet<string> = new Set(DOC_MIME);

export function allowedMime(kind: UploadKind): ReadonlySet<string> {
  return kind === "foto" ? FOTO_MIME_SET : DOC_MIME_SET;
}

/** Tamaño legible: "843 KB", "2.4 MB". */
export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  // Se redondea KB antes de comparar para no mostrar "1024 KB" en el borde
  // exacto (1.048.575 B) en lugar de "1 MB".
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1).replace(/\.0$/, "")} MB`;
}

/**
 * Valida tamaño y tipo de un archivo. Devuelve un mensaje de error listo para
 * mostrar, o `null` si el archivo es válido. Sirve igual en cliente y servidor.
 */
export function validateUpload(file: File, kind: UploadKind): string | null {
  const noun = kind === "foto" ? "La foto" : "El archivo";
  if (file.size > MAX_UPLOAD_BYTES) {
    // Dos decimales para que el tamaño mostrado siempre sea estrictamente
    // mayor que el máximo (evita el mensaje contradictorio "pesa 5 MB, máx 5 MB").
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return `${noun} pesa ${mb} MB. El máximo permitido es ${MAX_UPLOAD_MB} MB.`;
  }
  if (!allowedMime(kind).has(file.type)) {
    const formatos = kind === "foto" ? FOTO_FORMATOS : DOC_FORMATOS;
    return `Formato no permitido. Usa ${formatos}.`;
  }
  return null;
}
