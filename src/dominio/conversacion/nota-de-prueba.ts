import type { EstadoDeNegociacion, Ficha } from "../tipos.js";
import type { Conversacion, EventoDeAuditoria } from "./conversacion.js";

// En una conversación de prueba, quien prueba recibe al lado de cada respuesta una nota con los datos
// que el agente tuvo a la vista y los pasos que dio. El modelo no deja un razonamiento escrito: lo que
// se puede mostrar es con qué trabajó (la ficha y los datos de la negociación) y qué hizo (escenario,
// lectura del archivo, verificación, acciones). La nota no lleva nombre, DNI ni CUIL.

const ENCABEZADO = "NOTA DE PRUEBA · el socio no ve esto";

export function esDePrueba(conversacion: Conversacion): boolean {
  return conversacion.auditoria.some((evento) => evento.tipo === "modo_de_prueba");
}

// Al arrancar la prueba: todo lo que el agente sabe de la negociación.
export function notaDeLoQueTiene(ficha: Ficha, negociacion: EstadoDeNegociacion | undefined): string {
  const situacion = `${ficha.situacionDeclarada ?? (ficha.sectorDeclarado === "publico" ? "empleo público" : "empleo privado")}${ficha.empleadorDeclarado ? `, en ${ficha.empleadorDeclarado}` : ""}`;
  return [
    ENCABEZADO,
    "Lo que el agente tiene de esta negociación:",
    `- Provincia: ${ficha.provincia || "sin cargar"}`,
    `- Convenio: ${ficha.convenio}`,
    `- Situación declarada: ${situacion}`,
    ...(negociacion?.datos ?? []).map((dato) => `- ${dato.etiqueta}: ${dato.valor}`),
    `- ${lineaDelRecibo(negociacion)}`,
  ].join("\n");
}

// Después de cada respuesta: los pasos de ese turno y cómo vio la negociación al empezarlo.
export function notaDelTurno(negociacion: EstadoDeNegociacion | undefined, eventos: EventoDeAuditoria[], conversacion: Conversacion): string {
  const pasos = eventos.flatMap((evento) => paso(evento));
  const etapa = negociacion?.datos.find((dato) => dato.etiqueta === "Etapa de la solicitud")?.valor;
  return [
    ENCABEZADO,
    `Cómo vio la negociación: ${[...(etapa ? [`etapa ${etapa}`] : []), lineaDelRecibo(negociacion)].join(" · ")}`,
    "Qué hizo en este mensaje:",
    ...(pasos.length ? pasos.map((linea) => `- ${linea}`) : ["- Respondió sin cargar un escenario ni usar herramientas."]),
    ...(conversacion.estado === "derivada" ? [AVISO_DE_DERIVADA] : []),
  ].join("\n");
}

const AVISO_DE_DERIVADA = "La conversación quedó derivada a una persona y el agente ya no contesta. En modo de prueba el chat no se transfiere: para empezar de cero, mandá de nuevo el enlace con la clave.";

export function notaDeConversacionDerivada(): string {
  return `${ENCABEZADO}\n${AVISO_DE_DERIVADA}`;
}

function lineaDelRecibo(negociacion: EstadoDeNegociacion | undefined): string {
  if (!negociacion) return "no pudo leer la negociación: trabaja sólo con la ficha";
  return negociacion.hayQuePedirElRecibo ? "tiene que pedir el recibo" : "no tiene que pedir el recibo (ya está cargado, o la solicitud está en revisión o más adelante)";
}

function paso(evento: EventoDeAuditoria): string[] {
  const detalle = evento.detalle;
  switch (evento.tipo) {
    case "escenario_cargado":
      return [`Cargó el escenario ${detalle.clave} · ${detalle.nombre}`];
    case "lectura_de_recibo":
      return [`Leyó el archivo ${detalle.archivo}: ${resumenDeLectura(detalle)}`];
    case "verificacion":
      return [`Verificación del sistema: ${detalle.decision}${chequeosFallidos(detalle.chequeos)}`];
    case "accion_crm":
      if (detalle.accion === "cargar_recibo") return [`En Bitrix: cargó el recibo en la negociación${detalle.etapa ? ` y la pasó a ${detalle.etapa}` : " y no la movió de etapa"}`];
      return [`En Bitrix: pasó la negociación a ${detalle.etapa}${detalle.motivo ? `. Motivo: ${detalle.motivo}` : ""}`];
    case "derivacion":
      return [`Derivó a ${detalle.destino}. Motivo interno: ${detalle.motivo}`];
    case "herramienta_rechazada":
      return [`Quiso usar ${detalle.herramienta} y el sistema no lo dejó: ${detalle.error}`];
    case "dato_sensible_omitido":
      return [`El filtro de salida quitó de la respuesta: ${(detalle.tipos as string[]).join(", ")}`];
    case "uso_de_modelo":
    case "modo_de_prueba":
      return [];
  }
}

function resumenDeLectura(detalle: Record<string, unknown>): string {
  const periodo = detalle.periodo as { anio: number; mes: number } | undefined;
  return [
    detalle.esReciboDeSueldo ? "es un recibo" : "no es un recibo",
    detalle.legible ? "legible" : "no se lee bien",
    detalle.empleador ? `empleador «${detalle.empleador}»` : "sin empleador",
    periodo ? `período ${periodo.mes}/${periodo.anio}` : "sin período",
    detalle.provincia ? `provincia ${detalle.provincia}` : "sin provincia",
  ].join(", ");
}

function chequeosFallidos(chequeos: unknown): string {
  if (!Array.isArray(chequeos)) return "";
  const fallidos = (chequeos as { ok: boolean; nombre: string; detalle: string }[]).filter((chequeo) => !chequeo.ok);
  return fallidos.length ? `. No pasó: ${fallidos.map((chequeo) => `${chequeo.nombre} (${chequeo.detalle})`).join("; ")}` : ". Pasó todos los chequeos";
}
