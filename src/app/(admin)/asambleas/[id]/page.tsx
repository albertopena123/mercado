import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { getAsamblea } from "../actions";
import { AsambleaDetailClient } from "./AsambleaDetailClient";
import type { PermFlags } from "../types";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requirePermission("asambleas.read");
  const { id } = await params;
  const res = await getAsamblea(id);
  if (!res.ok) notFound();

  const perms: PermFlags = {
    canRead: me.permissions.has("asambleas.read"),
    canWrite: me.permissions.has("asambleas.write"),
    canDelete: me.permissions.has("asambleas.delete"),
    canAttendance: me.permissions.has("asambleas.attendance"),
  };

  return <AsambleaDetailClient initial={res.data!} perms={perms} />;
}
