import { atenderMensaje } from "../../aplicacion/atender-mensaje.js";
import type { Dependencias } from "../../aplicacion/dependencias.js";
import { type Archivo, type Conversacion, conMensaje, nuevaConversacion } from "../../dominio/conversacion/conversacion.js";
import type { ClienteBitrix } from "./cliente-rest.js";
import type { CrmBitrix } from "./crm-bitrix.js";
import type { FichasDesdeBitrix } from "./fichas-bitrix.js";
import { type Anidado, hoja, rama } from "./formulario.js";
import { tokensDesdeEvento } from "./tokens.js";

export interface OpcionesDelBot {
  botId: number;
  // Mientras el chat de prueba no venga atado a una negociación, se usa esta.
  negociacionDePrueba: string | undefined;
}

interface Colaboradores {
  cliente: ClienteBitrix;
  crm: CrmBitrix;
  fichas: FichasDesdeBitrix;
  dependencias: Dependencias;
}

const TIPOS_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", pdf: "application/pdf" };
const REINTENTOS_DE_ENVIO = 4;
const ESPERA_ENTRE_REINTENTOS_MS = 1500;

// Recibe los eventos de la aplicación local y los traduce a la conversación del agente.
// No decide nada: lo que hace el agente lo decide atenderMensaje; esto sólo entra y sale.
export class BotDeBitrix {
  // Los mensajes de un mismo chat se atienden de a uno: si el socio manda texto y archivo
  // seguidos, el segundo tiene que ver la conversación ya actualizada por el primero.
  private readonly colaPorChat = new Map<string, Promise<unknown>>();

  constructor(
    private readonly opciones: OpcionesDelBot,
    private readonly colaboradores: Colaboradores,
  ) {}

  // Devuelve una línea corta de lo que hizo, para el registro del servidor.
  async atenderEvento(evento: Anidado): Promise<string> {
    if (hoja(evento, "AUTH_ID")) return this.guardarTokensDeApertura(evento);
    switch (hoja(evento, "event").toUpperCase()) {
      case "ONAPPINSTALL":
        await this.guardarTokens(rama(evento, "auth"));
        return "tokens de instalación guardados";
      case "ONIMBOTMESSAGEADD": {
        const parametros = rama(evento, "data", "PARAMS");
        return this.enOrden(hoja(parametros, "CHAT_ID"), () => this.atenderMensajeDelChat(parametros, credencialDelEvento(rama(evento, "auth"))));
      }
      default:
        return "";
    }
  }

  private enOrden<T>(chatId: string, tarea: () => Promise<T>): Promise<T> {
    const anterior = this.colaPorChat.get(chatId) ?? Promise.resolve();
    const propia = anterior.then(tarea, tarea);
    this.colaPorChat.set(chatId, propia.catch(() => undefined));
    return propia;
  }

  private async atenderMensajeDelChat(parametros: Anidado, credencial?: CredencialDelEvento): Promise<string> {
    const chatId = hoja(parametros, "CHAT_ID");
    const dialogo = hoja(parametros, "DIALOG_ID");
    if (!chatId || !dialogo) return "mensaje sin chat";

    const vinculo = vinculoDelChat(hoja(parametros, "CHAT_ENTITY_DATA_1"));
    await this.asegurarConversacion(chatId, vinculo.negociacionId, hoja(parametros, "MESSAGE_ID"));
    const adjunto = await this.primerArchivo(rama(parametros, "FILES"), credencial);
    const texto = hoja(parametros, "MESSAGE") || adjunto.marca || "";
    const resultado = await atenderMensaje({ conversacionId: chatId, texto, ...(adjunto.archivo && { archivo: adjunto.archivo }) }, this.colaboradores.dependencias);
    try {
      if (resultado.tipo === "respondio") await this.responder(dialogo, resultado.texto);
    } finally {
      // Aunque falle el envío, una derivación pendiente tiene que completarse: si no, el chat queda con el bot.
      await this.colaboradores.crm.completarTransferencia(chatId);
    }
    // Un chat atado a la negociación ya se ve en su línea de tiempo. Si no lo está (chat público de
    // prueba, visitante anónimo), el agente copia la conversación ahí para que quien mire la negociación la tenga.
    if (!vinculo.negociacionId) await this.colaboradores.crm.copiarConversacion(chatId, resultado.conversacion.mensajes, vinculo.sesionId);
    return resultado.tipo === "respondio" ? `respondió (${resultado.texto.length} caracteres)` : `silencio: ${resultado.motivo}`;
  }

