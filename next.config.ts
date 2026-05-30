import type { NextConfig } from "next";
import { MAX_UPLOAD_MB } from "./src/lib/socios/limits";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Las fotos y documentos de socios se suben pasando el File directamente a
      // un Server Action (AdjuntosPanel -> setFoto/uploadAdjunto), así que el
      // archivo viaja dentro del cuerpo del Server Action. El límite por defecto
      // de Next.js es 1 MB, por lo que rechazaba con "Body exceeded 1 MB limit"
      // archivos que la app sí permite (validateUpload acepta hasta MAX_UPLOAD_MB).
      // Lo derivamos de la misma fuente de verdad (limits.ts) + 1 MB de margen
      // para el overhead de serialización, para que ambos límites no se
      // desincronicen de nuevo. Acepta un número de bytes (tipo SizeLimit).
      bodySizeLimit: (MAX_UPLOAD_MB + 1) * 1024 * 1024,
    },
  },
};

export default nextConfig;
