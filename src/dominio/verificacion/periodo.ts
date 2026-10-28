import type { Periodo } from "../tipos.js";

export function periodoAnterior(periodo: Periodo, meses = 1): Periodo {
  const indice = periodo.anio * 12 + (periodo.mes - 1) - meses;
  return { anio: Math.floor(indice / 12), mes: (indice % 12) + 1 };
}

export function periodoDe(fecha: Date): Periodo {
  return { anio: fecha.getFullYear(), mes: fecha.getMonth() + 1 };
}

export function mismoPeriodo(a: Periodo, b: Periodo): boolean {
  return a.anio === b.anio && a.mes === b.mes;
}

export function periodosAdmitidos(hoy: Date, diaDeGracia: number): Periodo[] {
  const actual = periodoDe(hoy);
  const admitidos = [periodoAnterior(actual, 1)];
  if (hoy.getDate() <= diaDeGracia) admitidos.push(periodoAnterior(actual, 2));
  return admitidos;
}

export function periodoEsAdmitido(periodo: Periodo, hoy: Date, diaDeGracia: number): boolean {
  return periodosAdmitidos(hoy, diaDeGracia).some((admitido) => mismoPeriodo(admitido, periodo));
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function nombreDePeriodo(periodo: Periodo): string {
  return `${MESES[periodo.mes - 1]} ${periodo.anio}`;
}
