// Cabecera del formulario público: banner oficial de la Feria Mayorista
// Internacional Milagros (incluye el nombre y la dirección). Da identidad y
// confianza a quien abre el enlace desde WhatsApp.
export function FormularioHeader() {
  return (
    <header className="fp-header">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="fp-logo"
        src="/logo-feria-milagros.png"
        alt="Feria Mayorista Internacional Milagros — Av. Circunvalación con Av. Los Próceres, Milagros, Puerto Maldonado, Madre de Dios"
        width={1583}
        height={308}
      />
    </header>
  );
}
