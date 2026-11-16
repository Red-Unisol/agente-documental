// Puesta en marcha del agente dentro de Bitrix (embudo de prueba):
//   tsx src/cli/bitrix.ts registrar-bot              registra el chatbot de Canales Abiertos
//   tsx src/cli/bitrix.ts crear-negociacion-prueba   crea una negociación ficticia en el embudo 19
//   tsx src/cli/bitrix.ts crear-canal-prueba         crea un Canal Abierto de prueba atendido por el bot
//   tsx src/cli/bitrix.ts actualizar-url             apunta los eventos del bot a BITRIX24_URL_PUBLICA (mudanza de servidor)
//   tsx src/cli/bitrix.ts vincular-eventos           suscribe el cambio de negociación (disparador por asignación)
//   tsx src/cli/bitrix.ts tomar-chat <chatId>        mete el bot en un chat ya abierto (a mano)
//   tsx src/cli/bitrix.ts copiar-negociacion <id>    copia una negociación al embudo de prueba (la original no se toca)
//   tsx src/cli/bitrix.ts servir                     escucha los eventos y atiende los chats
import { BotDeBitrix, registrarBot } from "../adaptadores/bitrix/bot.js";
import { ClienteBitrix } from "../adaptadores/bitrix/cliente-rest.js";
import { CopiaDeNegociacion } from "../adaptadores/bitrix/copia-de-negociacion.js";
import { CrmBitrix } from "../adaptadores/bitrix/crm-bitrix.js";
import { FichasDesdeBitrix } from "../adaptadores/bitrix/fichas-bitrix.js";
import { mapeoDelEmbudoDePrueba } from "../adaptadores/bitrix/mapeo.js";
import { leerListaBlanca } from "../adaptadores/bitrix/politica-de-atencion.js";
import { SesionesDeBitrix } from "../adaptadores/bitrix/sesiones-bitrix.js";
import { crearServidorDeEventos } from "../adaptadores/bitrix/servidor-eventos.js";
import { TokensEnArchivo } from "../adaptadores/bitrix/tokens.js";
import { ConversacionesEnArchivos } from "../adaptadores/archivos/conversaciones-en-archivos.js";
import { ConfiguracionEnMemoria, RelojDelSistema } from "../adaptadores/memoria/repositorios.js";
import { crearClienteOpenAI } from "../adaptadores/openai/cliente.js";
import { LectorDeReciboOpenAI } from "../adaptadores/openai/lector-de-recibo.js";
import { ModeloConversacionalOpenAI } from "../adaptadores/openai/modelo-conversacional.js";
import { configuracionInicial } from "../aplicacion/configuracion-inicial.js";
import type { Dependencias } from "../aplicacion/dependencias.js";
import { leerEntorno, leerEntornoBitrix } from "../configuracion/entorno.js";

const RUTA_DE_EVENTOS = "/bitrix/eventos";

const entornoBitrix = leerEntornoBitrix();
const tokens = new TokensEnArchivo(entornoBitrix.BITRIX24_TOKENS_ARCHIVO);
const credenciales =
  entornoBitrix.BITRIX24_APP_CLIENT_ID && entornoBitrix.BITRIX24_APP_CLIENT_SECRET
    ? { clientId: entornoBitrix.BITRIX24_APP_CLIENT_ID, clientSecret: entornoBitrix.BITRIX24_APP_CLIENT_SECRET }
    : undefined;
const cliente = new ClienteBitrix(tokens, credenciales);
const mapeo = mapeoDelEmbudoDePrueba(entornoBitrix.BITRIX24_USUARIO_PRUEBA);
const urlDeEventos = new URL(RUTA_DE_EVENTOS, entornoBitrix.BITRIX24_URL_PUBLICA).toString();

