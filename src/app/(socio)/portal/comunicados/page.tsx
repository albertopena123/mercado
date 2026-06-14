import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisComunicados } from "@/lib/portal/data";
import { TIPO_ANUNCIO_LABEL } from "@/lib/anuncios/labels";
import { Icon } from "@/components/admin/Icon";

export const metadata = { title: "Comunicados · Mercado Milagros" };
export const dynamic = "force-dynamic";

export default async function ComunicadosPage() {
  await requireSocio();
  const items = await getMisComunicados();

  return (
    <>
      <Link href="/portal" className="pt-back">
        <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Comunicados</h1>
        <p>Anuncios y comunicados del Mercado Milagros.</p>
      </div>

      {items.length === 0 ? (
        <div className="pt-panel">
          <p className="pt-empty">No hay comunicados por ahora.</p>
        </div>
      ) : (
        items.map((a) => (
          <article key={a.id} className="pt-panel">
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <span className="pt-badge pt-badge--justificado">
                {TIPO_ANUNCIO_LABEL[a.tipo]}
              </span>
              {a.publicadoEn && (
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  {new Date(a.publicadoEn).toLocaleDateString("es-PE", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
            <h2 style={{ marginBottom: 8 }}>{a.titulo}</h2>
            {a.imagenUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.imagenUrl}
                alt=""
                style={{
                  width: "100%",
                  maxHeight: 280,
                  objectFit: "cover",
                  borderRadius: 12,
                  marginBottom: 10,
                }}
              />
            )}
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14.5 }}>
              {a.contenido}
            </p>
          </article>
        ))
      )}
    </>
  );
}
