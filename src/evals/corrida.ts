import type { AccionSimulada } from "../adaptadores/memoria/crm-simulado.js";
import type { Conversacion, EventoDeAuditoria, Mensaje } from "../dominio/conversacion/conversacion.js";
import { type ResumenDeUso, resumenDeUso } from "../dominio/costos/resumen.js";
import { tarifasOpenAI } from "../dominio/costos/tarifas.js";
import type { Ficha } from "../dominio/tipos.js";
import type { Criterio } from "./graduar.js";

export interface CasoCorrido {
  archivo: string;
  nombre: string;
  ficha: Ficha;
  paso: boolean;
  criterios: Criterio[];
  estadoFinal: Conversacion["estado"];
  mensajes: Mensaje[];
  auditoria: EventoDeAuditoria[];
  acciones: AccionSimulada[];
  uso: ResumenDeUso;
  usoDeLectura: ResumenDeUso;
}

export interface Corrida {
  id: string;
  fecha: string;
  modelos: { conversacion: string; lectura: string };
  casos: CasoCorrido[];
  total: { pasaron: number; casos: number; costoUsd: number | undefined; milisegundos: number };
}

export function registrarCaso(archivo: string, nombre: string, conversacion: Conversacion, acciones: AccionSimulada[], criterios: Criterio[]): CasoCorrido {
  return {
    archivo,
    nombre,
    ficha: conversacion.ficha,
    paso: criterios.every((c) => c.ok),
    criterios,
    estadoFinal: conversacion.estado,
    mensajes: conversacion.mensajes,
    auditoria: conversacion.auditoria,
    acciones,
    uso: resumenDeUso(conversacion, tarifasOpenAI),
    usoDeLectura: resumenDeUso(conversacion, tarifasOpenAI, "lectura"),
  };
}

export function armarCorrida(modelos: Corrida["modelos"], casos: CasoCorrido[], fecha = new Date()): Corrida {
  const costos = casos.map((c) => c.uso.costoUsd);
  return {
    id: `${fecha.toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${modelos.conversacion}`,
    fecha: fecha.toISOString(),
    modelos,
    casos,
    total: {
      pasaron: casos.filter((c) => c.paso).length,
      casos: casos.length,
      costoUsd: costos.every((c) => c !== undefined) ? costos.reduce((a, b) => a + b, 0) : undefined,
      milisegundos: casos.reduce((total, c) => total + c.uso.milisegundos, 0),
    },
  };
}
