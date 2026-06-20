import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { OrganosClient } from "./OrganosClient";
import type { DirectivoRow } from "./types";

export const metadata = { title: "Junta directiva · Admin" };
export const dynamic = "force-dynamic";

function nombre(s: {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
}): string {
  return `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
    /\s+,/,
    ",",
  );
}

const SOCIO_SELECT = {
  id: true,
  codigo: true,
  apellidoPaterno: true,
  apellidoMaterno: true,
  nombres: true,
} as const;

function toRow(d: {
  id: string;
  socioId: string;
  organo: DirectivoRow["organo"];
  cargo: DirectivoRow["cargo"];
  bloque: string | null;
  periodo: string | null;
  desde: Date;
  hasta: Date | null;
  observaciones: string | null;
  socio: {
    codigo: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    nombres: string;
  };
}): DirectivoRow {
  return {
    id: d.id,
    socioId: d.socioId,
    socioNombre: nombre(d.socio),
    socioCodigo: d.socio.codigo,
    organo: d.organo,
    cargo: d.cargo,
    bloque: d.bloque,
    periodo: d.periodo,
    desde: d.desde.toISOString(),
    hasta: d.hasta ? d.hasta.toISOString() : null,
    observaciones: d.observaciones,
  };
}

export default async function Page() {
  const me = await requirePermission("organos.read");

  const [vigentes, historial] = await Promise.all([
    prisma.directivo.findMany({
      where: { hasta: null },
      orderBy: [{ organo: "asc" }, { cargo: "asc" }, { bloque: "asc" }],
      include: { socio: { select: SOCIO_SELECT } },
    }),
    prisma.directivo.findMany({
      where: { hasta: { not: null } },
      orderBy: { hasta: "desc" },
      take: 50,
      include: { socio: { select: SOCIO_SELECT } },
    }),
  ]);

  return (
    <OrganosClient
      vigentes={vigentes.map(toRow)}
      historial={historial.map(toRow)}
      perms={{
        canRead: true,
        canWrite: me.permissions.has("organos.write"),
      }}
    />
  );
}
