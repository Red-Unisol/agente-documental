import type { Ficha } from "../tipos.js";
import type { Verificacion } from "../verificacion/verificar.js";

export type Etapa = "DOCUMENTACION" | "REVISION_DOCUMENTAL" | "DOCU_RECIBIDA" | "FALTA_DOCUMENTACION";

export type EstadoDeConversacion = "activa" | "derivada" | "documentacion_cargada";

export interface Archivo {
  id: string;
  nombre: string;
  tipoMime: string;
  bytes: Uint8Array;
}

export interface Mensaje {
  direccion: "entrante" | "saliente";
  texto: string;
  archivoId?: string;
  at: Date;
}

export interface EventoDeAuditoria {
  at: Date;
  tipo:
    | "escenario_cargado"
    | "lectura_de_recibo"
    | "verificacion"
    | "accion_crm"
    | "derivacion"
    | "herramienta_rechazada"
    | "dato_sensible_omitido"
    | "uso_de_modelo";
  detalle: Record<string, unknown>;
}

export interface Conversacion {
  id: string;
  chatId: string;
  ficha: Ficha;
  estado: EstadoDeConversacion;
  mensajes: Mensaje[];
  archivos: Archivo[];
  ultimaVerificacion?: Verificacion;
  auditoria: EventoDeAuditoria[];
}

export function nuevaConversacion(id: string, chatId: string, ficha: Ficha): Conversacion {
  return { id, chatId, ficha, estado: "activa", mensajes: [], archivos: [], auditoria: [] };
}

export function conMensaje(conversacion: Conversacion, mensaje: Mensaje): Conversacion {
  return { ...conversacion, mensajes: [...conversacion.mensajes, mensaje] };
}

export function conArchivo(conversacion: Conversacion, archivo: Archivo): Conversacion {
  return { ...conversacion, archivos: [...conversacion.archivos, archivo] };
}

export function conEvento(conversacion: Conversacion, evento: EventoDeAuditoria): Conversacion {
  return { ...conversacion, auditoria: [...conversacion.auditoria, evento] };
}

export function ultimoArchivo(conversacion: Conversacion): Archivo | undefined {
  return conversacion.archivos.at(-1);
}
