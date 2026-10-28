import type { Archivo } from "../dominio/conversacion/conversacion.js";
import type { UsoDelModelo } from "../dominio/costos/uso.js";
import type { LecturaDeRecibo } from "../dominio/tipos.js";

export interface ResultadoDeLectura {
  lectura: LecturaDeRecibo;
  uso: UsoDelModelo;
}

export interface LectorDeRecibo {
  leer(archivo: Archivo): Promise<ResultadoDeLectura>;
}
