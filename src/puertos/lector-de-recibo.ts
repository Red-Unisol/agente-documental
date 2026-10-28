import type { Archivo } from "../dominio/conversacion/conversacion.js";
import type { LecturaDeRecibo } from "../dominio/tipos.js";

export interface LectorDeRecibo {
  leer(archivo: Archivo): Promise<LecturaDeRecibo>;
}
