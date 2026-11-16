import type { Ficha } from "../tipos.js";
import { nombreDePeriodo, periodosAdmitidos } from "../verificacion/periodo.js";
import { type Escenario, indiceDeEscenarios } from "./escenarios.js";
import { HERRAMIENTA_CARGAR_ESCENARIO } from "./herramientas.js";

export interface BloquesDelPrompt {
  rol: string;
  objetivo: string;
  limites: string;
  respuesta: string;
}

interface Entrada {
  bloques: BloquesDelPrompt;
  escenarios: Escenario[];
  ficha: Ficha;
  hoy: Date;
  diaDeGracia: number;
}

export function armarPromptDelSistema(entrada: Entrada): string {
  return [
    seccion("ROL", entrada.bloques.rol),
    seccion("OBJETIVO", entrada.bloques.objetivo),
    seccion("QUÉ NO HACÉS", entrada.bloques.limites),
    seccion("FORMA DE RESPONDER", entrada.bloques.respuesta),
    seccion("FICHA DEL SOCIO (lo único que sabés de él)", textoDeFicha(entrada)),
    seccion("ESCENARIOS", textoDeIndice(entrada.escenarios)),
  ].join("\n\n");
}

function seccion(titulo: string, cuerpo: string): string {
  return `${titulo}:\n${cuerpo}`;
}

function textoDeFicha({ ficha, hoy, diaDeGracia }: Entrada): string {
  const admitidos = periodosAdmitidos(hoy, diaDeGracia).map(nombreDePeriodo).join(" o ");
  return [
    `Nombre: ${ficha.nombre}`,
    `Provincia: ${ficha.provincia}`,
    `Convenio: ${ficha.convenio}`,
    `Situación declarada: ${ficha.situacionDeclarada ?? (ficha.sectorDeclarado === "publico" ? "empleo público" : "empleo privado")}${ficha.empleadorDeclarado ? `, en ${ficha.empleadorDeclarado}` : ""}`,
    esJubilado(ficha) ? "Es jubilado/a o pensionado/a: hablá de «recibo de haberes», no de «recibo de sueldo» ni de «empleador» ni de «trabajás en»." : "Es personal activo.",
    `Recibo que necesitamos: el de ${admitidos}`,
    "El DNI y el CUIL los verifica el sistema, no vos: nunca los pidas ni los repitas.",
  ].join("\n");
}

function esJubilado(ficha: Ficha): boolean {
  return /jubilad|pensionad|haberes pasivos|caja de jubilaciones|anses/i.test(`${ficha.situacionDeclarada ?? ""} ${ficha.empleadorDeclarado ?? ""}`);
}

function textoDeIndice(escenarios: Escenario[]): string {
  return [
    "Es un índice: las instrucciones completas no están acá.",
    `En cada turno, primero elegí el escenario que mejor encaja y cargalo con ${HERRAMIENTA_CARGAR_ESCENARIO}; recién después respondé siguiendo sus instrucciones. Podés cargar más de uno si hace falta. Sólo si ninguno encaja respondé con las reglas generales.`,
    indiceDeEscenarios(escenarios),
  ].join("\n");
}
