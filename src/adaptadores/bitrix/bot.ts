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

// Recibe los eventos de la aplicación local y los traduce a la conversación del agente.
// No decide nada: lo que hace el agente lo decide atenderMensaje; esto sólo entra y sale.
export class BotDeBitrix {
  constructor(
    private readonly opciones: OpcionesDelBot,
    private readonly colaboradores: Colaboradores,
  ) {}

  async atenderEvento(evento: Anidado): Promise<void> {
    if (hoja(evento, "AUTH_ID")) return this.guardarTokensDeApertura(evento);
    switch (hoja(evento, "event").toUpperCase()) {
      case "ONAPPINSTALL":
        return this.guardarTokens(rama(evento, "auth"));
      case "ONIMBOTMESSAGEADD":
        return this.atenderMensajeDelChat(rama(evento, "data", "PARAMS"));
      default:
        return;
    }
  }

  private async atenderMensajeDelChat(parametros: Anidado): Promise<void> {
    const chatId = hoja(parametros, "CHAT_ID");
    const dialogo = hoja(parametros, "DIALOG_ID");
    if (!chatId || !dialogo) return;

    await this.asegurarConversacion(chatId, parametros);
    const archivo = await this.primerArchivo(rama(parametros, "FILES"));
    const texto = hoja(parametros, "MESSAGE") || (archivo ? "(archivo)" : "");
    const resultado = await atenderMensaje({ conversacionId: chatId, texto, ...(archivo && { archivo }) }, this.colaboradores.dependencias);
    if (resultado.tipo === "respondio") await this.responder(dialogo, resultado.texto);
  }

  private async asegurarConversacion(chatId: string, parametros: Anidado): Promise<void> {
    if (await this.colaboradores.dependencias.conversaciones.obtener(chatId)) return;
    const negociacionId = negociacionDelChat(hoja(parametros, "CHAT_ENTITY_DATA_1")) ?? this.opciones.negociacionDePrueba;
    if (!negociacionId) throw new Error(`El chat ${chatId} no está atado a una negociación y no hay negociación de prueba configurada`);
    const ficha = await this.colaboradores.fichas.deNegociacion(negociacionId);
    this.colaboradores.crm.vincularChat(chatId, negociacionId);
    await this.colaboradores.dependencias.conversaciones.guardar(nuevaConversacion(chatId, chatId, ficha));
  }

  private async primerArchivo(archivos: Anidado): Promise<Archivo | undefined> {
    const primero = Object.values(archivos).find((a): a is Anidado => typeof a === "object");
    if (!primero) return undefined;
    const nombre = hoja(primero, "name") || "archivo";
    const extension = nombre.split(".").pop()?.toLowerCase() ?? "";
    const tipoMime = TIPOS_MIME[extension];
    if (!tipoMime) return undefined; // audio, video, etc.: el agente lo trata como "no se puede procesar"
    const id = hoja(primero, "id");
    const bytes = await this.colaboradores.cliente.descargarArchivo(id);
    return { id, nombre, tipoMime, bytes };
  }

  private async responder(dialogo: string, texto: string): Promise<void> {
    await this.colaboradores.cliente.llamar("imbot.message.add", { BOT_ID: this.opciones.botId, DIALOG_ID: dialogo, MESSAGE: texto });
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
  private async guardarTokensDeApertura(peticion: Anidado): Promise<void> {
    const dominio = hoja(peticion, "DOMAIN");
    const accessToken = hoja(peticion, "AUTH_ID");
    const refreshToken = hoja(peticion, "REFRESH_ID");
    if (!dominio || !accessToken || !refreshToken) return;
    const perfil = await this.colaboradores.cliente.consultarComo<{ ADMIN?: boolean }>(dominio, accessToken, "profile");
    if (perfil.ADMIN !== true) return;
    await this.colaboradores.cliente.actualizarTokens(tokensDesdeEvento(dominio, { access_token: accessToken, refresh_token: refreshToken, expires_in: hoja(peticion, "AUTH_EXPIRES") || 3600 }));
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
