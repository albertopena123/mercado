# Limpia la hoja "PADRON ACTUALIZADO 2026" del Excel PADRON ACTUALIZADO AL 2026.xlsx
# a prisma/_deudas2026.json para el conciliador import-deudas2026.ts.
#
# IMPORTANTE: solo se leen las columnas 10-33 y 39-41. Las columnas 34-38 son un
# bloque ESPEJO de los autovalúos/alcabala que quedó DESACTUALIZADO en la última
# edición (las filas corregidas cambiaron el bloque principal pero no el espejo);
# leerlo reintroduciría deudas ya pagadas.
#
#   python prisma/import-deudas2026-clean.py
import json
import os
import warnings

import openpyxl

warnings.filterwarnings("ignore")

SRC = r"C:\Users\anonimo\Documents\2026\mercado milagros\2026 ARCHIVOS\PADRON\PADRON EN EXCEL\PADRON ACTUALIZADO AL 2026.xlsx"
SHEET = "PADRON ACTUALIZADO 2026"  # hoja vigente (editada 2026-07-23); la otra es copia vieja
OUT = os.path.join(os.path.dirname(__file__), "_deudas2026.json")

wb = openpyxl.load_workbook(SRC, data_only=True, read_only=True)
ws = wb[SHEET]

rows = list(ws.iter_rows(values_only=True))
headers = rows[2]  # fila 3 = cabeceras

# Columnas de interés (1-based): datos del socio + conceptos SIN el bloque espejo.
COLS_CONCEPTO = list(range(10, 34)) + [39, 40, 41, 42]

out = []
for i, row in enumerate(rows[3:], start=4):
    # etapa(2) bloque(3) puesto(5) nombre(6) dni(7)
    etapa_raw = str(row[1] or "").strip()
    nombre = str(row[5] or "").strip()
    dni = str(row[6] or "").strip()
    if not nombre and not dni:
        continue  # fila vacía o pie de tabla
    celdas = {}
    for c in COLS_CONCEPTO:
        h = str(headers[c - 1] or "").strip()
        v = row[c - 1]
        if not h:
            continue
        celdas[f"{c}|{h}"] = "" if v is None else str(v).strip()
    out.append({
        "filaExcel": i,
        "etapa": etapa_raw,
        "bloque": str(row[2] or "").strip(),
        "puesto": str(row[4] or "").strip(),
        "nombre": nombre,
        "dni": dni,
        "celdas": celdas,
    })

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(f"{len(out)} filas -> {OUT}")
