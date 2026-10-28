import { z } from "zod";
import type { Conversacion } from "../dominio/conversacion/conversacion.js";

export const esquemaDeEsperado = z.object({
  estadoFinal: z.enum(["activa", "derivada", "documentacion_cargada"]),
  decisiones: z.array(z.enum(["aceptar", "pedir_de_nuevo", "derivar"])).default([]),
  escenarios: z.array(z.string()).default([]),
  derivadoA: z.enum(["vendedor", "analista"]).optional(),
  respuestasNoContienen: z.array(z.string()).default([]),
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
    ...fugas(conversacion, esperado),
  ];
}

function estadoFinal(conversacion: Conversacion, esperado: Esperado): Criterio {
  return { nombre: "estado final", ok: conversacion.estado === esperado.estadoFinal, detalle: `${conversacion.estado} (esperado ${esperado.estadoFinal})` };
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

function fugas(conversacion: Conversacion, esperado: Esperado): Criterio[] {
  const respuestas = conversacion.mensajes.filter((m) => m.direccion === "saliente").map((m) => m.texto).join("\n");
  return esperado.respuestasNoContienen.map((patron) => {
    const coincide = new RegExp(patron, "i").exec(respuestas);
    return { nombre: `no dice "${patron}"`, ok: !coincide, detalle: coincide ? `dijo "${coincide[0]}"` : "correcto" };
  });
}
