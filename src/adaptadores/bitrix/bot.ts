import { atenderMensaje } from "../../aplicacion/atender-mensaje.js";
import type { Dependencias } from "../../aplicacion/dependencias.js";
import { type Archivo, type Conversacion, conEvento, conMensaje, nuevaConversacion } from "../../dominio/conversacion/conversacion.js";
import { esDePrueba, notaDeConversacionDerivada, notaDeLoQueTiene, notaDelTurno } from "../../dominio/conversacion/nota-de-prueba.js";
import type { EstadoDeNegociacion } from "../../dominio/tipos.js";
import type { ClienteBitrix } from "./cliente-rest.js";
import { type CopiaDeNegociacion, pedidoDePrueba } from "./copia-de-negociacion.js";
import type { CrmBitrix } from "./crm-bitrix.js";
import type { FichasDesdeBitrix } from "./fichas-bitrix.js";
import type { SesionesDeBitrix } from "./sesiones-bitrix.js";
import { type Anidado, hoja, rama } from "./formulario.js";
import { type Decision, type ListaBlanca, type ModoDeAtencion, decidirAtencion, entradaDeListaBlanca, origenDelChat } from "./politica-de-atencion.js";
import { tokensDesdeEvento } from "./tokens.js";

export interface OpcionesDelBot {
  botId: number;
  // Mientras el chat de prueba no venga atado a una negociación, se usa esta.
  negociacionDePrueba: string | undefined;
  // canal: atiende todo chat que le llegue. asignacion: sólo si la negociación está asignada al usuario del agente.
  modo?: ModoDeAtencion | undefined;
  usuarioAgente?: number | undefined;
  listaBlanca?: ListaBlanca | undefined;
  // Con esta clave, quien prueba puede pedir en el chat que el agente copie una negociación real al
  // embudo de prueba y siga la charla ahí. Sin clave, el modo está apagado.
  claveDePruebas?: string | undefined;
}

