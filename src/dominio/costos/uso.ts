export type PropositoDelModelo = "conversacion" | "lectura";

export interface UsoDelModelo {
  modelo: string;
  tokensDeEntrada: number;
  tokensCacheados: number;
  tokensDeSalida: number;
  milisegundos: number;
}

export interface Tarifa {
  entrada: number;
  cacheada: number;
  salida: number;
}

const UN_MILLON = 1_000_000;

export function costoEnUsd(uso: UsoDelModelo, tarifas: Record<string, Tarifa>): number | undefined {
  const tarifa = tarifas[uso.modelo];
  if (!tarifa) return undefined;
  const noCacheados = uso.tokensDeEntrada - uso.tokensCacheados;
  return (noCacheados * tarifa.entrada + uso.tokensCacheados * tarifa.cacheada + uso.tokensDeSalida * tarifa.salida) / UN_MILLON;
}

export function usoVacio(modelo: string): UsoDelModelo {
  return { modelo, tokensDeEntrada: 0, tokensCacheados: 0, tokensDeSalida: 0, milisegundos: 0 };
}
