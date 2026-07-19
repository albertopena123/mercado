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

/* ===========================================================================
   Generador .xlsx CON ESTILOS — para exportes de aspecto profesional.
   Añade styles.xml al paquete OOXML: encabezado con marca, banda de título,
   filas cebra, bordes finos, panel congelado (freeze) y auto-filtro. Sin
   dependencias externas (mismo motor ZIP/XML de arriba).
   ========================================================================== */

// Color de marca de la app (globals.css → --accent). ARGB (FF + RRGGBB).
const BRAND = "FF1A73E8";

export type XlsxColType = "text" | "number" | "money" | "date";

export interface XlsxColumn {
  header: string;
  /** Tipo de dato: define formato y alineación por defecto. */
  type?: XlsxColType;
  /** Ancho en "caracteres" de Excel. Si se omite, se calcula del contenido. */
  width?: number;
  /** Alineación horizontal. Por defecto: number→right, date→center, text→left. */
  align?: "left" | "center" | "right";
}

export type XlsxValue = string | number | Date | null | undefined;

export interface StyledXlsxOptions {
  /** Nombre de la pestaña (máx. 31 chars). */
  sheetName: string;
  /** Título grande en la banda superior (p. ej. "Padrón de socios"). */
  title?: string;
  /** Subtítulo (p. ej. la razón social / marca). */
  subtitle?: string;
  /** Líneas de metadatos (fecha de generación, filtros, total…). */
  meta?: string[];
  columns: XlsxColumn[];
  rows: XlsxValue[][];
}

// Serial de fecha de Excel (días desde 1899-12-30). Se calcula desde los
// componentes UTC para evitar el clásico off-by-one por zona horaria: las
// fechas del sistema son fechas-calendario a medianoche UTC.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function excelSerial(d: Date): number | null {
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((utc - EXCEL_EPOCH) / 86400000);
}

// numFmtId personalizados
const NF_DATE = 164; // dd/mm/yyyy (locale PE)
const NF_INT = 165; // #,##0 (miles)
const NF_MONEY = 166; // #,##0.00 (miles con 2 decimales, p. ej. soles)

// styles.xml — fuentes, rellenos, bordes y formatos de celda (cellXfs).
// Los índices de cellXfs están fijados y se referencian por nombre abajo.
const STYLES_XML =
  XML +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  `<numFmts count="3">` +
  `<numFmt numFmtId="${NF_DATE}" formatCode="dd/mm/yyyy"/>` +
  `<numFmt numFmtId="${NF_INT}" formatCode="#,##0"/>` +
  `<numFmt numFmtId="${NF_MONEY}" formatCode="#,##0.00"/>` +
  `</numFmts>` +
  // Fuentes: 0 base · 1 encabezado (blanco/negrita) · 2 título · 3 subtítulo · 4 meta
  `<fonts count="5">` +
  `<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="18"/><color rgb="${BRAND}"/><name val="Calibri"/></font>` +
  `<font><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/></font>` +
  `<font><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/></font>` +
  `</fonts>` +
  // Rellenos: 0 none · 1 gray125 (reservados) · 2 marca · 3 cebra
  `<fills count="4">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="${BRAND}"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF4F8FE"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  // Bordes: 0 none · 1 fino gris
  `<borders count="2">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border>` +
  `<left style="thin"><color rgb="FFE2E8F0"/></left>` +
  `<right style="thin"><color rgb="FFE2E8F0"/></right>` +
  `<top style="thin"><color rgb="FFE2E8F0"/></top>` +
  `<bottom style="thin"><color rgb="FFE2E8F0"/></bottom>` +
  `<diagonal/></border>` +
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  buildCellXfs() +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// Índices en cellXfs (deben coincidir con el orden de buildCellXfs()).
const S_TITLE = 1;
const S_SUBTITLE = 2;
const S_META = 3;
const S_HEADER = 4;
// Cuerpo: pares [normal, cebra] por tipo/alineación.
const S_TEXT_L = 5;
const S_TEXT_C = 7;
const S_TEXT_R = 9;
const S_DATE = 11;
const S_NUM = 13;
const S_MONEY = 15;

function bodyXf(numFmtId: number, fillId: number, horizontal: string): string {
  const applyNum = numFmtId ? ' applyNumberFormat="1"' : "";
  const applyFill = fillId ? ' applyFill="1"' : "";
  return (
    `<xf numFmtId="${numFmtId}" fontId="0" fillId="${fillId}" borderId="1" xfId="0"` +
    `${applyNum}${applyFill} applyBorder="1" applyAlignment="1">` +
    `<alignment horizontal="${horizontal}" vertical="center"/></xf>`
  );
}

function buildCellXfs(): string {
  const xfs = [
    // 0 — base
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    // 1 — título
    `<xf fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    // 2 — subtítulo
    `<xf fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    // 3 — meta
    `<xf fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    // 4 — encabezado
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`,
    // 5/6 — texto izq · normal/cebra
    bodyXf(0, 0, "left"),
    bodyXf(0, 3, "left"),
    // 7/8 — texto centro
    bodyXf(0, 0, "center"),
    bodyXf(0, 3, "center"),
    // 9/10 — texto der
    bodyXf(0, 0, "right"),
    bodyXf(0, 3, "right"),
    // 11/12 — fecha centro
    bodyXf(NF_DATE, 0, "center"),
    bodyXf(NF_DATE, 3, "center"),
    // 13/14 — número der
    bodyXf(NF_INT, 0, "right"),
    bodyXf(NF_INT, 3, "right"),
    // 15/16 — dinero der (2 decimales)
    bodyXf(NF_MONEY, 0, "right"),
    bodyXf(NF_MONEY, 3, "right"),
  ];
  return `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>`;
}

// Estilo del cuerpo según tipo/alineación de columna y paridad de fila (cebra).
function bodyStyleIndex(col: XlsxColumn, zebra: boolean): number {
  const z = zebra ? 1 : 0;
  if (col.type === "date") return S_DATE + z;
  if (col.type === "money") return S_MONEY + z;
  if (col.type === "number") return S_NUM + z;
  const align = col.align ?? "left";
  if (align === "center") return S_TEXT_C + z;
  if (align === "right") return S_TEXT_R + z;
  return S_TEXT_L + z;
}

function styledCell(ref: string, style: number, col: XlsxColumn, val: XlsxValue): string {
  if (val === null || val === undefined || val === "") return `<c r="${ref}" s="${style}"/>`;
  if (col.type === "date") {
    const serial = val instanceof Date ? excelSerial(val) : null;
    if (serial === null) {
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escXml(String(val))}</t></is></c>`;
    }
    return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
  }
  if (
    (col.type === "number" || col.type === "money") &&
    typeof val === "number" &&
    Number.isFinite(val)
  ) {
    return `<c r="${ref}" s="${style}"><v>${val}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escXml(String(val))}</t></is></c>`;
}

