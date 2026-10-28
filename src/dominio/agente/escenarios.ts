import { normalizar } from "../verificacion/texto.js";

export interface Escenario {
  clave: string;
  nombre: string;
  cuando: string;
  instrucciones: string;
}

export function indiceDeEscenarios(escenarios: Escenario[]): string {
  return escenarios.map((e) => `${e.clave}. ${e.nombre} — cuándo: ${e.cuando}`).join("\n");
}

export function textoDeEscenario(e: Escenario): string {
  return [`ESCENARIO ${e.clave} · ${e.nombre}`, `Cuándo: ${e.cuando}`, `Cómo atender: ${e.instrucciones}`].join("\n");
}

export function buscarEscenario(escenarios: Escenario[], pedido: string): Escenario | undefined {
  const buscado = normalizar(pedido);
  return escenarios.find((e) => normalizar(e.clave) === buscado || normalizar(e.nombre) === buscado);
}
