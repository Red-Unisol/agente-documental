import type { Archivo, Etapa } from "../../dominio/conversacion/conversacion.js";
import type { ClienteCrm, DestinoDeDerivacion } from "../../puertos/cliente-crm.js";
import type { ClienteBitrix } from "./cliente-rest.js";
import type { MapeoDeBitrix } from "./mapeo.js";

// CRM real sobre la aplicación local. Cada método es una operación de negocio del
// agente traducida a una o dos llamadas REST; el motivo de una derivación va al
// timeline de la negociación, que el socio no ve.
export class CrmBitrix implements ClienteCrm {
  private readonly negociacionPorChat = new Map<string, string>();
  private readonly transferenciasPendientes = new Map<string, DestinoDeDerivacion>();

  constructor(
    private readonly cliente: ClienteBitrix,
    private readonly mapeo: MapeoDeBitrix,
  ) {}

  // El chat de Canales Abiertos y la negociación se conocen al abrir la conversación;
  // el motivo de una derivación se anota en la negociación, no en el chat.
  vincularChat(chatId: string, negociacionId: string): void {
    this.negociacionPorChat.set(chatId, negociacionId);
  }

  async cargarRecibo(negociacionId: string, archivo: Archivo): Promise<void> {
    await this.cliente.llamar("crm.deal.update", {
      id: negociacionId,
      fields: { [this.mapeo.campos.recibo]: { fileData: [archivo.nombre, Buffer.from(archivo.bytes).toString("base64")] } },
    });
  }

  async moverEtapa(negociacionId: string, etapa: Etapa): Promise<void> {
    await this.cliente.llamar("crm.deal.update", { id: negociacionId, fields: { STAGE_ID: this.mapeo.etapas[etapa] } });
  }

  // El motivo se anota ya; la transferencia queda pendiente hasta que el bot mande su última
  // respuesta: al transferir sale del chat y después no puede escribir.
  async transferirConversacion(chatId: string, destino: DestinoDeDerivacion, motivo: string): Promise<void> {
    this.transferenciasPendientes.set(chatId, destino);
    const negociacionId = this.negociacionPorChat.get(chatId);
    if (!negociacionId) return;
    await this.cliente.llamar("crm.timeline.comment.add", {
      fields: { ENTITY_ID: Number(negociacionId), ENTITY_TYPE: "deal", COMMENT: `Agente documental: chat derivado a ${destino}. Motivo: ${motivo}` },
    });
  }

  async completarTransferencia(chatId: string): Promise<void> {
    const destino = this.transferenciasPendientes.get(chatId);
    if (!destino) return;
    this.transferenciasPendientes.delete(chatId);
    await this.cliente.llamar("imopenlines.bot.session.transfer", {
      CHAT_ID: Number(chatId),
      USER_ID: this.mapeo.usuariosDeDerivacion[destino],
      LEAVE: "Y",
    });
  }
}
