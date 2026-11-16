import type { Archivo, Etapa, Mensaje } from "../../dominio/conversacion/conversacion.js";
import type { EstadoDeNegociacion } from "../../dominio/tipos.js";
import type { ClienteCrm, DestinoDeDerivacion } from "../../puertos/cliente-crm.js";
import type { ClienteBitrix } from "./cliente-rest.js";
import { type DefinicionesDeCampos, type EtapaDelEmbudo, estadoDeNegociacion, nombresParaElSocio } from "./datos-de-negociacion.js";
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
  // Las definiciones de campos y los nombres de las etapas no cambian mientras el proceso corre.
  private definiciones: Promise<DefinicionesDeCampos> | undefined;
  private nombresDeEtapas: Promise<Map<string, string>> | undefined;

  constructor(
    private readonly cliente: ClienteBitrix,
    private readonly mapeo: MapeoDeBitrix,
  ) {}

  // El chat de Canales Abiertos y la negociación se conocen al abrir la conversación;
  // el motivo de una derivación se anota en la negociación, no en el chat.
  vincularChat(chatId: string, negociacionId: string): void {
    // Si el chat cambia de negociación (modo de prueba), la copia de la conversación va a un comentario nuevo en la nueva.
    if (this.negociacionPorChat.get(chatId) !== negociacionId) this.comentarioDeConversacion.delete(chatId);
    this.negociacionPorChat.set(chatId, negociacionId);
  }

  // Quién tiene asignada la negociación hoy; en modo asignación decide si el agente atiende.
  async responsable(negociacionId: string): Promise<number> {
    return (await this.asignacion(negociacionId)).responsableId;
  }

  async asignacion(negociacionId: string): Promise<{ responsableId: number; esDelEmbudo: boolean }> {
    const negociacion = await this.cliente.llamar<{ ASSIGNED_BY_ID?: string; CATEGORY_ID?: string }>("crm.deal.get", { id: negociacionId });
    return { responsableId: Number(negociacion.ASSIGNED_BY_ID ?? 0), esDelEmbudo: Number(negociacion.CATEGORY_ID) === this.mapeo.embudo };
  }

  async estadoDeNegociacion(negociacionId: string): Promise<EstadoDeNegociacion> {
    this.definiciones ??= this.cliente.llamar<DefinicionesDeCampos>("crm.deal.fields");
    this.nombresDeEtapas ??= this.cliente
      .llamar<EtapaDelEmbudo[]>("crm.status.list", { filter: { ENTITY_ID: this.mapeo.embudo === 0 ? "DEAL_STAGE" : `DEAL_STAGE_${this.mapeo.embudo}` } })
      .then(nombresParaElSocio);
    const negociacion = await this.cliente.llamar<Record<string, unknown>>("crm.deal.get", { id: negociacionId });
    return estadoDeNegociacion(negociacion, await this.definiciones, await this.nombresDeEtapas, this.mapeo);
  }

  async cargarRecibo(negociacionId: string, archivo: Archivo): Promise<void> {
    await this.cliente.llamar("crm.deal.update", {
      id: negociacionId,
      fields: { [this.mapeo.campos.recibo]: { fileData: [archivo.nombre, Buffer.from(archivo.bytes).toString("base64")] } },
    });
  }

  // El agente mueve la negociación sólo entre sus etapas de documentación. Si está en cualquier otra
  // (oferta, validación, una etapa de cierre), no la toca: el socio puede escribir en cualquier momento
  // y una consulta o un recibo nuevo no tienen que hacerla retroceder ni reabrirla. Deja la nota y nada más.
  async moverEtapa(negociacionId: string, etapa: Etapa, motivo?: string): Promise<boolean> {
    const { STAGE_ID: actual } = await this.cliente.llamar<{ STAGE_ID?: string }>("crm.deal.get", { id: negociacionId });
    if (!Object.values(this.mapeo.etapas).includes(actual ?? "")) {
      if (motivo) await this.comentar(negociacionId, `Agente documental: ${motivo} La negociación no está en una etapa de documentación, así que no se movió de etapa.`);
      return false;
    }
    await this.cliente.llamar("crm.deal.update", { id: negociacionId, fields: { STAGE_ID: this.mapeo.etapas[etapa] } });
    if (motivo) await this.comentar(negociacionId, `Agente documental: pasa a ${NOMBRE_DE_ETAPA[etapa]}. ${motivo}`);
    return true;
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
    const texto = transcripcion(chatId, mensajes, sesionId);
    const existente = this.comentarioDeConversacion.get(chatId) ?? (await this.comentarioExistente(negociacionId, chatId));
    if (existente) {
      await this.cliente.llamar("crm.timeline.comment.update", { id: existente, fields: { COMMENT: texto } });
      return;
    }
    this.comentarioDeConversacion.set(chatId, await this.comentar(negociacionId, texto));
  }

  // Tras un reinicio el mapa está vacío: se busca el comentario de este chat en la negociación.
  private async comentarioExistente(negociacionId: string, chatId: string): Promise<number | undefined> {
    const comentarios = await this.cliente.llamar<{ ID: string; COMMENT: string }[]>("crm.timeline.comment.list", {
      filter: { ENTITY_ID: Number(negociacionId), ENTITY_TYPE: "deal" },
      select: ["ID", "COMMENT"],
    });
    const propio = comentarios.find((c) => c.COMMENT.includes(marcaDelChat(chatId)));
    if (propio) this.comentarioDeConversacion.set(chatId, Number(propio.ID));
    return propio ? Number(propio.ID) : undefined;
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

const marcaDelChat = (chatId: string) => `chat ${chatId}`;

function transcripcion(chatId: string, mensajes: Mensaje[], sesionId?: string): string {
  const lineas = mensajes.map((m) => {
    const quien = m.direccion === "saliente" ? "[B]Agente[/B]" : "[B]Socio[/B]";
    const adjunto = m.archivoId ? " [I]adjunta un archivo[/I]" : "";
    const texto = m.texto === "(archivo)" ? "" : `\n${m.texto}`;
    return `${quien} · ${HORA.format(m.at)}${adjunto}${texto}`;
  });
  const enlace = sesionId ? `\n\nVer la conversación en Bitrix: [URL=/online/?IM_HISTORY=imol|${sesionId}]conversación #${sesionId}[/URL] (Contact Center → Conversaciones).` : "";
  return `[B]CHAT DE PRUEBA · conversación con el agente documental[/B] · ${FECHA.format(mensajes[0]!.at)} · ${marcaDelChat(chatId)}\nEl chat no está vinculado a esta negociación (chat público, visitante anónimo), así que el agente copia acá la conversación completa.\n\n${lineas.join("\n")}${enlace}`;
}
