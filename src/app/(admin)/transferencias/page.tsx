import { requirePermission } from "@/lib/auth/server";
import { listTransferencias, transferenciasStats } from "./actions";
import { TransferenciasClient } from "./TransferenciasClient";
import type { EstadoTransferencia } from "@/generated/prisma/client";

export const metadata = { title: "Transferencias · Admin" };
export const dynamic = "force-dynamic";

const ESTADOS: EstadoTransferencia[] = ["borrador", "completada", "anulada"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    estado?: string;
    page?: string;
    size?: string;
  }>;
}) {
  const me = await requirePermission("transferencias.read");
  const sp = await searchParams;
  const estado = ESTADOS.includes(sp.estado as EstadoTransferencia)
    ? (sp.estado as EstadoTransferencia)
    : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const size = Number(sp.size) || 25;

  const [res, statsRes] = await Promise.all([
    listTransferencias({
      q: sp.q?.trim() || undefined,
      estado,
      page,
      pageSize: size,
    }),
    transferenciasStats(),
  ]);
  const data = res.ok
    ? res.data!
    : { items: [], total: 0, page: 1, pageSize: 25 };
  const stats = statsRes.ok
    ? statsRes.data!
    : { total: 0, borrador: 0, completada: 0, anulada: 0 };

  return (
    <TransferenciasClient
      initial={data}
      stats={stats}
      perms={{
        canRead: true,
        canWrite: me.permissions.has("transferencias.write"),
      }}
      filters={{ q: sp.q ?? "", estado }}
    />
  );
}
