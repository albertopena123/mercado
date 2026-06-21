import { notFound } from "next/navigation";
import { requireSocio } from "@/lib/portal/socio";
import { cargarComprobante } from "@/lib/comprobante/data";
import { ComprobanteView } from "@/components/comprobante/ComprobanteView";

export const metadata = { title: "Comprobante de pago · Gran Feria Mayorista Internacional" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { socio } = await requireSocio();
  const { id } = await params;
  // socioId obliga a que el comprobante sea del socio logueado.
  const c = await cargarComprobante(id, { socioId: socio.id });
  if (!c) notFound();
  return (
    <ComprobanteView
      data={c.data}
      qrSvg={c.qrSvg}
      verifyUrl={c.verifyUrl}
      backHref="/portal/comprobantes"
      backLabel="Mis comprobantes"
    />
  );
}
