import type { Archivo } from "../dominio/conversacion/conversacion.js";
import type { UsoDelModelo } from "../dominio/costos/uso.js";
import type { LecturaDeDocumento } from "../dominio/tipos.js";

export interface ResultadoDeLectura {
  lectura: LecturaDeDocumento;
  uso: UsoDelModelo;
}

export interface LectorDeRecibo {
  leer(archivo: Archivo): Promise<ResultadoDeLectura>;
}
