import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { HistoricoClient } from "./HistoricoClient";

export const metadata = { title: "Padrón histórico · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("socios.read");
  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Padrón histórico</h1>
          <span className="socios-page__sub">
            Empadronamientos 2014, 2017, 2019 y 2021. Busca por nombre, N.° de padrón,
            DNI o código de puesto.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/socios" className="btn btn--ghost">
            Volver al padrón
          </Link>
        </div>
      </header>

      <HistoricoClient />
    </div>
  );
}
