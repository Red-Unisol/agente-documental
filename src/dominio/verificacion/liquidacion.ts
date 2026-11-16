import type { LecturaDeDocumento, Liquidacion, Periodo } from "../tipos.js";
import { periodoEsAdmitido } from "./periodo.js";

// De todas las liquidaciones del archivo, la que se verifica: la del período que se pide si está;
// si no, la más reciente (así el motivo le dice al socio de qué mes es lo último que mandó).
export function liquidacionAVerificar(lectura: LecturaDeDocumento, hoy: Date, diaDeGracia: number): Liquidacion | undefined {
  const conPeriodo = lectura.liquidaciones.filter((liquidacion) => liquidacion.periodo);
  const admitida = conPeriodo.find((liquidacion) => periodoEsAdmitido(liquidacion.periodo as Periodo, hoy, diaDeGracia));
  if (admitida) return admitida;
  const masReciente = [...conPeriodo].sort((a, b) => indiceDe(b.periodo as Periodo) - indiceDe(a.periodo as Periodo))[0];
  return masReciente ?? lectura.liquidaciones[0];
}

function indiceDe(periodo: Periodo): number {
  return periodo.anio * 12 + periodo.mes;
}
