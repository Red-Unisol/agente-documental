// Puesta en marcha del agente dentro de Bitrix (embudo de prueba):
//   tsx src/cli/bitrix.ts registrar-bot              registra el chatbot de Canales Abiertos
//   tsx src/cli/bitrix.ts crear-negociacion-prueba   crea una negociación ficticia en el embudo 19
//   tsx src/cli/bitrix.ts crear-canal-prueba         crea un Canal Abierto de prueba atendido por el bot
//   tsx src/cli/bitrix.ts servir                     escucha los eventos y atiende los chats
import { BotDeBitrix, registrarBot } from "../adaptadores/bitrix/bot.js";
import { ClienteBitrix } from "../adaptadores/bitrix/cliente-rest.js";
import { CrmBitrix } from "../adaptadores/bitrix/crm-bitrix.js";
import { FichasDesdeBitrix } from "../adaptadores/bitrix/fichas-bitrix.js";
import { mapeoDelEmbudoDePrueba } from "../adaptadores/bitrix/mapeo.js";
import { crearServidorDeEventos } from "../adaptadores/bitrix/servidor-eventos.js";
import { TokensEnArchivo } from "../adaptadores/bitrix/tokens.js";
import { ConfiguracionEnMemoria, ConversacionesEnMemoria, RelojDelSistema } from "../adaptadores/memoria/repositorios.js";
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
        [mapeo.campos.convenio]: idDeOpcion(mapeo.campos.convenio, /catamarca/i),
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

  async servir() {
    const { botId } = await tokens.leer();
    if (!botId) throw new Error("Primero registrá el bot (registrar-bot)");
    const bot = new BotDeBitrix({ botId, negociacionDePrueba: entornoBitrix.BITRIX24_NEGOCIACION_PRUEBA }, { cliente, crm, fichas: new FichasDesdeBitrix(cliente, mapeo), dependencias: armarDependencias(crm) });
    crearServidorDeEventos(bot).listen(entornoBitrix.BITRIX24_PUERTO_EVENTOS, () => console.log(`Agente escuchando eventos de Bitrix en :${entornoBitrix.BITRIX24_PUERTO_EVENTOS}${RUTA_DE_EVENTOS}`));
  },
};

const crm = new CrmBitrix(cliente, mapeo);

function armarDependencias(crmReal: CrmBitrix): Dependencias {
  const entorno = leerEntorno();
  const openai = crearClienteOpenAI(entorno.OPENAI_API_KEY);
  return {
    modelo: new ModeloConversacionalOpenAI(openai, entorno.OPENAI_MODELO_CONVERSACION),
    lector: new LectorDeReciboOpenAI(openai, entorno.OPENAI_MODELO_LECTURA),
    crm: crmReal,
    conversaciones: new ConversacionesEnMemoria(),
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