interface Colaboradores {
  cliente: ClienteBitrix;
  crm: CrmBitrix;
  fichas: FichasDesdeBitrix;
  sesiones: SesionesDeBitrix;
  copias: CopiaDeNegociacion;
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
        return this.enOrden(hoja(parametros, "CHAT_ID"), () => this.atenderMensajeDelChat(parametros, rama(evento, "data", "USER"), credencialDelEvento(rama(evento, "auth"))));
      }
      case "ONCRMDEALUPDATE": {
        const negociacionId = hoja(rama(evento, "data", "FIELDS"), "ID");
        return this.enOrden(`negociacion:${negociacionId}`, () => this.atenderCambioDeNegociacion(negociacionId));
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

  private async atenderMensajeDelChat(parametros: Anidado, usuario: Anidado, credencial?: CredencialDelEvento): Promise<string> {
    const chatId = hoja(parametros, "CHAT_ID");
    const dialogo = hoja(parametros, "DIALOG_ID");
    if (!chatId || !dialogo) return "mensaje sin chat";

    if (hoja(usuario, "IS_CONNECTOR") === "N" && hoja(usuario, "IS_BOT") !== "Y") {
      // Escribió una persona de Red Unisol en el chat (no el socio, que entra por un conector): el agente se lo deja y se va.
      await this.cederChat(chatId, Number(hoja(parametros, "FROM_USER_ID")) || undefined);
      return "una persona escribió en el chat: el agente se retira";
    }
    const vinculo = vinculoDelChat(hoja(parametros, "CHAT_ENTITY_DATA_1"));
    const origen = origenDelChat(hoja(parametros, "CHAT_ENTITY_ID"));
    // La negociación de prueba de la lista blanca manda sobre la que Bitrix ató al chat: un número de
    // prueba puede venir atado a una negociación real, y esa no se toca.
    const negociacionId = this.negociacionDeListaBlanca(origen.telefono) ?? vinculo.negociacionId ?? this.opciones.negociacionDePrueba;
    const decision = await this.decidir(origen, negociacionId);
    if (!decision.atender) {
      await this.cederChat(chatId, decision.cederA);
      return `cedido a una persona: ${decision.motivo}`;
    }
    const pedido = pedidoDePrueba(hoja(parametros, "MESSAGE"), this.opciones.claveDePruebas);
    if (pedido) return this.probarConNegociacion(chatId, dialogo, pedido.negociacionId);
    const previa = await this.asegurarConversacion(chatId, negociacionId, hoja(parametros, "MESSAGE_ID"));
    const dePrueba = esDePrueba(previa);
    const loQueVio = dePrueba ? await this.estadoParaLaNota(previa.ficha.negociacionId) : undefined;
    const adjuntos = await this.archivosDelMensaje(rama(parametros, "FILES"), credencial);
    const texto = hoja(parametros, "MESSAGE") || adjuntos.marca || "";
    const resultado = await atenderMensaje({ conversacionId: chatId, texto, ...(adjuntos.archivos.length > 0 && { archivos: adjuntos.archivos }) }, this.colaboradores.dependencias);
    try {
      if (resultado.tipo === "respondio") await this.responder(dialogo, resultado.texto);
      if (dePrueba) await this.anotarLaPrueba(dialogo, previa, resultado.conversacion, loQueVio);
    } finally {
      // Aunque falle el envío, una derivación pendiente tiene que completarse: si no, el chat queda con el bot.
      if (dePrueba) this.colaboradores.crm.descartarTransferencia(chatId);
      else await this.colaboradores.crm.completarTransferencia(chatId);
    }
    // Un chat atado a la negociación ya se ve en su línea de tiempo. Si no lo está (chat público de
    // prueba, visitante anónimo), el agente copia la conversación ahí para que quien mire la negociación la tenga.
    if (!vinculo.negociacionId) await this.colaboradores.crm.copiarConversacion(chatId, resultado.conversacion.mensajes, vinculo.sesionId);
    return resultado.tipo === "respondio" ? `respondió (${resultado.texto.length} caracteres)` : `silencio: ${resultado.motivo}`;
  }

  // Modo de prueba: el chat deja la negociación que tenía y sigue sobre una copia de la que le pasaron,
  // con la conversación anterior cargada como historial. El pedido no entra a la conversación ni llega al modelo.
  private async probarConNegociacion(chatId: string, dialogo: string, negociacionId: string): Promise<string> {
    let copia: Awaited<ReturnType<CopiaDeNegociacion["copiar"]>>;
    try {
      copia = await this.colaboradores.copias.copiar(negociacionId);
    } catch (error) {
      await this.responder(dialogo, `Modo de prueba: no pude leer la negociación ${negociacionId}. Revisá el enlace y probá de nuevo.`);
      return `modo de prueba: no se pudo copiar la negociación ${negociacionId} (${error instanceof Error ? error.message : String(error)})`;
    }
    const ficha = await this.colaboradores.fichas.deNegociacion(copia.negociacionId);
    this.colaboradores.crm.vincularChat(chatId, copia.negociacionId);
    const marca = { at: this.colaboradores.dependencias.reloj.ahora(), tipo: "modo_de_prueba" as const, detalle: { negociacionOriginal: negociacionId, negociacionDePrueba: copia.negociacionId } };
    const conversacion = conEvento(copia.mensajes.reduce(conMensaje, nuevaConversacion(chatId, chatId, ficha)), marca);
    await this.colaboradores.dependencias.conversaciones.guardar(conversacion);
    const origen = copia.esCopia ? `Copié la negociación ${negociacionId} en la negociación de prueba ${copia.negociacionId}; la original no se modificó.` : `La negociación ${negociacionId} ya es de prueba: sigo sobre esa.`;
    const historial = copia.mensajes.length ? `Traje los últimos ${copia.mensajes.length} mensajes de su conversación.` : "No encontré una conversación anterior: arranca sin historial.";
    const comoSeguir = "Desde el próximo mensaje, escribí como si fueras el socio. Después de cada respuesta va una nota con lo que hizo el agente. Para empezar de cero o probar otra negociación, mandá de nuevo un enlace con la clave.";
    await this.responder(dialogo, `Modo de prueba. ${origen} Etapa: ${copia.etapa}. ${historial} ${comoSeguir}`);
    await this.responder(dialogo, notaDeLoQueTiene(ficha, await this.estadoParaLaNota(copia.negociacionId)));
    return `modo de prueba: negociación ${negociacionId} → ${copia.negociacionId} (${copia.mensajes.length} mensajes anteriores)`;
  }

  // La nota de prueba va en un mensaje aparte y no entra a la conversación: el modelo no la ve. Si no
  // se puede mandar, la prueba sigue igual.
  private async anotarLaPrueba(dialogo: string, previa: Conversacion, actual: Conversacion, loQueVio: EstadoDeNegociacion | undefined): Promise<void> {
    const yaEstabaDerivada = previa.estado === "derivada";
    const nota = yaEstabaDerivada ? notaDeConversacionDerivada() : notaDelTurno(loQueVio, actual.auditoria.slice(previa.auditoria.length), actual);
    try {
      await this.responder(dialogo, nota);
    } catch (error) {
      console.log(`  no se pudo mandar la nota de prueba: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async estadoParaLaNota(negociacionId: string): Promise<EstadoDeNegociacion | undefined> {
    try {
      return await this.colaboradores.crm.estadoDeNegociacion(negociacionId);
    } catch {
      return undefined;
    }
  }

  // Disparador por asignación: si la negociación pasa al usuario del agente, el bot entra a sus chats
  // abiertos; si deja de ser suya, los suelta y quedan con el nuevo responsable.
  async atenderCambioDeNegociacion(negociacionId: string): Promise<string> {
    const agente = this.opciones.usuarioAgente;
    if (this.opciones.modo !== "asignacion" || !agente || !negociacionId) return "";
    const { responsableId, esDelEmbudo } = await this.colaboradores.crm.asignacion(negociacionId);
    if (!esDelEmbudo) return "";
    const chats = await this.colaboradores.sesiones.chatsDeNegociacion(negociacionId);
    if (!chats.length) return `negociación ${negociacionId}: sin chats abiertos`;
    if (responsableId !== agente) {
      for (const chatId of chats) await this.colaboradores.sesiones.soltarChat(chatId, responsableId || undefined);
      return `negociación ${negociacionId} asignada a ${responsableId}: el agente suelta ${chats.length} chat(s)`;
    }
    if (this.opciones.listaBlanca && ![...this.opciones.listaBlanca.telefonos.values()].includes(negociacionId)) {
      return `negociación ${negociacionId} asignada al agente pero fuera de la lista blanca: no se toma`;
    }
    const hechos = await Promise.all(chats.map((chatId) => this.colaboradores.sesiones.tomarChat(chatId, agente).then((h) => `${chatId} ${h}`)));
    return `negociación ${negociacionId} asignada al agente: ${hechos.join(", ")}`;
  }

  private negociacionDeListaBlanca(telefono: string | undefined): string | undefined {
    if (!telefono || !this.opciones.listaBlanca) return undefined;
    return entradaDeListaBlanca(this.opciones.listaBlanca, telefono)?.negociacionId;
  }

  private async decidir(origen: { telefono?: string | undefined; linea?: string | undefined }, negociacionId: string | undefined): Promise<Decision> {
    const modo = this.opciones.modo ?? "canal";
    const negociacion = negociacionId ? { id: negociacionId, ...(await this.colaboradores.crm.asignacion(negociacionId)) } : undefined;
    return decidirAtencion({ modo, listaBlanca: this.opciones.listaBlanca, telefono: origen.telefono, linea: origen.linea, negociacion, usuarioAgente: this.opciones.usuarioAgente });
  }

  // Se corre del chat sin escribirle nada al socio: a una persona concreta si la hay, si no a la cola de la línea.
  private async cederChat(chatId: string, aUsuario?: number): Promise<void> {
    if (aUsuario) {
      await this.colaboradores.cliente.llamar("imopenlines.bot.session.transfer", { CHAT_ID: Number(chatId), USER_ID: aUsuario, LEAVE: "Y" });
      return;
    }
    await this.colaboradores.cliente.llamar("imopenlines.bot.session.operator", { CHAT_ID: Number(chatId) });
  }

  private async asegurarConversacion(chatId: string, negociacionId: string | undefined, mensajeActualId: string): Promise<Conversacion> {
    const guardada = await this.colaboradores.dependencias.conversaciones.obtener(chatId);
    if (guardada) {
      this.colaboradores.crm.vincularChat(chatId, guardada.ficha.negociacionId);
      return guardada;
    }
    if (!negociacionId) throw new Error(`El chat ${chatId} no está atado a una negociación y no hay negociación de prueba configurada`);
    const ficha = await this.colaboradores.fichas.deNegociacion(negociacionId);
    this.colaboradores.crm.vincularChat(chatId, negociacionId);
    const conversacion = await this.conHistorialDeBitrix(nuevaConversacion(chatId, chatId, ficha), mensajeActualId);
    await this.colaboradores.dependencias.conversaciones.guardar(conversacion);
    return conversacion;
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

  // Un mensaje puede traer varios archivos. Si alguno no es foto ni PDF, o no se pudo bajar, el
  // mensaje igual entra a la conversación con una marca: el agente le pide al socio que lo mande
  // de nuevo, en vez de quedarse callado.
  private async archivosDelMensaje(adjuntos: Anidado, credencial?: CredencialDelEvento): Promise<{ archivos: Archivo[]; marca?: string }> {
    const archivos: Archivo[] = [];
    let marca: string | undefined;
    for (const adjunto of Object.values(adjuntos).filter((a): a is Anidado => typeof a === "object")) {
      const resultado = await this.bajarArchivo(adjunto, credencial);
      if (resultado.archivo) archivos.push(resultado.archivo);
      marca = resultado.archivo ? (marca ?? resultado.marca) : resultado.marca;
    }
    return { archivos, ...(marca && { marca }) };
  }

  private async bajarArchivo(adjunto: Anidado, credencial?: CredencialDelEvento): Promise<{ archivo?: Archivo; marca: string }> {
    const nombre = hoja(adjunto, "name") || "archivo";
    const extension = nombre.split(".").pop()?.toLowerCase() ?? "";
    const tipoMime = TIPOS_MIME[extension];
    if (!tipoMime) return { marca: `(mandó un archivo que no es foto ni PDF: ${extension || "tipo desconocido"})` };
    const id = hoja(adjunto, "id");
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
