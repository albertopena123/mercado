import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { getTransferencia } from "../actions";
import { TransferenciaDetailClient } from "./TransferenciaDetailClient";

export const metadata = { title: "Transferencia · Admin" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requirePermission("transferencias.read");
  const { id } = await params;
  const res = await getTransferencia(id);
  if (!res.ok) notFound();
  return (
    <TransferenciaDetailClient
      initial={res.data!}
      canWrite={me.permissions.has("transferencias.write")}
    />
  );
}
