export type Sector = "publico" | "privado";

export interface Ficha {
  negociacionId: string;
  nombre: string;
  dni: string;
  provincia: string;
  convenio: string;
  sectorDeclarado: Sector;
  // En el CRM casi nunca viene cargado; cuando falta, el empleador del recibo no se compara por nombre.
  empleadorDeclarado?: string;
  // Tal como está en el CRM: "Jubilado Provincial", "Docente", "Policia", "Pensionado"... Le dice al
  // agente si habla con un activo o con un jubilado, y de qué tipo.
  situacionDeclarada?: string;
}

export interface Periodo {
  anio: number;
  mes: number;
}

// Una liquidación de haberes tal como figura en el archivo. Sólo lo que se lee; lo que no está, undefined.
export interface Liquidacion {
  periodo: Periodo | undefined;
  empleador: string | undefined;
  cuil: string | undefined;
  // Número de documento impreso en la liquidación, para los recibos que no traen CUIL.
  dni: string | undefined;
  provincia: string | undefined;
  sector: Sector | "desconocido";
  // Si se ve el detalle de haberes y descuentos con sus importes: una foto cortada que sólo muestra el encabezado no sirve.
  conHaberes: boolean;
}

export type OtroDocumento = "dni" | "factura_de_servicio" | "constancia_bancaria" | "otro";

// Lo que se leyó de un archivo. Un archivo puede ser un recibo solo, varias liquidaciones juntas o un
// paquete (DNI, factura de un servicio, constancia de CBU y el recibo en el mismo PDF).
export interface LecturaDeDocumento {
  legible: boolean;
  liquidaciones: Liquidacion[];
  otrosDocumentos: OtroDocumento[];
}

export interface Exclusion {
  // A quién aplica: patrón sobre el convenio y/o sobre la provincia de la ficha (sin acentos, sin
  // distinguir mayúsculas). Si los dos son null, aplica a todos. En Bitrix el convenio llega como la
  // etiqueta del campo ("Amejuca", "Fiat", "Celesol"), así que conviene atarse a la provincia.
  convenio: string | null;
  provincia?: string | null;
  // Patrón sobre el empleador que figura en el recibo.
  patron: string;
  motivo: string;
}

export interface Reglas {
  diaDeGracia: number;
  exclusiones: Exclusion[];
}

export type Resultado<T, E = string> = { ok: true; valor: T } | { ok: false; motivo: E };

export function exito<T>(valor: T): Resultado<T, never> {
  return { ok: true, valor };
}

export function falla<E>(motivo: E): Resultado<never, E> {
  return { ok: false, motivo };
}