const comandos: Record<string, () => Promise<void>> = {
  async "registrar-bot"() {
    const botId = await registrarBot(cliente, urlDeEventos);
    await tokens.guardar({ ...(await tokens.leer()), botId });
    console.log(`Bot registrado con id ${botId}; eventos en ${urlDeEventos}`);
  },

  async "crear-negociacion-prueba"() {
    const campos = await cliente.llamar<Record<string, { items?: { ID: string; VALUE: string }[] }>>("crm.deal.fields");
    const idDeOpcion = (campo: string, patron: RegExp) => campos[campo]?.items?.find((item) => patron.test(item.VALUE))?.ID;
    const contactoId = await cliente.llamar<number>("crm.contact.add", { fields: { NAME: "Mariana", LAST_NAME: "Prueba Pulso (ficticia)", SOURCE_ID: "OTHER" } });
    const negociacionId = await cliente.llamar<number>("crm.deal.add", {
      fields: {
        TITLE: "PRUEBA PULSO · Mariana (ficticia)",
        CATEGORY_ID: mapeo.embudo,
        STAGE_ID: mapeo.etapas.DOCUMENTACION,
        CONTACT_ID: contactoId,
        [mapeo.campos.dni]: "12345678",
        [mapeo.campos.provincia]: idDeOpcion(mapeo.campos.provincia, /catamarca/i),
        [mapeo.campos.convenio]: idDeOpcion(mapeo.campos.convenio, /linea propia/i),
        [mapeo.campos.situacionLaboral]: idDeOpcion(mapeo.campos.situacionLaboral, /^empleado publico provincial$/i),
        [mapeo.campos.empleador]: "Ministerio de Educación de Catamarca",
      },
    });
    console.log(`Negociación de prueba ${negociacionId} (contacto ${contactoId}) en el embudo ${mapeo.embudo}. Poné BITRIX24_NEGOCIACION_PRUEBA=${negociacionId}`);
  },

  async "crear-canal-prueba"() {
    const { botId } = await tokens.leer();
    if (!botId) throw new Error("Primero registrá el bot (registrar-bot)");
    const lineaId = await cliente.llamar<number>("imopenlines.config.add", {
      PARAMS: {
        LINE_NAME: "PRUEBA PULSO · Agente documental",
        ACTIVE: "Y",
        CRM: "Y",
        CRM_CREATE: "none",
        CRM_FORWARD: "N",
        QUEUE_TYPE: "all",
        QUEUE: [entornoBitrix.BITRIX24_USUARIO_PRUEBA],
        WELCOME_MESSAGE: "N",
        WELCOME_BOT_ENABLE: "Y",
        WELCOME_BOT_ID: botId,
        WELCOME_BOT_JOIN: "always",
        WELCOME_BOT_TIME: 0,
        WELCOME_BOT_LEFT: "queue",
      },
    });
    console.log(`Canal Abierto de prueba ${lineaId} con el bot ${botId}. Activá "Chat en vivo" para ese canal en el Contact Center y compartí el enlace público.`);
  },

  // Mudanza de servidor: apunta los eventos del bot (y el de cambio de negociación, si estaba suscripto) a
  // BITRIX24_URL_PUBLICA. Antes hay que cambiar la URL de la aplicación local en Bitrix: sólo acepta su mismo dominio.
  async "actualizar-url"() {
    const { botId } = await tokens.leer();
    if (!botId) throw new Error("Primero registrá el bot (registrar-bot)");
    await cliente.llamar("imbot.update", { BOT_ID: botId, FIELDS: { EVENT_MESSAGE_ADD: urlDeEventos, EVENT_WELCOME_MESSAGE: urlDeEventos, EVENT_BOT_DELETE: urlDeEventos } });
    console.log(`Bot ${botId}: eventos en ${urlDeEventos}`);
    const vinculados = await cliente.llamar<{ event: string; handler: string }[]>("event.get");
    const anteriores = vinculados.filter((e) => e.event.toUpperCase() === "ONCRMDEALUPDATE" && e.handler !== urlDeEventos && e.handler.endsWith(RUTA_DE_EVENTOS));
    for (const anterior of anteriores) await cliente.llamar("event.unbind", { event: "ONCRMDEALUPDATE", handler: anterior.handler });
    if (anteriores.length) {
      await cliente.llamar("event.bind", { event: "ONCRMDEALUPDATE", handler: urlDeEventos });
      console.log(`ONCRMDEALUPDATE → ${urlDeEventos}`);
    }
  },

  // El bot ya recibe sus propios eventos al registrarse; el cambio de negociación hay que pedirlo aparte.
  async "vincular-eventos"() {
    const vinculados = await cliente.llamar<{ event: string; handler: string }[]>("event.get");
    if (vinculados.some((e) => e.event.toUpperCase() === "ONCRMDEALUPDATE" && e.handler === urlDeEventos)) {
      console.log("ONCRMDEALUPDATE ya estaba vinculado");
      return;
    }
    await cliente.llamar("event.bind", { event: "ONCRMDEALUPDATE", handler: urlDeEventos });
    console.log(`ONCRMDEALUPDATE → ${urlDeEventos}`);
  },

  async "tomar-chat"() {
    const chatId = process.argv[3];
    if (!chatId) throw new Error("Falta el id del chat");
    if (!entornoBitrix.BITRIX24_USUARIO_AGENTE) throw new Error("Falta BITRIX24_USUARIO_AGENTE");
    const { botId } = await tokens.leer();
    if (!botId) throw new Error("Primero registrá el bot (registrar-bot)");
    console.log(await new SesionesDeBitrix(cliente, botId).tomarChat(chatId, entornoBitrix.BITRIX24_USUARIO_AGENTE));
  },

  async "copiar-negociacion"() {
    const negociacionId = /(\d+)\/?$/.exec(process.argv[3] ?? "")?.[1];
    if (!negociacionId) throw new Error("Falta el id o el enlace de la negociación");
    const copia = await copias.copiar(negociacionId);
    console.log(copia.esCopia ? `Negociación ${negociacionId} copiada en ${copia.negociacionId}` : `La negociación ${negociacionId} ya es del embudo de prueba`);
    console.log(`Etapa: ${copia.etapa} · mensajes de la conversación anterior: ${copia.mensajes.length}`);
  },

  async servir() {
    const { botId } = await tokens.leer();
    if (!botId) throw new Error("Primero registrá el bot (registrar-bot)");
    const listaBlanca = leerListaBlanca(entornoBitrix.AGENTE_LISTA_BLANCA);
    console.log(`Modo ${entornoBitrix.AGENTE_MODO}${entornoBitrix.BITRIX24_USUARIO_AGENTE ? ` · usuario del agente ${entornoBitrix.BITRIX24_USUARIO_AGENTE}` : ""}${listaBlanca ? ` · lista blanca de ${listaBlanca.telefonos.size} teléfono(s)` : " · sin lista blanca"}`);
    if (entornoBitrix.AGENTE_CLAVE_DE_PRUEBAS) console.log("Modo de prueba con negociaciones reales: encendido (AGENTE_CLAVE_DE_PRUEBAS)");
    const bot = new BotDeBitrix(
      {
        botId,
        negociacionDePrueba: entornoBitrix.BITRIX24_NEGOCIACION_PRUEBA,
        modo: entornoBitrix.AGENTE_MODO,
        usuarioAgente: entornoBitrix.BITRIX24_USUARIO_AGENTE,
        listaBlanca,
        claveDePruebas: entornoBitrix.AGENTE_CLAVE_DE_PRUEBAS,
      },
      { cliente, crm, fichas: new FichasDesdeBitrix(cliente, mapeo), sesiones: new SesionesDeBitrix(cliente, botId), copias, dependencias: armarDependencias(crm) },
    );
    crearServidorDeEventos(bot, { volcarEventosEn: entornoBitrix.AGENTE_VOLCAR_EVENTOS }).listen(entornoBitrix.BITRIX24_PUERTO_EVENTOS, () => console.log(`Agente escuchando eventos de Bitrix en :${entornoBitrix.BITRIX24_PUERTO_EVENTOS}${RUTA_DE_EVENTOS}`));
  },
};

