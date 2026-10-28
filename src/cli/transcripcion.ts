import type { AccionSimulada } from "../adaptadores/memoria/crm-simulado.js";
import type { Conversacion, EventoDeAuditoria } from "../dominio/conversacion/conversacion.js";

export function transcripcionEnMarkdown(titulo: string, conversacion: Conversacion, acciones: AccionSimulada[]): string {
  return [
    `# ${titulo}`,
    "",
    `Ficha: ${conversacion.ficha.nombre} · ${conversacion.ficha.sectorDeclarado} · ${conversacion.ficha.empleadorDeclarado} · ${conversacion.ficha.provincia} · convenio ${conversacion.ficha.convenio}`,
    "",
    "## Conversación",
    "",
    ...conversacion.mensajes.map(lineaDeMensaje),
    "",
    "## Qué hizo el agente por detrás",
    "",
    ...conversacion.auditoria.map(lineaDeEvento),
    "",
    "## Acciones en el CRM (simulado)",
    "",
    ...(acciones.length ? acciones.map(lineaDeAccion) : ["(ninguna)"]),
    "",
    `Estado final: ${conversacion.estado}`,
  ].join("\n");
}

function lineaDeMensaje(mensaje: Conversacion["mensajes"][number]): string {
  const quien = mensaje.direccion === "entrante" ? "**Socio**" : "**Agente**";
  const adjunto = mensaje.archivoId ? " 📎" : "";
  return `${quien}${adjunto}: ${mensaje.texto}\n`;
}

function lineaDeEvento(evento: EventoDeAuditoria): string {
  switch (evento.tipo) {
    case "escenario_cargado":
      return `- Cargó el escenario ${evento.detalle.clave} · ${evento.detalle.nombre}`;
    case "lectura_de_recibo":
      return `- Leyó \`${evento.detalle.archivo}\`: ${resumenDeLectura(evento.detalle)}`;
    case "verificacion":
      return `- Verificación → **${evento.detalle.decision}**\n${chequeos(evento.detalle.chequeos)}`;
    case "accion_crm":
      return `- CRM: ${evento.detalle.accion} → ${evento.detalle.etapa}`;
    case "derivacion":
      return `- Derivó a ${evento.detalle.destino}: ${evento.detalle.motivo}`;
    case "herramienta_rechazada":
      return `- Herramienta rechazada: ${evento.detalle.herramienta} (${evento.detalle.error})`;
  }
}

function resumenDeLectura(detalle: Record<string, unknown>): string {
  const periodo = detalle.periodo as { anio: number; mes: number } | undefined;
  return [
    detalle.esReciboDeSueldo ? "es recibo" : "no es recibo",
    detalle.legible ? "legible" : "ilegible",
    detalle.empleador ? `empleador "${detalle.empleador}"` : "sin empleador",
    periodo ? `período ${periodo.mes}/${periodo.anio}` : "sin período",
    `sector ${detalle.sector}`,
    detalle.provincia ? `provincia ${detalle.provincia}` : "sin provincia",
    `CUIL ${detalle.cuil}`,
  ].join(", ");
}

function chequeos(valor: unknown): string {
  if (!Array.isArray(valor)) return "";
  return valor.map((c: { ok: boolean; nombre: string; detalle: string }) => `  - ${c.ok ? "✓" : "✗"} ${c.nombre}: ${c.detalle}`).join("\n");
}

function lineaDeAccion(accion: AccionSimulada): string {
  switch (accion.tipo) {
    case "recibo_cargado":
      return `- Recibo \`${accion.archivo}\` cargado en la negociación ${accion.negociacionId}`;
    case "etapa":
      return `- Negociación ${accion.negociacionId} → etapa ${accion.etapa}`;
    case "transferencia":
      return `- Chat transferido a ${accion.destino}: ${accion.motivo}`;
  }
}
