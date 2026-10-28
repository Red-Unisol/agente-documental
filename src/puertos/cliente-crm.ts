import type { Archivo, Etapa } from "../dominio/conversacion/conversacion.js";

export type DestinoDeDerivacion = "vendedor" | "analista";

export interface ClienteCrm {
  cargarRecibo(negociacionId: string, archivo: Archivo): Promise<void>;
  moverEtapa(negociacionId: string, etapa: Etapa): Promise<void>;
  transferirConversacion(chatId: string, destino: DestinoDeDerivacion, motivo: string): Promise<void>;
}
