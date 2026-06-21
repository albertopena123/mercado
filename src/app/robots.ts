import type { MetadataRoute } from "next";

const SITE_URL = "https://granferiamayorista.com";

/**
 * robots.txt — servido en /robots.txt. La landing es pública e indexable; las
 * secciones tras sesión (panel, portal del socio y la API) se excluyen del
 * rastreo. /verificar es público (verificación de constancias por QR).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/login",
        "/usuarios",
        "/socios",
        "/puestos",
        "/roles",
        "/personal",
        "/inventario",
        "/organos",
        "/comprobantes",
        "/transferencias",
        "/portal/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
