import type { Archivo, Etapa } from "../../dominio/conversacion/conversacion.js";
import type { EstadoDeNegociacion } from "../../dominio/tipos.js";
import type { ClienteCrm, DestinoDeDerivacion } from "../../puertos/cliente-crm.js";

export type AccionSimulada =
  | { tipo: "recibo_cargado"; negociacionId: string; archivo: string }
  | { tipo: "etapa"; negociacionId: string; etapa: Etapa }
  | { tipo: "transferencia"; chatId: string; destino: DestinoDeDerivacion; motivo: string };

export class CrmSimulado implements ClienteCrm {
  readonly acciones: AccionSimulada[] = [];

  // Lo que "tiene" la negociación en el CRM simulado; los evals lo cargan para probar las consultas del socio.
  constructor(private readonly estado: EstadoDeNegociacion = { hayQuePedirElRecibo: true, datos: [] }) {}

  async estadoDeNegociacion(): Promise<EstadoDeNegociacion> {
    return this.estado;
  }

  async cargarRecibo(negociacionId: string, archivo: Archivo): Promise<void> {
    this.acciones.push({ tipo: "recibo_cargado", negociacionId, archivo: archivo.nombre });
  }

  async moverEtapa(negociacionId: string, etapa: Etapa): Promise<boolean> {
    this.acciones.push({ tipo: "etapa", negociacionId, etapa });
    return true;
  }

  async transferirConversacion(chatId: string, destino: DestinoDeDerivacion, motivo: string): Promise<void> {
    this.acciones.push({ tipo: "transferencia", chatId, destino, motivo });
  }
}
