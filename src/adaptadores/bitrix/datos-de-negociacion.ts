import type { DatoDeNegociacion, EstadoDeNegociacion } from "../../dominio/tipos.js";
import type { MapeoDeBitrix } from "./mapeo.js";

export interface DefinicionDeCampo {
  type: string;
  isMultiple?: boolean;
  items?: { ID: string; VALUE: string }[];
}

export type DefinicionesDeCampos = Record<string, DefinicionDeCampo>;

export interface EtapaDelEmbudo {
  STATUS_ID: string;
  NAME: string;
  // Posición en el embudo: las etapas se recorren de menor a mayor.
  SORT?: string | number;
  // "F" en las etapas de cierre sin éxito (SIN CUPO, SIT. NEG. EN BCRA, LISTA NEGRA...), "S" en la de éxito.
  SEMANTICS?: string | null;
}

export const ETAPA_CERRADA = "cerrada sin avanzar (el motivo lo informa una persona)";

// El nombre de una etapa de cierre dice por qué se cerró (mora, BCRA, lista negra). Eso no lo comunica
// el agente: al modelo le llega sólo que la solicitud está cerrada, y deriva a una persona.
export function nombresParaElSocio(etapas: EtapaDelEmbudo[]): Map<string, string> {
  return new Map(etapas.map((etapa) => [etapa.STATUS_ID, etapa.SEMANTICS === "F" ? ETAPA_CERRADA : etapa.NAME]));
}

// Las etapas del embudo que vienen antes del paso de documentación (presentación, respuesta, la
// calificación automática). Ahí el socio todavía no mandó el recibo, así que el agente lo pide. Lo que
// viene después de la documentación, las etapas de cierre y una etapa que el embudo no conoce quedan
// afuera: ahí no lo pide.
export function etapasAnterioresALaDocumentacion(etapas: EtapaDelEmbudo[], deDocumentacion: MapeoDeBitrix["etapas"]): Set<string> {
  const propias = new Set(Object.values(deDocumentacion));
  const orden = (etapa: EtapaDelEmbudo) => Number(etapa.SORT) || 0;
  const deLaDocumentacion = etapas.filter((etapa) => propias.has(etapa.STATUS_ID));
  if (!deLaDocumentacion.length) return new Set();
  const primera = Math.min(...deLaDocumentacion.map(orden));
  return new Set(etapas.filter((etapa) => !propias.has(etapa.STATUS_ID) && !etapa.SEMANTICS && orden(etapa) < primera).map((etapa) => etapa.STATUS_ID));
}

const LARGO_MAXIMO = 400;
const FECHA = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Cordoba" });
const PESOS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// Lo que el agente puede contarle al socio de su propia negociación: la etapa, si el recibo ya está
// cargado, el monto y los campos elegidos en el mapeo (`datosParaElSocio`). Un campo vacío no aparece:
// el agente sólo habla de lo que está cargado.
export function estadoDeNegociacion(
  negociacion: Record<string, unknown>,
  definiciones: DefinicionesDeCampos,
  etapasDelEmbudo: EtapaDelEmbudo[],
  mapeo: Pick<MapeoDeBitrix, "campos" | "datosParaElSocio" | "etapas">,
): EstadoDeNegociacion {
  const nombresDeEtapas = nombresParaElSocio(etapasDelEmbudo);
  const etapa = texto(negociacion.STAGE_ID);
  const monto = Number(negociacion.OPPORTUNITY);
  const reciboCargado = tieneValor(negociacion[mapeo.campos.recibo]);
  // El recibo se pide mientras la negociación no pasó la documentación: en una etapa anterior o
  // esperándola. Más adelante (oferta, validación, acreditación) o cerrada, el socio puede escribir
  // igual y el agente no tiene que reclamárselo.
  const esperaDocumentacion =
    !etapa || etapa === mapeo.etapas.DOCUMENTACION || etapa === mapeo.etapas.FALTA_DOCUMENTACION || etapasAnterioresALaDocumentacion(etapasDelEmbudo, mapeo.etapas).has(etapa);
  const fijos: DatoDeNegociacion[] = [
    ...(etapa ? [{ etiqueta: "Etapa de la solicitud", valor: nombresDeEtapas.get(etapa) ?? etapa }] : []),
    { etiqueta: "Recibo cargado en la negociación", valor: reciboCargado ? "sí" : "no" },
    ...(monto > 0 ? [{ etiqueta: "Monto cargado en la negociación", valor: `$ ${PESOS.format(monto)}` }] : []),
    ...(negociacion.DATE_CREATE ? [{ etiqueta: "Fecha de inicio de la solicitud", valor: fecha(negociacion.DATE_CREATE) }] : []),
  ];
  const elegidos = mapeo.datosParaElSocio.flatMap(({ etiqueta, campo }) => {
    const valor = valorLegible(negociacion[campo], definiciones[campo]);
    return valor ? [{ etiqueta, valor }] : [];
  });
  return { hayQuePedirElRecibo: esperaDocumentacion && !reciboCargado, datos: sinRepetirEtiqueta([...fijos, ...elegidos]) };
}

// Dos campos del portal pueden guardar lo mismo (hay un "Banco de Cobro" de texto y otro de lista): vale el primero que tenga algo.
function sinRepetirEtiqueta(datos: DatoDeNegociacion[]): DatoDeNegociacion[] {
  const vistas = new Set<string>();
  return datos.filter((dato) => !vistas.has(dato.etiqueta) && vistas.add(dato.etiqueta));
}

export function valorLegible(valor: unknown, definicion: DefinicionDeCampo | undefined): string {
  if (Array.isArray(valor)) {
    return valor
      .map((uno) => valorLegible(uno, definicion))
      .filter(Boolean)
      .join(", ");
  }
  const crudo = texto(valor);
  if (!crudo) return "";
  switch (definicion?.type) {
    case "enumeration":
      return definicion.items?.find((item) => item.ID === crudo)?.VALUE ?? "";
    case "boolean":
      return crudo === "1" || crudo === "true" || crudo === "Y" ? "sí" : "no";
    case "money": {
      const [importe] = crudo.split("|");
      return Number(importe) > 0 ? `$ ${PESOS.format(Number(importe))}` : "";
    }
    case "date":
    case "datetime":
      return fecha(crudo);
    case "file":
      return "";
    default:
      return crudo.length > LARGO_MAXIMO ? `${crudo.slice(0, LARGO_MAXIMO)}…` : crudo;
  }
}

function fecha(valor: unknown): string {
  const instante = new Date(String(valor));
  return Number.isNaN(instante.getTime()) ? "" : FECHA.format(instante);
}

function tieneValor(valor: unknown): boolean {
  return Array.isArray(valor) ? valor.length > 0 : Boolean(valor);
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined || typeof valor === "object" ? "" : String(valor).trim();
}
