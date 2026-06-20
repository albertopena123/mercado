// Generador de .xlsx mínimo, SIN dependencias. Un .xlsx es un ZIP de XML; el
// XML siempre es UTF-8, así que Excel lo abre sin la ambigüedad de encoding del
// CSV (que en Excel-ES suele mostrar mojibake). Usamos el método ZIP "stored"
// (sin compresión) para no depender de zlib ni de librerías externas.

type Cell = string | number | null | undefined;

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Empaqueta archivos en un ZIP (entradas "stored", sin comprimir).
function zipStore(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = f.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // método 0 = stored
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0, 12); // fecha
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // tamaño comprimido
    local.writeUInt32LE(data.length, 22); // tamaño sin comprimir
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    locals.push(local, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // versión creada por
    cd.writeUInt16LE(20, 6); // versión necesaria
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comentario
    cd.writeUInt16LE(0, 34); // disco
    cd.writeUInt16LE(0, 36); // attrs internos
    cd.writeUInt32LE(0, 38); // attrs externos
    cd.writeUInt32LE(offset, 42); // offset del header local
    centrals.push(cd, name);

    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); // entradas en este disco
  eocd.writeUInt16LE(files.length, 10); // entradas totales
  eocd.writeUInt32LE(central.length, 12); // tamaño del directorio central
  eocd.writeUInt32LE(offset, 16); // offset del directorio central
  return Buffer.concat([...locals, central, eocd]);
}

function escXml(s: string): string {
  // Escapa especiales de XML y omite caracteres de control invalidos en XML 1.0
  // (se permiten tab, LF y CR). Recorre por codigo para evitar literales raros.
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue;
    const ch = s[i];
    out +=
      ch === "&"
        ? "&amp;"
        : ch === "<"
          ? "&lt;"
          : ch === ">"
            ? "&gt;"
            : ch === '"'
              ? "&quot;"
              : ch;
  }
  return out;
}

function colLetter(idx: number): string {
  let n = idx + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellXml(ref: string, val: Cell): string {
  if (val === null || val === undefined || val === "") return `<c r="${ref}"/>`;
  if (typeof val === "number" && Number.isFinite(val))
    return `<c r="${ref}" t="n"><v>${val}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(
    String(val),
  )}</t></is></c>`;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * Construye un libro .xlsx de una hoja a partir de encabezados + filas.
 * Devuelve los bytes del archivo (Buffer) — el llamador lo envía en base64.
 */
export function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: Cell[][],
  // Anchos opcionales por columna (en "caracteres" de Excel). Si se omite, Excel
  // usa el ancho por defecto. Útil p. ej. para una columna de firma ancha.
  colWidths?: number[],
): Buffer {
  const safeName = escXml(sheetName).slice(0, 31) || "Hoja1";
  const allRows = [headers, ...rows];
  const rowsXml = allRows
    .map((row, r) => {
      const cells = row
        .map((v, c) => cellXml(`${colLetter(c)}${r + 1}`, v))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  const colsXml =
    colWidths && colWidths.length
      ? `<cols>${colWidths
          .map(
            (w, i) =>
              `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
          )
          .join("")}</cols>`
      : "";

  const sheet =
    XML +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    colsXml +
    `<sheetData>${rowsXml}</sheetData></worksheet>`;

  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    "</Types>";

  const rels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const workbook =
    XML +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    "</Relationships>";

  const enc = (s: string) => Buffer.from(s, "utf8");
  return zipStore([
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rels) },
    { name: "xl/workbook.xml", data: enc(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheet) },
  ]);
}
