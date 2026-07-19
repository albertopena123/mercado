-- El mercado no maneja saldo a favor: los pagos saldan cuotas completas, sin
-- excedente. Se elimina la columna y toda su lógica asociada.
ALTER TABLE "Socio" DROP COLUMN "saldoAFavor";
