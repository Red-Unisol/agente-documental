import type { Archivo, Etapa } from "../dominio/conversacion/conversacion.js";
import type { EstadoDeNegociacion } from "../dominio/tipos.js";

export type DestinoDeDerivacion = "vendedor" | "analista";

export interface ClienteCrm {
  cargarRecibo(negociacionId: string, archivo: Archivo): Promise<void>;
  // El motivo, si se pasa, queda registrado en la negociación para quien la mire después.
  // Devuelve false cuando la negociación está fuera de las etapas de documentación y por eso no se movió.
  moverEtapa(negociacionId: string, etapa: Etapa, motivo?: string): Promise<boolean>;
  transferirConversacion(chatId: string, destino: DestinoDeDerivacion, motivo: string): Promise<void>;
  // Lo que la negociación tiene cargado hoy y el socio puede saber (etapa, línea, créditos activos, oferta...)
  // y si corresponde pedirle el recibo. Se lee en cada mensaje: si alguien cambia la negociación en el CRM,
  // el agente lo ve en el siguiente.
  estadoDeNegociacion(negociacionId: string): Promise<EstadoDeNegociacion>;
}
