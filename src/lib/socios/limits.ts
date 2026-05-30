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

// ─────────────────────────── Detección por contenido ───────────────────────
// La etiqueta `file.type` del navegador no es confiable: a veces llega vacía
// (p. ej. imágenes generadas por IA, descargas vía blob, o cuando el SO no
// tiene asociada la extensión). Por eso detectamos el tipo REAL por los
// "magic bytes" del propio archivo y lo preferimos sobre la etiqueta.

/** Bytes iniciales que basta leer para identificar el formato. */
export const SNIFF_BYTES = 16;

const SIG_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SIG_JPEG = [0xff, 0xd8, 0xff];
const SIG_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const SIG_WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" (offset 8 dentro de un RIFF)
const SIG_PDF = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

function matches(buf: Uint8Array, sig: number[], offset = 0): boolean {
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Detecta el MIME real de un archivo a partir de sus primeros bytes. Devuelve
 * el tipo detectado (image/png, image/jpeg, image/webp, application/pdf) o
 * `null` si no reconoce la firma. No confía en `file.type`.
 */
export function sniffMime(head: Uint8Array): string | null {
  if (matches(head, SIG_PNG)) return "image/png";
  if (matches(head, SIG_JPEG)) return "image/jpeg";
  if (matches(head, SIG_RIFF) && matches(head, SIG_WEBP, 8)) return "image/webp";
  if (matches(head, SIG_PDF)) return "application/pdf";
  return null;
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
 *
 * `sniffedType` es el MIME detectado por contenido (ver `sniffMime`). Si se
 * provee, se prefiere sobre `file.type` —que no es confiable—; si no, se cae a
 * la etiqueta del navegador para mantener compatibilidad.
 */
export function validateUpload(
  file: File,
  kind: UploadKind,
  sniffedType?: string | null,
): string | null {
  const noun = kind === "foto" ? "La foto" : "El archivo";
  if (file.size > MAX_UPLOAD_BYTES) {
    // Dos decimales para que el tamaño mostrado siempre sea estrictamente
    // mayor que el máximo (evita el mensaje contradictorio "pesa 5 MB, máx 5 MB").
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return `${noun} pesa ${mb} MB. El máximo permitido es ${MAX_UPLOAD_MB} MB.`;
  }
  const effectiveType = sniffedType ?? file.type;
  if (!allowedMime(kind).has(effectiveType)) {
    const formatos = kind === "foto" ? FOTO_FORMATOS : DOC_FORMATOS;
    return `Formato no permitido. Usa ${formatos}.`;
  }
  return null;
}
