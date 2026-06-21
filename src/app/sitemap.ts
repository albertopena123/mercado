import type { MetadataRoute } from "next";

const SITE_URL = "https://granferiamayorista.com";

/**
 * sitemap.xml — servido en /sitemap.xml. Solo la portada pública se indexa; el
 * resto del sitio requiere sesión y no debe figurar en el índice de Google.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
