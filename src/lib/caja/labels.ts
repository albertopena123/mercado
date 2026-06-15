import type {
  TipoMovimiento,
  CategoriaMovimiento,
  TipoComprobante,
} from "@/generated/prisma/client";

export const TIPO_LABEL: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
};

export const CATEGORIA_LABEL: Record<CategoriaMovimiento, string> = {
  cuota: "Cuotas de socios",
  inscripcion: "Inscripción de socio",
  bano: "Servicios higiénicos",
  multa: "Multas",
  alquiler: "Alquileres",
  otro_ingreso: "Otro ingreso",
  personal: "Pago a personal",
  compra: "Compras / insumos",
  servicio: "Servicios contratados",
  mantenimiento: "Mantenimiento",
  evento: "Eventos",
  servicios_basicos: "Servicios básicos (luz/agua)",
  otro_egreso: "Otro egreso",
};

export const CATEGORIAS_INGRESO: CategoriaMovimiento[] = [
  "cuota",
  "inscripcion",
  "bano",
  "multa",
  "alquiler",
  "otro_ingreso",
];
export const CATEGORIAS_EGRESO: CategoriaMovimiento[] = [
  "personal",
  "compra",
  "servicio",
  "mantenimiento",
  "evento",
  "servicios_basicos",
  "otro_egreso",
];

export function categoriasPorTipo(tipo: TipoMovimiento): CategoriaMovimiento[] {
  return tipo === "ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO;
}

export function tipoDeCategoria(c: CategoriaMovimiento): TipoMovimiento {
  return (CATEGORIAS_INGRESO as string[]).includes(c) ? "ingreso" : "egreso";
}

export const COMPROBANTE_LABEL: Record<TipoComprobante, string> = {
  ninguno: "Sin comprobante",
  boleta: "Boleta",
  factura: "Factura",
  recibo: "Recibo",
};
export const TIPOS_COMPROBANTE: TipoComprobante[] = [
  "ninguno",
  "boleta",
  "factura",
  "recibo",
];

export const METODOS_PAGO = [
  "efectivo",
  "transferencia",
  "yape/plin",
  "otro",
] as const;
