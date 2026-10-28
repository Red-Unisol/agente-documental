import type { Archivo, Etapa } from "../../dominio/conversacion/conversacion.js";
import type { ClienteCrm, DestinoDeDerivacion } from "../../puertos/cliente-crm.js";

export type AccionSimulada =
  | { tipo: "recibo_cargado"; negociacionId: string; archivo: string }
  | { tipo: "etapa"; negociacionId: string; etapa: Etapa }
  | { tipo: "transferencia"; chatId: string; destino: DestinoDeDerivacion; motivo: string };

export class CrmSimulado implements ClienteCrm {
  readonly acciones: AccionSimulada[] = [];

  async cargarRecibo(negociacionId: string, archivo: Archivo): Promise<void> {
    this.acciones.push({ tipo: "recibo_cargado", negociacionId, archivo: archivo.nombre });
  }

  async moverEtapa(negociacionId: string, etapa: Etapa): Promise<void> {
    this.acciones.push({ tipo: "etapa", negociacionId, etapa });
  }

  async transferirConversacion(chatId: string, destino: DestinoDeDerivacion, motivo: string): Promise<void> {
    this.acciones.push({ tipo: "transferencia", chatId, destino, motivo });
  }
}
