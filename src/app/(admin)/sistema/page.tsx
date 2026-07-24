import { requirePermission } from "@/lib/auth/server";
import { leerEstadoServidor } from "@/lib/sistema/metrics";
import { SistemaClient } from "./SistemaClient";

export const metadata = { title: "Servidor · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("sistema.read");
  // Estado inicial renderizado en servidor (sin parpadeo); luego el cliente
  // sondea cada 5 s vía getEstadoServidor.
  const inicial = await leerEstadoServidor();
  return <SistemaClient inicial={inicial} />;
}
