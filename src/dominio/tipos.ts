export type Sector = "publico" | "privado";

export interface Ficha {
  negociacionId: string;
  nombre: string;
  dni: string;
  provincia: string;
  convenio: string;
  sectorDeclarado: Sector;
  empleadorDeclarado: string;
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
  convenio: string | null;
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
