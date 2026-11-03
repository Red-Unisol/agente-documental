export type Sector = "publico" | "privado";

export interface Ficha {
  negociacionId: string;
  nombre: string;
  dni: string;
  provincia: string;
  convenio: string;
  sectorDeclarado: Sector;
  empleadorDeclarado: string;
  // Tal como está en el CRM: "Jubilado Provincial", "Docente", "Policia", "Pensionado"... Le dice al
  // agente si habla con un activo o con un jubilado, y de qué tipo.
  situacionDeclarada?: string;
}

export interface Periodo {
  anio: number;
  mes: number;
}

export interface LecturaDeRecibo {
  esReciboDeSueldo: boolean;
  legible: boolean;
  empleador: string | undefined;
  cuil: string | undefined;
  periodo: Periodo | undefined;
  provincia: string | undefined;
  sector: Sector | "desconocido";
  faltantes: string[];
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
