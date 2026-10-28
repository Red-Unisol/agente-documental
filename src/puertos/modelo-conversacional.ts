import type { NombreDeHerramienta } from "../dominio/agente/herramientas.js";
import type { UsoDelModelo } from "../dominio/costos/uso.js";

export interface LlamadaAHerramienta {
  id: string;
  nombre: string;
  argumentos: unknown;
}

export type MensajeParaElModelo =
  | { rol: "usuario"; texto: string }
  | { rol: "asistente"; texto: string }
  | { rol: "asistente_llama"; llamadas: LlamadaAHerramienta[] }
  | { rol: "resultado"; llamadaId: string; nombre: string; resultado: unknown };

export type EleccionDelModelo = { tipo: "texto"; texto: string } | { tipo: "llamadas"; llamadas: LlamadaAHerramienta[] };

export type RespuestaDelModelo = EleccionDelModelo & { uso: UsoDelModelo };

export interface PeticionAlModelo {
  sistema: string;
  mensajes: MensajeParaElModelo[];
  herramientas: NombreDeHerramienta[];
  herramientaObligatoria?: NombreDeHerramienta;
}

export interface ModeloConversacional {
  completar(peticion: PeticionAlModelo): Promise<RespuestaDelModelo>;
}
