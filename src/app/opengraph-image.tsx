import { ImageResponse } from "next/og";

// Tarjeta de presentación que ven WhatsApp, Facebook y Google al compartir el
// enlace. Tamaño estándar Open Graph.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Feria Mayorista Internacional Milagros — Puerto Maldonado, Madre de Dios";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          color: "#ffffff",
          backgroundImage: "linear-gradient(135deg, #0a1f5c 0%, #0b63d6 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              borderRadius: 20,
              background: "#ffffff",
              color: "#0b63d6",
              fontSize: 38,
              fontWeight: 700,
            }}
          >
            FM
          </div>
          <div
            style={{
              fontSize: 26,
              letterSpacing: 2,
              fontWeight: 600,
              textTransform: "uppercase",
              opacity: 0.92,
            }}
          >
            Madre de Dios · Perú
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.05 }}>
            Feria Mayorista Internacional Milagros
          </div>
          <div style={{ fontSize: 38, fontWeight: 500, opacity: 0.95 }}>
            El mercado mayorista y minorista de Puerto Maldonado, Madre de Dios
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            fontWeight: 500,
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: "#ffc83d",
              color: "#0a1f5c",
              fontWeight: 700,
            }}
          >
            Abierto todos los días
          </div>
          <div style={{ display: "flex", opacity: 0.92 }}>6 a. m. – 6 p. m.</div>
        </div>
      </div>
    ),
    size,
  );
}
