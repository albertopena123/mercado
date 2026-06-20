import { prisma } from "@/lib/prisma";

/**
 * Cuenta las inasistencias INJUSTIFICADAS del socio a asambleas YA CONCLUIDAS
 * (Asamblea.estado === 'cerrada'). Solo suman las filas de Asistencia en estado
 * 'ausente'; 'justificado', 'presente' y 'tardanza' NO cuentan. Se ignoran las
 * asambleas 'programada'/'en_curso' porque la inasistencia aún no está
 * consolidada.
 *
 * Se usa para validar que el socio esté "al día en asambleas" antes de emitir la
 * Constancia de No Adeudo (Reglamento Interno de Administración, Disposición
 * CUARTA: el socio debe estar al día en cuotas, faenas y asambleas).
 *
 * NOTA: el sistema NO modela faenas/eventos por separado (solo asambleas), por lo
 * que ese requisito del reglamento queda cubierto PARCIALMENTE: aquí se validan
 * las asambleas, no las faenas. Si en el futuro se modela la asistencia a faenas,
 * debe sumarse en esta función.
 */
export async function contarInasistenciasInjustificadas(
  socioId: string,
): Promise<number> {
  return prisma.asistencia.count({
    where: { socioId, estado: "ausente", asamblea: { estado: "cerrada" } },
  });
}
