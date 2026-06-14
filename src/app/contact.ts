/* ===========================================================================
   Datos de contacto y ubicación del Mercado Milagros.
   Un único lugar para el número de WhatsApp, las coordenadas y los enlaces de
   Google Maps, consumido tanto por la landing (server) como por el widget
   flotante (client).
   =========================================================================== */

/* ⚠️  REEMPLAZA este número por el real del mercado.
   Formato internacional, solo dígitos: código de país + número, SIN "+",
   espacios ni guiones.  Perú = 51.  Ej.: "51982123456".               */
export const WHATSAPP_NUMBER = "51982000000"; // ← placeholder editable

/** Mensaje pre-cargado al abrir el chat de WhatsApp. */
export const WHATSAPP_MESSAGE =
  "¡Hola! Vi la página del Mercado Milagros y me gustaría más información.";

/* Coordenadas exactas del mercado (tomadas de Google Maps). */
export const MAP_LAT = -12.5958574;
export const MAP_LNG = -69.2017827;

/** Texto de ubicación mostrado al usuario. */
export const ADDRESS = "Mercado Milagros · Puerto Maldonado, Madre de Dios";

/** Chat directo de WhatsApp con el mensaje pre-cargado. */
export const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  WHATSAPP_MESSAGE,
)}`;

/** «Cómo llegar»: abre Google Maps y traza la ruta desde la ubicación
 *  actual del usuario hasta el mercado. */
export const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${MAP_LAT},${MAP_LNG}`;

/** Ver el lugar (sin ruta) en Google Maps. */
export const mapsPlaceUrl = `https://www.google.com/maps/search/?api=1&query=${MAP_LAT},${MAP_LNG}`;

/** Mapa embebido (iframe) — no requiere API key. */
export const mapEmbedUrl = `https://www.google.com/maps?q=${MAP_LAT},${MAP_LNG}&z=16&hl=es&output=embed`;
