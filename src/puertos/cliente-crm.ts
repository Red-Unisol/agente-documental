import type { Archivo, Etapa } from "../dominio/conversacion/conversacion.js";

export type DestinoDeDerivacion = "vendedor" | "analista";

export interface ClienteCrm {
  cargarRecibo(negociacionId: string, archivo: Archivo): Promise<void>;
  // El motivo, si se pasa, queda registrado en la negociación para quien la mire después.
  moverEtapa(negociacionId: string, etapa: Etapa, motivo?: string): Promise<void>;
  transferirConversacion(chatId: string, destino: DestinoDeDerivacion, motivo: string): Promise<void>;
}
