import type { Conversacion } from "../dominio/conversacion/conversacion.js";
import { conResumen } from "../dominio/conversacion/conversacion.js";
import type { MensajeParaElModelo } from "../puertos/modelo-conversacional.js";
import type { Dependencias } from "./dependencias.js";

// Las conversaciones de este agente son cortas (5 a 15 mensajes) y el modelo las ve enteras.
// Esto es una válvula de seguridad para el caso raro de un chat que se estira durante días:
// pasado el umbral, los últimos mensajes van literales y lo anterior va resumido.
export const UMBRAL_DE_MENSAJES = 100;
export const MENSAJES_LITERALES = 99;
// Para no pedir un resumen nuevo en cada turno, se rehace cuando la parte literal creció este tanto.
const MARGEN_PARA_RESUMIR = 20;

export function historialParaElModelo(conversacion: Conversacion): MensajeParaElModelo[] {
  const desde = conversacion.resumen?.mensajesCubiertos ?? 0;
  const literales = conversacion.mensajes.slice(desde).map((mensaje): MensajeParaElModelo => {
    if (mensaje.direccion === "saliente") return { rol: "asistente", texto: mensaje.texto };
    const adjunto = mensaje.archivoId ? ` [${resultadoDelArchivo(conversacion, mensaje.archivoId)}]` : "";
    return { rol: "usuario", texto: `${mensaje.texto}${adjunto}`.trim() };
  });
  if (!conversacion.resumen) return literales;
  return [
    { rol: "usuario", texto: `[Resumen de los primeros ${desde} mensajes de esta conversación, que ya no se muestran: ${conversacion.resumen.texto}]` },
    { rol: "asistente", texto: "Entendido, sigo desde ahí." },
    ...literales,
  ];
}

export async function conHistorialResumidoSiHaceFalta(conversacion: Conversacion, dependencias: Dependencias): Promise<Conversacion> {
  const total = conversacion.mensajes.length;
  const cubiertos = conversacion.resumen?.mensajesCubiertos ?? 0;
  const literalesHoy = total - cubiertos;
  const primeraVez = !conversacion.resumen && total > UMBRAL_DE_MENSAJES;
  const quedoCorto = conversacion.resumen && literalesHoy > MENSAJES_LITERALES + MARGEN_PARA_RESUMIR;
  if (!primeraVez && !quedoCorto) return conversacion;

  const hasta = total - MENSAJES_LITERALES;
  const { resumen: _previo, ...sinResumen } = conversacion;
  const aResumir = historialParaElModelo({ ...sinResumen, mensajes: conversacion.mensajes.slice(cubiertos, hasta) });
  const previo = conversacion.resumen ? `Resumen previo (mensajes 1 a ${cubiertos}): ${conversacion.resumen.texto}\n\n` : "";
  const respuesta = await dependencias.modelo.completar({
    sistema: INSTRUCCIONES_DE_RESUMEN,
    mensajes: [
      { rol: "usuario", texto: `${previo}Conversación a resumir (mensajes ${cubiertos + 1} a ${hasta}):\n${aResumir.map((m) => `${m.rol === "usuario" ? "Socio" : "Agente"}: ${"texto" in m ? m.texto : ""}`).join("\n")}` },
    ],
    herramientas: [],
  });
  const texto = respuesta.tipo === "texto" ? respuesta.texto.trim() : "";
  const at = dependencias.reloj.ahora();
  const auditada = { ...conversacion, auditoria: [...conversacion.auditoria, { at, tipo: "uso_de_modelo" as const, detalle: { proposito: "resumen", ...respuesta.uso } }] };
  return texto ? conResumen(auditada, { mensajesCubiertos: hasta, texto }) : auditada;
}

const INSTRUCCIONES_DE_RESUMEN = [
  "Resumís, para un asistente que continúa la conversación, lo que pasó hasta acá entre un socio y el agente documental de una mutual.",
  "En un párrafo corto y en tercera persona: qué pidió el agente, qué mandó el socio y qué resultado tuvo cada archivo (aceptado, rechazado y por qué, derivado), qué quedó pendiente, y cualquier dato que el socio haya dicho y haga falta recordar (por ejemplo que escribe un familiar, o que lo manda otro día).",
  "No inventes nada, no agregues consejos, no incluyas números de documento ni CUIL.",
].join(" ");

function resultadoDelArchivo(conversacion: Conversacion, archivoId: string): string {
  const verificacion = conversacion.auditoria.find((e) => e.tipo === "verificacion" && e.detalle.archivoId === archivoId);
  if (!verificacion) return "el socio adjuntó un archivo que todavía no se revisó";
  const motivos = Array.isArray(verificacion.detalle.motivos) ? verificacion.detalle.motivos.join("; ") : "";
  switch (verificacion.detalle.decision) {
    case "aceptar":
      return "el socio adjuntó un archivo: recibo aceptado y cargado";
    case "derivar":
      return "el socio adjuntó un archivo: derivado a una persona";
    default:
      return `el socio adjuntó un archivo: no sirvió (${motivos || "se pidió de nuevo"})`;
  }
}
