import type { Archivo, Etapa, Mensaje } from "../../dominio/conversacion/conversacion.js";
import type { ClienteCrm, DestinoDeDerivacion } from "../../puertos/cliente-crm.js";
import type { ClienteBitrix } from "./cliente-rest.js";
import type { MapeoDeBitrix } from "./mapeo.js";

// CRM real sobre la aplicación local. Cada método es una operación de negocio del
// agente traducida a una o dos llamadas REST; el motivo de una derivación va al
// timeline de la negociación, que el socio no ve.
const NOMBRE_DE_ETAPA: Record<Etapa, string> = {
  DOCUMENTACION: "DOCUMENTACIÓN",
  REVISION_DOCUMENTAL: "REVISIÓN DOCUMENTAL",
  DOCU_RECIBIDA: "DOCU RECIBIDA",
  FALTA_DOCUMENTACION: "FALTA DOCUMENTACIÓN",
};

export class CrmBitrix implements ClienteCrm {
  private readonly negociacionPorChat = new Map<string, string>();
  private readonly transferenciasPendientes = new Map<string, DestinoDeDerivacion>();
  private readonly comentarioDeConversacion = new Map<string, number>();

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

  async moverEtapa(negociacionId: string, etapa: Etapa, motivo?: string): Promise<void> {
    await this.cliente.llamar("crm.deal.update", { id: negociacionId, fields: { STAGE_ID: this.mapeo.etapas[etapa] } });
    if (motivo) await this.comentar(negociacionId, `Agente documental: pasa a ${NOMBRE_DE_ETAPA[etapa]}. ${motivo}`);
  }

  // El motivo se anota ya; la transferencia queda pendiente hasta que el bot mande su última
  // respuesta: al transferir sale del chat y después no puede escribir.
  async transferirConversacion(chatId: string, destino: DestinoDeDerivacion, motivo: string): Promise<void> {
    this.transferenciasPendientes.set(chatId, destino);
    const negociacionId = this.negociacionPorChat.get(chatId);
    if (!negociacionId) return;
    await this.comentar(negociacionId, `Agente documental: chat derivado a ${destino}. Motivo: ${motivo}`);
  }

  // Un solo comentario por chat, que se vuelve a escribir entero después de cada mensaje.
  async copiarConversacion(chatId: string, mensajes: Mensaje[], sesionId?: string): Promise<void> {
    const negociacionId = this.negociacionPorChat.get(chatId);
    if (!negociacionId || !mensajes.length) return;
    const texto = transcripcion(mensajes, sesionId);
    const existente = this.comentarioDeConversacion.get(chatId);
    if (existente) {
      await this.cliente.llamar("crm.timeline.comment.update", { id: existente, fields: { COMMENT: texto } });
      return;
    }
    this.comentarioDeConversacion.set(chatId, await this.comentar(negociacionId, texto));
  }

  private async comentar(negociacionId: string, texto: string): Promise<number> {
    return this.cliente.llamar<number>("crm.timeline.comment.add", {
      fields: { ENTITY_ID: Number(negociacionId), ENTITY_TYPE: "deal", COMMENT: texto },
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

const HORA = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Cordoba" });
const FECHA = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Cordoba" });

function transcripcion(mensajes: Mensaje[], sesionId?: string): string {
  const lineas = mensajes.map((m) => {
    const quien = m.direccion === "saliente" ? "[B]Agente[/B]" : "[B]Socio[/B]";
    const adjunto = m.archivoId ? " [I]adjunta un archivo[/I]" : "";
    const texto = m.texto === "(archivo)" ? "" : `\n${m.texto}`;
    return `${quien} · ${HORA.format(m.at)}${adjunto}${texto}`;
  });
  const enlace = sesionId ? `\n\nVer la conversación en Bitrix: [URL=/online/?IM_HISTORY=imol|${sesionId}]conversación #${sesionId}[/URL] (Contact Center → Conversaciones).` : "";
  return `[B]CHAT DE PRUEBA · conversación con el agente documental[/B] · ${FECHA.format(mensajes[0]!.at)}\nEl chat no está vinculado a esta negociación (chat público, visitante anónimo), así que el agente copia acá la conversación completa.\n\n${lineas.join("\n")}${enlace}`;
}