// Ancho por columna: usa el declarado o lo estima del contenido (acotado).
function autoWidth(col: XlsxColumn, values: XlsxValue[]): number {
  if (col.width) return col.width;
  let max = col.header.length;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const len = v instanceof Date ? 10 : String(v).length;
    if (len > max) max = len;
  }
  return Math.min(60, Math.max(9, max + 2));
}

/**
 * Construye un libro .xlsx de una hoja con estilos profesionales:
 * banda de título/subtítulo/meta, encabezado con color de marca, filas cebra,
 * bordes finos, panel congelado y auto-filtro. Devuelve los bytes (Buffer).
 */
export function buildStyledXlsx(opts: StyledXlsxOptions): Buffer {
  const { columns, rows } = opts;
  const nCols = columns.length;
  const lastColLetter = colLetter(Math.max(0, nCols - 1));
  const safeName = escXml(opts.sheetName).slice(0, 31) || "Hoja1";

  // Banda superior: título, subtítulo y cada línea de meta ocupan su propia fila.
  const banner: { text: string; s: number; ht: number }[] = [];
  if (opts.title) banner.push({ text: opts.title, s: S_TITLE, ht: 26 });
  if (opts.subtitle) banner.push({ text: opts.subtitle, s: S_SUBTITLE, ht: 18 });
  for (const m of opts.meta ?? []) banner.push({ text: m, s: S_META, ht: 14 });

  // Fila del encabezado (1-based). Deja una fila en blanco tras la banda.
  const hasBanner = banner.length > 0;
  const headerRow = banner.length + (hasBanner ? 1 : 0) + 1;
  const firstDataRow = headerRow + 1;
  const lastDataRow = headerRow + rows.length;

  const parts: string[] = [];

  // Filas de la banda (solo la celda ancla lleva valor; el merge cubre el resto).
  let r = 1;
  for (const b of banner) {
    parts.push(
      `<row r="${r}" ht="${b.ht}" customHeight="1">` +
        `<c r="A${r}" s="${b.s}" t="inlineStr"><is><t xml:space="preserve">${escXml(b.text)}</t></is></c>` +
        `</row>`,
    );
    r++;
  }
  if (hasBanner) parts.push(`<row r="${r}"/>`); // fila separadora

  // Encabezado.
  const headerCells = columns
    .map((c, i) => `<c r="${colLetter(i)}${headerRow}" s="${S_HEADER}" t="inlineStr"><is><t xml:space="preserve">${escXml(c.header)}</t></is></c>`)
    .join("");
  parts.push(`<row r="${headerRow}" ht="24" customHeight="1">${headerCells}</row>`);

  // Filas de datos (cebra en las impares).
  rows.forEach((row, ri) => {
    const zebra = ri % 2 === 1;
    const rowNum = firstDataRow + ri;
    const cells = columns
      .map((c, ci) => styledCell(`${colLetter(ci)}${rowNum}`, bodyStyleIndex(c, zebra), c, row[ci]))
      .join("");
    parts.push(`<row r="${rowNum}">${cells}</row>`);
  });

  const cols = columns
    .map((c, i) => {
      const w = autoWidth(c, rows.map((row) => row[i]));
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    })
    .join("");

  // Congela toda la banda + encabezado; auto-filtro sobre el encabezado.
  const pane =
    `<pane ySplit="${headerRow}" topLeftCell="A${firstDataRow}" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A${firstDataRow}" sqref="A${firstDataRow}"/>`;
  const autoFilter = nCols
    ? `<autoFilter ref="A${headerRow}:${lastColLetter}${Math.max(headerRow, lastDataRow)}"/>`
    : "";
  const merges = hasBanner
    ? `<mergeCells count="${banner.length}">` +
      banner.map((_b, i) => `<mergeCell ref="A${i + 1}:${lastColLetter}${i + 1}"/>`).join("") +
      `</mergeCells>`
    : "";

  const sheet =
    XML +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="16"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${parts.join("")}</sheetData>` +
    autoFilter +
    merges +
    `</worksheet>`;

  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
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
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";

  const enc = (s: string) => Buffer.from(s, "utf8");
  return zipStore([
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rels) },
    { name: "xl/workbook.xml", data: enc(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(workbookRels) },
    { name: "xl/styles.xml", data: enc(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheet) },
  ]);
}
