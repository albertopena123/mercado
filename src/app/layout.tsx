import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://granferiamayorista.com"),
  title:
    "Feria Mayorista Internacional Milagros — Puerto Maldonado, Madre de Dios",
  description:
    "Feria Mayorista Internacional Milagros, el mercado mayorista y minorista más grande de Puerto Maldonado, Madre de Dios. Productos frescos, +120 comerciantes formales y precios de feria, todos los días de 6 a. m. a 6 p. m.",
  applicationName: "Feria Mayorista Internacional Milagros",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "Feria Mayorista Internacional Milagros",
    locale: "es_PE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* El root layout del App Router es el lugar correcto para la hoja de
            fuentes global; la regla apunta al patrón antiguo de pages/_document, y
            next/font no hospeda "Google Sans". */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Text:wght@400;500;600&family=Roboto:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
