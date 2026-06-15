-- CreateEnum
CREATE TYPE "EstadoEmpleado" AS ENUM ('activo', 'suspendido', 'inactivo');

-- CreateEnum
CREATE TYPE "CargoEmpleado" AS ENUM ('seguridad', 'secretaria', 'limpieza', 'bano', 'administracion', 'mantenimiento', 'cobranza', 'otro');

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "apellidoPaterno" TEXT NOT NULL,
    "apellidoMaterno" TEXT,
    "nombres" TEXT NOT NULL,
    "cargo" "CargoEmpleado" NOT NULL DEFAULT 'otro',
    "cargoDetalle" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "fechaCese" TIMESTAMP(3),
    "estado" "EstadoEmpleado" NOT NULL DEFAULT 'activo',
    "salario" DECIMAL(10,2),
    "observaciones" TEXT,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "fotoUrl" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpleadoAdjunto" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmpleadoAdjunto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_codigo_key" ON "Empleado"("codigo");

-- CreateIndex
CREATE INDEX "Empleado_estado_idx" ON "Empleado"("estado");

-- CreateIndex
CREATE INDEX "Empleado_cargo_idx" ON "Empleado"("cargo");

-- CreateIndex
CREATE INDEX "Empleado_apellidoPaterno_apellidoMaterno_nombres_idx" ON "Empleado"("apellidoPaterno", "apellidoMaterno", "nombres");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_tipoDocumento_numeroDocumento_key" ON "Empleado"("tipoDocumento", "numeroDocumento");

-- CreateIndex
CREATE INDEX "EmpleadoAdjunto_empleadoId_idx" ON "EmpleadoAdjunto"("empleadoId");

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpleadoAdjunto" ADD CONSTRAINT "EmpleadoAdjunto_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpleadoAdjunto" ADD CONSTRAINT "EmpleadoAdjunto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
