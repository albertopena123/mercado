# -*- coding: utf-8 -*-
import sys, io, re, json
from collections import defaultdict
from datetime import datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import openpyxl

# Limpia la matriz de guardianía del Excel de seguridad a un JSON {pagos,cuentas}
# que consume prisma/import-guardiania.ts.
#   python prisma/import-guardiania-clean.py "<ruta al .xlsx>" guardiania-clean.json
# Deriva `periodo` (mes cubierto) por POSICIÓN de columna, corrige las fechas basura
# (años fuera de 2023-2026 → primer día del mes cubierto) y las etiquetas de mes mal
# ubicadas en la fuente.
XLSX = sys.argv[1] if len(sys.argv) > 1 else r"c:\Users\anonimo\Documents\2026\mercado milagros\2026 ARCHIVOS\SEGURIDAD\SEGURIDAD 2023-2025.xlsx"
OUT  = sys.argv[2] if len(sys.argv) > 2 else "guardiania-clean.json"

wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
ws = wb["GUARDIANIA"]
rows = list(ws.iter_rows(values_only=True)); wb.close()
hdr = rows[1]
def find(h,l):
    for i,c in enumerate(h):
        if c and str(c).strip().upper()==l: return i
    return None
iTC = find(hdr,"TOTAL CANCELADO")
iDP = find(hdr,"DEUDA PENDIENTE DE CANCELACION")
FIXED=12
NBLOCKS=(iTC-FIXED)//4
print(f"bloques={NBLOCKS} (col {FIXED}..{iTC-1})  TC={iTC} DP={iDP}")

def num(x):
    if x is None: return None
    if isinstance(x,(int,float)): return float(x)
    s=str(x).strip().replace("S/","").replace(",","")
    return float(s) if re.fullmatch(r"-?\d+(\.\d+)?", s) else None

def intornone(x):
    if x is None: return None
    s=re.sub(r"\D","",str(x))
    return int(s) if s else None

MES={"ENERO":1,"FEBRERO":2,"MARZO":3,"ABRIL":4,"MAYO":5,"JUNIO":6,"JULIO":7,
     "AGOSTO":8,"SETIEMBRE":9,"SEPTIEMBRE":9,"OCTUBRE":10,"NOVIEMBRE":11,"DICIEMBRE":12}

def periodo_from_block(k):
    year=2023 + k//12
    month=(k%12)+1
    return (year, month)

def resolve_periodo(k, mes_label):
    """periodo por posicion; si la etiqueta es un mes limpio que discrepa, usa el
    mes de la etiqueta con el AÑO mas cercano (corrige ubicaciones erroneas en la
    fuente sin romper el limite dic/ene)."""
    py, pm = periodo_from_block(k)
    lbl = str(mes_label).strip().upper() if mes_label else ""
    if lbl in MES and MES[lbl] != pm:
        lm = MES[lbl]
        pos_idx = py*12 + pm
        best=None
        for y in (py-1, py, py+1):
            idx=y*12+lm
            d=abs(idx-pos_idx)
            if best is None or d<best[0]: best=(d,y)
        return f"{best[1]}-{lm:02d}"
    return f"{py}-{pm:02d}"

def clean_fecha(x, periodo):
    """Devuelve (iso, corregida_bool)."""
    d=None
    if isinstance(x, datetime): d=x
    else:
        s=str(x).strip() if x is not None else ""
        m=re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
        if m:
            try: d=datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)))
            except: d=None
    if d and 2023<=d.year<=2026:
        return (d.strftime("%Y-%m-%d"), False)
    # fecha basura/ausente -> primer dia del periodo cubierto
    return (f"{periodo}-01", True)

pagos=[]
cuentas=[]
# validacion posicion vs etiqueta
val_ok=val_bad=val_na=0
mismatch_samples=[]

for r in rows[2:]:
    if not r or len(r)<FIXED: continue
    nombre = (str(r[6]).strip() if r[6] else "")
    if not nombre: continue
    etapa_raw=str(r[1]).strip() if r[1] else ""
    etapa = 1 if "1" in etapa_raw else (2 if "2" in etapa_raw else None)
    bloque=str(r[2]).strip() if r[2] else None
    parcela=str(r[3]).strip() if r[3] else None
    numeroPuesto=intornone(r[4])
    padron=intornone(r[7])
    celular=str(r[8]).strip() if r[8] else None
    tipo = "3x5" if (parcela and "3*5" in parcela) else ("3x3" if (parcela and "3*3" in parcela) else None)
    tarifa = 45.0 if tipo=="3x5" else (30.0 if tipo=="3x3" else None)

    row_periodos=set()
    for k in range(NBLOCKS):
        c=FIXED+4*k
        fecha_raw=r[c] if c<len(r) else None
        recibo=r[c+1] if c+1<len(r) else None
        mes=r[c+2] if c+2<len(r) else None
        imp=num(r[c+3] if c+3<len(r) else None)
        if not imp or imp<=0: continue
        periodo=resolve_periodo(k, mes)
        # validacion mes-etiqueta (solo etiquetas de un mes)
        lbl=str(mes).strip().upper() if mes else ""
        if lbl in MES:
            if MES[lbl]==(k%12)+1: val_ok+=1
            else:
                val_bad+=1
                if len(mismatch_samples)<8:
                    mismatch_samples.append((f"{2023+k//12}-{(k%12)+1:02d}",lbl,"->",periodo,nombre))
        else:
            val_na+=1
        iso,corr=clean_fecha(fecha_raw, periodo)
        row_periodos.add(periodo)
        pagos.append({
            "fecha":iso,"fechaCorregida":corr,
            "nroRecibo":(str(recibo).strip() if recibo not in (None,"") else None),
            "periodo":periodo,"mesEtiqueta":(str(mes).strip() if mes else None),
            "importe":round(imp,2),
            "etapa":etapa,"bloque":bloque,"numeroPuesto":numeroPuesto,"parcela":parcela,
            "socioNombre":nombre,"numeroPadron":padron,
        })
    # cuenta por puesto (fila)
    cuentas.append({
        "etapa":etapa,"bloque":bloque,"numeroPuesto":numeroPuesto,"parcela":parcela,
        "socioNombre":nombre,"numeroPadron":padron,"celular":celular,
        "tarifaMensual":tarifa,
        "inicioPeriodo": (min(row_periodos) if row_periodos else None),
        "totalCancelado":num(r[iTC]) if iTC<len(r) else None,
        "deudaBaseline":num(r[iDP]) if iDP<len(r) else None,
    })

print(f"\nVALIDACION periodo-por-posicion vs etiqueta-de-mes:")
print(f"  coincide: {val_ok}   NO coincide: {val_bad}   sin etiqueta util(rangos): {val_na}")
for m in mismatch_samples: print(f"    {m}")

corr_n=sum(1 for p in pagos if p['fechaCorregida'])
print(f"\npagos: {len(pagos)}  (fechas corregidas: {corr_n})")
print(f"cuentas(filas puesto): {len(cuentas)}")
tot=sum(p['importe'] for p in pagos)
print(f"importe total: S/ {tot:,.2f}")

json.dump({"pagos":pagos,"cuentas":cuentas,
           "meta":{"totalImporte":round(tot,2),"nPagos":len(pagos),"nCuentas":len(cuentas)}},
          open(OUT,"w",encoding="utf-8"), ensure_ascii=False)
print(f"\n-> {OUT}")
