import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { CrmSimulado } from "../adaptadores/memoria/crm-simulado.js";
import { ConfiguracionEnMemoria, ConversacionesEnMemoria, RelojDelSistema, RelojFijo } from "../adaptadores/memoria/repositorios.js";
import { crearClienteOpenAI } from "../adaptadores/openai/cliente.js";
import { LectorDeReciboOpenAI } from "../adaptadores/openai/lector-de-recibo.js";
import { ModeloConversacionalOpenAI } from "../adaptadores/openai/modelo-conversacional.js";
import { atenderMensaje, type ResultadoDeAtencion } from "../aplicacion/atender-mensaje.js";
import { configuracionInicial } from "../aplicacion/configuracion-inicial.js";
import type { Dependencias } from "../aplicacion/dependencias.js";
import { leerEntorno } from "../configuracion/entorno.js";
import { type Archivo, type Conversacion, nuevaConversacion } from "../dominio/conversacion/conversacion.js";
import type { Ficha } from "../dominio/tipos.js";

const TIPOS_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf" };

export interface Simulacion {
  conversacionId: string;
  crm: CrmSimulado;
  enviar(texto: string, rutaDeArchivo?: string): Promise<ResultadoDeAtencion>;
  conversacion(): Promise<Conversacion>;
}

export async function iniciarSimulacion(ficha: Ficha, hoy?: Date): Promise<Simulacion> {
  const entorno = leerEntorno();
  const cliente = crearClienteOpenAI(entorno.OPENAI_API_KEY);
  const crm = new CrmSimulado();
  const conversaciones = new ConversacionesEnMemoria();
  const dependencias: Dependencias = {
    modelo: new ModeloConversacionalOpenAI(cliente, entorno.OPENAI_MODELO_CONVERSACION),
    lector: new LectorDeReciboOpenAI(cliente, entorno.OPENAI_MODELO_LECTURA),
    crm,
    conversaciones,
    configuracion: new ConfiguracionEnMemoria(configuracionInicial),
    reloj: hoy ? new RelojFijo(hoy) : new RelojDelSistema(),
  };
  const conversacionId = "simulada";
  await conversaciones.guardar(nuevaConversacion(conversacionId, "chat-simulado", ficha));

  return {
    conversacionId,
    crm,
    async enviar(texto, rutaDeArchivo) {
      const archivo = rutaDeArchivo ? await cargarArchivo(rutaDeArchivo) : undefined;
      return atenderMensaje({ conversacionId, texto, ...(archivo && { archivo }) }, dependencias);
    },
    async conversacion() {
      const actual = await conversaciones.obtener(conversacionId);
      if (!actual) throw new Error("La conversación simulada no existe");
      return actual;
    },
  };
}

async function cargarArchivo(ruta: string): Promise<Archivo> {
  const tipoMime = TIPOS_MIME[extname(ruta).toLowerCase()];
  if (!tipoMime) throw new Error(`Tipo de archivo no soportado: ${ruta}`);
  return { id: `archivo-${Date.now()}`, nombre: basename(ruta), tipoMime, bytes: new Uint8Array(await readFile(ruta)) };
}
