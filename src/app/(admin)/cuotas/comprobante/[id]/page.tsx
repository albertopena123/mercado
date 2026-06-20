import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { cargarComprobante } from "@/lib/comprobante/data";
import { ComprobanteView } from "@/components/comprobante/ComprobanteView";

export const metadata = { title: "Comprobante de pago · Admin" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("cuotas.read");
  const { id } = await params;
  const c = await cargarComprobante(id);
  if (!c) notFound();
  return (
    <ComprobanteView
      data={c.data}
      qrSvg={c.qrSvg}
      verifyUrl={c.verifyUrl}
      backHref="/cuotas"
      backLabel="Volver a cuotas"
    />
  );
}
