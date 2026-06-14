import { prisma } from "@/lib/prisma";
import { TIPO_ANUNCIO_LABEL } from "@/lib/anuncios/labels";

// Sección pública del landing: muestra los anuncios PUBLICADOS y PÚBLICOS
// vigentes. Server Component (lee de la BD en el servidor). Se revalida cuando
// se publica/edita un anuncio (revalidatePath("/") en las acciones).
export async function AnunciosSection() {
  const now = new Date();
  const anuncios = await prisma.anuncio.findMany({
    where: {
      estado: "publicado",
      visibilidad: "publico",
      OR: [{ validoHasta: null }, { validoHasta: { gt: now } }],
    },
    orderBy: [{ fijado: "desc" }, { publicadoEn: "desc" }],
    take: 6,
    select: {
      id: true,
      titulo: true,
      resumen: true,
      contenido: true,
      imagenUrl: true,
      tipo: true,
      publicadoEn: true,
    },
  });

  if (anuncios.length === 0) return null;

  return (
    <section className="lp-section lp-section--soft" id="novedades">
      <div className="lp__container">
        <div className="lp-section__head lp-reveal">
          <span className="lp-eyebrow">Novedades</span>
          <h2>Anuncios y comunicados</h2>
          <p>Entérate de las últimas noticias del Mercado Milagros.</p>
        </div>
        <div className="lp-anuncios lp-reveal">
          {anuncios.map((a) => (
            <article key={a.id} className="lp-anuncio">
              {a.imagenUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.imagenUrl} alt="" className="lp-anuncio__img" />
              )}
              <div className="lp-anuncio__body">
                <span className="lp-anuncio__tag">
                  {TIPO_ANUNCIO_LABEL[a.tipo]}
                </span>
                <h3>{a.titulo}</h3>
                <p>{a.resumen || `${a.contenido.slice(0, 140)}…`}</p>
                {a.publicadoEn && (
                  <time dateTime={a.publicadoEn.toISOString()}>
                    {a.publicadoEn.toLocaleDateString("es-PE", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
