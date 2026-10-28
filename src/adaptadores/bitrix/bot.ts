import { atenderMensaje } from "../../aplicacion/atender-mensaje.js";
import type { Dependencias } from "../../aplicacion/dependencias.js";
import { type Archivo, nuevaConversacion } from "../../dominio/conversacion/conversacion.js";
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
      case "ONIMBOTMESSAGEADD":
        return this.atenderMensajeDelChat(rama(evento, "data", "PARAMS"), credencialDelEvento(rama(evento, "auth")));
      default:
        return "";
    }
  }

  private async atenderMensajeDelChat(parametros: Anidado, credencial?: CredencialDelEvento): Promise<string> {
    const chatId = hoja(parametros, "CHAT_ID");
    const dialogo = hoja(parametros, "DIALOG_ID");
    if (!chatId || !dialogo) return "mensaje sin chat";

    await this.asegurarConversacion(chatId, parametros);
    const archivo = await this.primerArchivo(rama(parametros, "FILES"), credencial);
    const texto = hoja(parametros, "MESSAGE") || (archivo ? "(archivo)" : "");
    const resultado = await atenderMensaje({ conversacionId: chatId, texto, ...(archivo && { archivo }) }, this.colaboradores.dependencias);
    try {
      if (resultado.tipo === "respondio") await this.responder(dialogo, resultado.texto);
    } finally {
      // Aunque falle el envío, una derivación pendiente tiene que completarse: si no, el chat queda con el bot.
      await this.colaboradores.crm.completarTransferencia(chatId);
    }
    return resultado.tipo === "respondio" ? `respondió (${resultado.texto.length} caracteres)` : `silencio: ${resultado.motivo}`;
  }

  private async asegurarConversacion(chatId: string, parametros: Anidado): Promise<void> {
    if (await this.colaboradores.dependencias.conversaciones.obtener(chatId)) return;
    const negociacionId = negociacionDelChat(hoja(parametros, "CHAT_ENTITY_DATA_1")) ?? this.opciones.negociacionDePrueba;
    if (!negociacionId) throw new Error(`El chat ${chatId} no está atado a una negociación y no hay negociación de prueba configurada`);
    const ficha = await this.colaboradores.fichas.deNegociacion(negociacionId);
    this.colaboradores.crm.vincularChat(chatId, negociacionId);
    await this.colaboradores.dependencias.conversaciones.guardar(nuevaConversacion(chatId, chatId, ficha));
  }

  private async primerArchivo(archivos: Anidado, credencial?: CredencialDelEvento): Promise<Archivo | undefined> {
    const primero = Object.values(archivos).find((a): a is Anidado => typeof a === "object");
    if (!primero) return undefined;
    const nombre = hoja(primero, "name") || "archivo";
    const extension = nombre.split(".").pop()?.toLowerCase() ?? "";
    const tipoMime = TIPOS_MIME[extension];
    if (!tipoMime) return undefined; // audio, video, etc.: el agente lo trata como "no se puede procesar"
    const id = hoja(primero, "id");
    const bytes = await this.colaboradores.cliente.descargarArchivo(id, credencial);
    return { id, nombre, tipoMime, bytes };
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

// CHAT_ENTITY_DATA_1 de Canales Abiertos: "Y|DEAL|123|N|N|456|..." (crm activo, tipo, id, ...).
export function negociacionDelChat(datosDeEntidad: string): string | undefined {
  const [crm, tipo, id] = datosDeEntidad.split("|");
  return crm === "Y" && tipo === "DEAL" && id ? id : undefined;
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