  private async asegurarConversacion(chatId: string, negociacionVinculada: string | undefined, mensajeActualId: string): Promise<void> {
    const guardada = await this.colaboradores.dependencias.conversaciones.obtener(chatId);
    if (guardada) {
      this.colaboradores.crm.vincularChat(chatId, guardada.ficha.negociacionId);
      return;
    }
    const negociacionId = negociacionVinculada ?? this.opciones.negociacionDePrueba;
    if (!negociacionId) throw new Error(`El chat ${chatId} no está atado a una negociación y no hay negociación de prueba configurada`);
    const ficha = await this.colaboradores.fichas.deNegociacion(negociacionId);
    this.colaboradores.crm.vincularChat(chatId, negociacionId);
    const conversacion = await this.conHistorialDeBitrix(nuevaConversacion(chatId, chatId, ficha), mensajeActualId);
    await this.colaboradores.dependencias.conversaciones.guardar(conversacion);
  }

  // Si no hay nada guardado pero el chat ya tiene mensajes en Bitrix (el agente se reinició y perdió
  // sus datos), se reconstruye el historial desde ahí para no arrancar de cero con el socio.
  private async conHistorialDeBitrix(conversacion: Conversacion, mensajeActualId: string): Promise<Conversacion> {
    let historial: { message?: Record<string, { id: string; senderid: string; date: string; text?: string; params?: { fileId?: unknown[] } }> };
    try {
      historial = await this.colaboradores.cliente.llamar("imopenlines.session.history.get", { CHAT_ID: Number(conversacion.chatId) });
    } catch {
      return conversacion;
    }
    const previos = Object.values(historial.message ?? {})
      .filter((m) => m.senderid !== "0" && (!mensajeActualId || Number(m.id) < Number(mensajeActualId)))
      .sort((a, b) => Number(a.id) - Number(b.id));
    return previos.reduce((acumulada, m) => {
      const delBot = Number(m.senderid) === this.opciones.botId;
      const texto = m.text?.trim() || (m.params?.fileId?.length ? "(archivo mandado antes de que el agente se reiniciara; si hace falta, pedilo de nuevo)" : "");
      return texto ? conMensaje(acumulada, { direccion: delBot ? "saliente" : "entrante", texto, at: new Date(m.date) }) : acumulada;
    }, conversacion);
  }

  // Si el archivo no es foto ni PDF, o no se pudo bajar, el mensaje igual entra a la conversación
  // con una marca: el agente le pide al socio que lo mande de nuevo, en vez de quedarse callado.
  private async primerArchivo(archivos: Anidado, credencial?: CredencialDelEvento): Promise<{ archivo?: Archivo; marca?: string }> {
    const primero = Object.values(archivos).find((a): a is Anidado => typeof a === "object");
    if (!primero) return {};
    const nombre = hoja(primero, "name") || "archivo";
    const extension = nombre.split(".").pop()?.toLowerCase() ?? "";
    const tipoMime = TIPOS_MIME[extension];
    if (!tipoMime) return { marca: `(mandó un archivo que no es foto ni PDF: ${extension || "tipo desconocido"})` };
    const id = hoja(primero, "id");
    try {
      const bytes = await this.colaboradores.cliente.descargarArchivo(id, credencial);
      return { archivo: { id, nombre, tipoMime, bytes }, marca: "(archivo)" };
    } catch (error) {
      console.log(`  no se pudo bajar el archivo ${id}: ${error instanceof Error ? error.message : String(error)}`);
      return { marca: "(mandó un archivo que no se pudo abrir)" };
    }
  }

