// Identidad institucional oficial, usada en los documentos que emite el sistema
// (constancias y comprobantes). Centralizada acá para tener un solo lugar de
// verdad: cambia aquí y se actualiza en todos los documentos.
export const ORG = {
  // Nombre visible / comercial de la feria. Aparece en TODOS los documentos que
  // emite el sistema (constancia, comprobante, proforma, renuncia, reportes) y en
  // la marca del sitio. Para la razón social registrada usar `nombreLegal`.
  nombre: "Feria Mayorista Internacional Milagros",
  // Nombre legal / razón social registrada (Partida N.° 11018461). Se usa donde se
  // exige la entidad jurídica, p. ej. el contrato de transferencia.
  nombreLegal: "Asociación Gran Feria Mayorista Internacional Madre de Dios",
  // Partida registral de la asociación.
  partida: "11018461",
  domicilio: "Av. Circunvalación con Av. Los Próceres",
  celular: "901538961",
  // Ciudad de expedición (lugar/fecha al pie de los documentos).
  ciudad: "Puerto Maldonado",
  // Lema oficial del año en curso. El Estado peruano lo cambia cada enero:
  // ACTUALIZAR aquí cuando cambie el año.
  lemaAnio: "AÑO DE LA ESPERANZA Y EL FORTALECIMIENTO DE LA DEMOCRACIA",
  // Lema regional (Madre de Dios), usado en la carta de renuncia.
  lemaRegion: "MADRE DE DIOS CAPITAL DE LA BIODIVERSIDAD DEL PERÚ",
  // Presidente en funciones (a quien se dirige la carta de renuncia).
  // ACTUALIZAR cuando cambie la junta directiva.
  presidente: "Santos Ccacsire Ccahuana",
} as const;