const crm = new CrmBitrix(cliente, mapeo);
// La copia queda a nombre del usuario del agente (o del de prueba), nunca del vendedor de la negociación original.
const copias = new CopiaDeNegociacion(cliente, mapeo, entornoBitrix.BITRIX24_USUARIO_AGENTE ?? entornoBitrix.BITRIX24_USUARIO_PRUEBA);

function armarDependencias(crmReal: CrmBitrix): Dependencias {
  const entorno = leerEntorno();
  const openai = crearClienteOpenAI(entorno.OPENAI_API_KEY);
  return {
    modelo: new ModeloConversacionalOpenAI(openai, entorno.OPENAI_MODELO_CONVERSACION),
    lector: new LectorDeReciboOpenAI(openai, entorno.OPENAI_MODELO_LECTURA),
    ...(entorno.OPENAI_MODELO_LECTURA_RESPALDO && { lectorDeRespaldo: new LectorDeReciboOpenAI(openai, entorno.OPENAI_MODELO_LECTURA_RESPALDO) }),
    crm: crmReal,
    conversaciones: new ConversacionesEnArchivos(entornoBitrix.AGENTE_DATOS_CARPETA),
    configuracion: new ConfiguracionEnMemoria(configuracionInicial),
    reloj: new RelojDelSistema(),
  };
}

const comando = comandos[process.argv[2] ?? ""];
if (!comando) {
  console.error(`Comandos: ${Object.keys(comandos).join(", ")}`);
  process.exit(1);
}
comando().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
