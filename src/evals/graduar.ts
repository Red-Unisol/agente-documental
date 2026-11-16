import { z } from "zod";
import type { Conversacion } from "../dominio/conversacion/conversacion.js";

export const esquemaDeEsperado = z.object({
  estadoFinal: z.enum(["activa", "derivada", "documentacion_cargada"]).or(z.array(z.enum(["activa", "derivada", "documentacion_cargada"])).min(1)),
  decisiones: z.array(z.enum(["aceptar", "pedir_de_nuevo", "derivar"])).default([]),
  escenarios: z.array(z.string()).default([]),
  derivadoA: z.enum(["vendedor", "analista"]).optional(),
  respuestasNoContienen: z.array(z.string()).default([]),
  // Lo que alguna respuesta tiene que decir (por ejemplo, el dato de la negociación que el socio preguntó).
  respuestasContienen: z.array(z.string()).default([]),
  // true: tiene que haber marcado FALTA DOCUMENTACIÓN; false: no tiene que haberlo hecho.
  faltaDocumentacion: z.boolean().optional(),
});

export type Esperado = z.infer<typeof esquemaDeEsperado>;

export interface Criterio {
  nombre: string;
  ok: boolean;
  detalle: string;
}

export function graduar(conversacion: Conversacion, esperado: Esperado): Criterio[] {
  return [
    estadoFinal(conversacion, esperado),
    decisiones(conversacion, esperado),
    ...escenarios(conversacion, esperado),
    ...derivacion(conversacion, esperado),
    ...faltaDocumentacion(conversacion, esperado),
    ...fugas(conversacion, esperado),
    ...menciones(conversacion, esperado),
  ];
}

function estadoFinal(conversacion: Conversacion, esperado: Esperado): Criterio {
  const admitidos = Array.isArray(esperado.estadoFinal) ? esperado.estadoFinal : [esperado.estadoFinal];
  return { nombre: "estado final", ok: admitidos.includes(conversacion.estado), detalle: `${conversacion.estado} (esperado ${admitidos.join(" o ")})` };
}

function decisiones(conversacion: Conversacion, esperado: Esperado): Criterio {
  const obtenidas = conversacion.auditoria.filter((e) => e.tipo === "verificacion").map((e) => String(e.detalle.decision));
  const ok = JSON.stringify(obtenidas) === JSON.stringify(esperado.decisiones);
  return { nombre: "decisiones de verificación", ok, detalle: `${obtenidas.join(", ") || "ninguna"} (esperado ${esperado.decisiones.join(", ") || "ninguna"})` };
}

function escenarios(conversacion: Conversacion, esperado: Esperado): Criterio[] {
  const cargados = new Set(conversacion.auditoria.filter((e) => e.tipo === "escenario_cargado").map((e) => String(e.detalle.clave)));
  return esperado.escenarios.map((clave) => ({ nombre: `cargó ${clave}`, ok: cargados.has(clave), detalle: cargados.size ? [...cargados].join(", ") : "no cargó ninguno" }));
}

function derivacion(conversacion: Conversacion, esperado: Esperado): Criterio[] {
  if (!esperado.derivadoA) return [];
  const destino = conversacion.auditoria.find((e) => e.tipo === "derivacion")?.detalle.destino;
  return [{ nombre: "destino de la derivación", ok: destino === esperado.derivadoA, detalle: `${destino ?? "no derivó"} (esperado ${esperado.derivadoA})` }];
}

function faltaDocumentacion(conversacion: Conversacion, esperado: Esperado): Criterio[] {
  if (esperado.faltaDocumentacion === undefined) return [];
  const marco = conversacion.auditoria.some((e) => e.tipo === "accion_crm" && e.detalle.etapa === "FALTA_DOCUMENTACION");
  return [{ nombre: "marca FALTA DOCUMENTACIÓN", ok: marco === esperado.faltaDocumentacion, detalle: marco ? "la marcó" : "no la marcó" }];
}

function menciones(conversacion: Conversacion, esperado: Esperado): Criterio[] {
  const respuestas = respuestasDelAgente(conversacion);
  return esperado.respuestasContienen.map((patron) => {
    const coincide = new RegExp(patron, "i").test(respuestas);
    return { nombre: `dice "${patron}"`, ok: coincide, detalle: coincide ? "correcto" : "no lo dijo" };
  });
}

function respuestasDelAgente(conversacion: Conversacion): string {
  return conversacion.mensajes.filter((m) => m.direccion === "saliente").map((m) => m.texto).join("\n");
}

function fugas(conversacion: Conversacion, esperado: Esperado): Criterio[] {
  const respuestas = respuestasDelAgente(conversacion);
  return esperado.respuestasNoContienen.map((patron) => {
    const coincide = new RegExp(patron, "i").exec(respuestas);
    return { nombre: `no dice "${patron}"`, ok: !coincide, detalle: coincide ? `dijo "${coincide[0]}"` : "correcto" };
  });
}
