import type { Conversacion } from "../conversacion/conversacion.js";
import { costoEnUsd, type PropositoDelModelo, type Tarifa, type UsoDelModelo } from "./uso.js";

export interface ResumenDeUso {
  llamadas: number;
  tokensDeEntrada: number;
  tokensCacheados: number;
  tokensDeSalida: number;
  milisegundos: number;
  costoUsd: number | undefined;
  modelos: string[];
}

export function resumenDeUso(conversacion: Conversacion, tarifas: Record<string, Tarifa>, proposito?: PropositoDelModelo): ResumenDeUso {
  const usos = conversacion.auditoria
    .filter((evento) => evento.tipo === "uso_de_modelo")
    .map((evento) => evento.detalle as unknown as UsoDelModelo & { proposito: PropositoDelModelo })
    .filter((uso) => !proposito || uso.proposito === proposito);

  const costos = usos.map((uso) => costoEnUsd(uso, tarifas));
  return {
    llamadas: usos.length,
    tokensDeEntrada: suma(usos.map((u) => u.tokensDeEntrada)),
    tokensCacheados: suma(usos.map((u) => u.tokensCacheados)),
    tokensDeSalida: suma(usos.map((u) => u.tokensDeSalida)),
    milisegundos: suma(usos.map((u) => u.milisegundos)),
    costoUsd: costos.every((c) => c !== undefined) ? suma(costos) : undefined,
    modelos: [...new Set(usos.map((u) => u.modelo))],
  };
}

function suma(valores: number[]): number {
  return valores.reduce((total, valor) => total + valor, 0);
}
