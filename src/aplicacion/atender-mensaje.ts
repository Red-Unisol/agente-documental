import { HERRAMIENTA_CARGAR_ESCENARIO, nombresDeHerramientas } from "../dominio/agente/herramientas.js";
import { armarPromptDelSistema } from "../dominio/agente/prompt.js";
import { type Archivo, type Conversacion, conArchivo, conEvento, conMensaje } from "../dominio/conversacion/conversacion.js";
import { omitirIdentificadores } from "../dominio/conversacion/datos-sensibles.js";
import type { ConfiguracionDelAgente } from "../puertos/repositorios.js";
import type { Dependencias } from "./dependencias.js";
import { ejecutarHerramienta } from "./ejecutar-herramienta.js";
import { conHistorialResumidoSiHaceFalta, historialParaElModelo } from "./historial.js";

const MAXIMO_DE_VUELTAS = 6;

export interface MensajeEntrante {
  conversacionId: string;
  texto: string;
  // Un mensaje puede traer más de un archivo (el DNI por un lado y el recibo por otro).
  archivos?: Archivo[];
}

export type ResultadoDeAtencion =
  | { tipo: "respondio"; texto: string; conversacion: Conversacion }
  | { tipo: "silencio"; motivo: string; conversacion: Conversacion };

export async function atenderMensaje(entrante: MensajeEntrante, dependencias: Dependencias): Promise<ResultadoDeAtencion> {
  const existente = await dependencias.conversaciones.obtener(entrante.conversacionId);
  if (!existente) throw new Error(`No existe la conversación ${entrante.conversacionId}`);
  if (existente.estado === "derivada") return { tipo: "silencio", motivo: "La conversación ya fue derivada a una persona", conversacion: existente };

  const configuracion = await dependencias.configuracion.obtener();
  const registrada = registrarEntrante(existente, entrante, dependencias.reloj.ahora());
  const conversacion = await conHistorialResumidoSiHaceFalta(registrada, dependencias);
  const resultado = await conversar(conversacion, configuracion, dependencias);
  await dependencias.conversaciones.guardar(resultado.conversacion);
  return resultado;
}

function registrarEntrante(conversacion: Conversacion, entrante: MensajeEntrante, at: Date): Conversacion {
  const archivos = entrante.archivos ?? [];
  const conArchivos = archivos.reduce(conArchivo, conversacion);
  const ultimo = archivos.at(-1);
  return conMensaje(conArchivos, { direccion: "entrante" as const, texto: entrante.texto, at, ...(ultimo && { archivoId: ultimo.id }) });
}

async function conversar(inicial: Conversacion, configuracion: ConfiguracionDelAgente, dependencias: Dependencias): Promise<ResultadoDeAtencion> {
  const sistema = armarPromptDelSistema({
    bloques: configuracion.bloques,
    escenarios: configuracion.escenarios,
    ficha: inicial.ficha,
    negociacion: await estadoDeLaNegociacion(inicial, dependencias),
    hoy: dependencias.reloj.ahora(),
    diaDeGracia: configuracion.reglas.diaDeGracia,
  });
  const mensajes = historialParaElModelo(inicial);
  let conversacion = inicial;

  for (let vuelta = 0; vuelta < MAXIMO_DE_VUELTAS; vuelta++) {
    const primeraVuelta = vuelta === 0;
    const respuesta = await dependencias.modelo.completar({
      sistema,
      mensajes,
      herramientas: nombresDeHerramientas,
      ...(primeraVuelta && { herramientaObligatoria: HERRAMIENTA_CARGAR_ESCENARIO }),
    });
    conversacion = conEvento(conversacion, { at: dependencias.reloj.ahora(), tipo: "uso_de_modelo", detalle: { proposito: "conversacion", ...respuesta.uso } });
    if (respuesta.tipo === "texto") return responder(conversacion, respuesta.texto, dependencias.reloj.ahora());

    mensajes.push({ rol: "asistente_llama", llamadas: respuesta.llamadas });
    for (const llamada of respuesta.llamadas) {
      const ejecucion = await ejecutarHerramienta(llamada, { conversacion, configuracion, dependencias });
      conversacion = ejecucion.conversacion;
      mensajes.push({ rol: "resultado", llamadaId: llamada.id, nombre: llamada.nombre, resultado: ejecucion.resultado });
    }
  }
  return { tipo: "silencio", motivo: "El modelo no llegó a una respuesta", conversacion };
}

// Si el CRM no contesta, el agente sigue atendiendo con la ficha: sólo no puede responder consultas sobre la negociación.
async function estadoDeLaNegociacion(conversacion: Conversacion, dependencias: Dependencias) {
  try {
    return await dependencias.crm.estadoDeNegociacion(conversacion.ficha.negociacionId);
  } catch {
    return undefined;
  }
}

// Si el modelo derivó y no dijo nada, el socio igual tiene que enterarse de que alguien lo va a seguir.
const DESPEDIDA_AL_DERIVAR = "Una persona de Red Unisol te va a contactar para seguir.";

function responder(conversacion: Conversacion, textoDelModelo: string, at: Date): ResultadoDeAtencion {
  const textoBase = textoDelModelo.trim() || (conversacion.estado === "derivada" ? DESPEDIDA_AL_DERIVAR : "");
  if (!textoBase) return { tipo: "silencio", motivo: "El modelo devolvió una respuesta vacía", conversacion };
  const { texto, omitidos } = omitirIdentificadores(textoBase);
  const auditada = omitidos.length ? conEvento(conversacion, { at, tipo: "dato_sensible_omitido", detalle: { tipos: omitidos } }) : conversacion;
  return { tipo: "respondio", texto, conversacion: conMensaje(auditada, { direccion: "saliente", texto, at }) };
}