  // Si la respuesta llega antes de que Bitrix termine de abrir la sesión del chat, el envío
  // vuelve "CANCELED"; con un par de reintentos cortos entra.
  private async responder(dialogo: string, texto: string, intento = 1): Promise<void> {
    try {
      await this.colaboradores.cliente.llamar("imbot.message.add", { BOT_ID: this.opciones.botId, DIALOG_ID: dialogo, MESSAGE: texto });
    } catch (error) {
      if (intento >= REINTENTOS_DE_ENVIO || !/CANCELED/.test(String(error))) throw error;
      await new Promise((resolver) => setTimeout(resolver, ESPERA_ENTRE_REINTENTOS_MS * intento));
      await this.responder(dialogo, texto, intento + 1);
    }
  }

  // Sólo la instalación trae tokens del administrador que instaló. Los eventos del chat también
  // traen tokens, pero en nombre del autor del mensaje (el visitante), que no puede tocar el CRM.
  private async guardarTokens(auth: Anidado): Promise<void> {
    const dominio = hoja(auth, "domain");
    const accessToken = hoja(auth, "access_token");
    const refreshToken = hoja(auth, "refresh_token");
    if (!dominio || !accessToken || !refreshToken) return;
    await this.colaboradores.cliente.actualizarTokens(tokensDesdeEvento(dominio, { access_token: accessToken, refresh_token: refreshToken, expires_in: hoja(auth, "expires_in") || 3600 }));
  }

  // Cuando alguien abre la aplicación desde el menú, Bitrix manda tokens en nombre de esa
  // persona. Se guardan sólo si es administrador: así se recuperan sin reinstalar.
  private async guardarTokensDeApertura(peticion: Anidado): Promise<string> {
    const dominio = hoja(peticion, "DOMAIN");
    const accessToken = hoja(peticion, "AUTH_ID");
    const refreshToken = hoja(peticion, "REFRESH_ID");
    if (!dominio || !accessToken || !refreshToken) return "apertura sin tokens";
    const perfil = await this.colaboradores.cliente.consultarComo<{ ADMIN?: boolean }>(dominio, accessToken, "profile");
    if (perfil.ADMIN !== true) return "apertura de un usuario que no es administrador: tokens ignorados";
    await this.colaboradores.cliente.actualizarTokens(tokensDesdeEvento(dominio, { access_token: accessToken, refresh_token: refreshToken, expires_in: hoja(peticion, "AUTH_EXPIRES") || 3600 }));
    return "tokens de administrador guardados";
  }
}

// CHAT_ENTITY_DATA_1 de Canales Abiertos: "Y|DEAL|123|N|N|456|..." (crm activo, tipo, id, _, _, sesión).
export function vinculoDelChat(datosDeEntidad: string): { negociacionId?: string; sesionId?: string } {
  const [crm, tipo, id, , , sesion] = datosDeEntidad.split("|");
  return { ...(crm === "Y" && tipo === "DEAL" && id && { negociacionId: id }), ...(sesion && sesion !== "0" && { sesionId: sesion }) };
}

export function negociacionDelChat(datosDeEntidad: string): string | undefined {
  return vinculoDelChat(datosDeEntidad).negociacionId;
}

export async function registrarBot(cliente: ClienteBitrix, urlDeEventos: string): Promise<number> {
  const botId = await cliente.llamar<number>("imbot.register", {
    CODE: "agente_documental",
    TYPE: "O",
    OPENLINE: "Y",
    EVENT_MESSAGE_ADD: urlDeEventos,
    EVENT_WELCOME_MESSAGE: urlDeEventos,
    EVENT_BOT_DELETE: urlDeEventos,
    PROPERTIES: { NAME: "Agente documental", COLOR: "AZURE", WORK_POSITION: "Recibo de sueldo · Red Unisol" },
  });
  return Number(botId);
}

type CredencialDelEvento = { dominio: string; accessToken: string };

// Token del autor del mensaje, tal como viene en el evento. Sirve para leer lo que él mismo
// subió al chat; no se guarda ni se usa para nada más.
function credencialDelEvento(auth: Anidado): CredencialDelEvento | undefined {
  const dominio = hoja(auth, "domain");
  const accessToken = hoja(auth, "access_token");
  return dominio && accessToken ? { dominio, accessToken } : undefined;
}
