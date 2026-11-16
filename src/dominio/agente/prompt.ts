import type { DatoDeNegociacion, EstadoDeNegociacion, Ficha } from "../tipos.js";
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
  // Cómo está la negociación en el CRM en este momento. Sin definir si no se pudo leer: el agente sigue sólo con la ficha.
  negociacion?: EstadoDeNegociacion | undefined;
  hoy: Date;
  diaDeGracia: number;
}

export function armarPromptDelSistema(entrada: Entrada): string {
  return [
    seccion("ROL", entrada.bloques.rol),
    seccion("OBJETIVO", entrada.bloques.objetivo),
    seccion("QUÉ NO HACÉS", entrada.bloques.limites),
    seccion("FORMA DE RESPONDER", entrada.bloques.respuesta),
    seccion("FICHA DEL SOCIO", textoDeFicha(entrada)),
    ...(entrada.negociacion?.datos.length ? [seccion("DATOS DE SU NEGOCIACIÓN (lo que figura hoy en el sistema; es lo único que sabés de su solicitud)", textoDeDatos(entrada.negociacion.datos))] : []),
    seccion("ESCENARIOS", textoDeIndice(entrada.escenarios)),
  ].join("\n\n");
}

function seccion(titulo: string, cuerpo: string): string {
  return `${titulo}:\n${cuerpo}`;
}

function textoDeFicha({ ficha, hoy, diaDeGracia, negociacion }: Entrada): string {
  const admitidos = periodosAdmitidos(hoy, diaDeGracia).map(nombreDePeriodo).join(" o ");
  return [
    `Nombre: ${ficha.nombre}`,
    `Provincia: ${ficha.provincia}`,
    `Convenio: ${ficha.convenio}`,
    `Situación declarada: ${ficha.situacionDeclarada ?? (ficha.sectorDeclarado === "publico" ? "empleo público" : "empleo privado")}${ficha.empleadorDeclarado ? `, en ${ficha.empleadorDeclarado}` : ""}`,
    esJubilado(ficha) ? "Es jubilado/a o pensionado/a: hablá de «recibo de haberes», no de «recibo de sueldo» ni de «empleador» ni de «trabajás en»." : "Es personal activo.",
    negociacion?.hayQuePedirElRecibo === false
      ? `Recibo: hoy NO hay que pedírselo (ya está cargado o su solicitud está en una etapa posterior a la documentación). No lo pidas ni en el saludo ni al cerrar un mensaje, aunque un escenario lo indique: saludá, respondé lo que pregunta y decile que su solicitud sigue con el equipo de Red Unisol. Si manda un recibo por su cuenta, revisalo igual; el que sirve es el de ${admitidos}.`
      : `Recibo que necesitamos: el de ${admitidos}`,
    "El DNI y el CUIL los verifica el sistema, no vos: nunca los pidas ni los repitas.",
  ].join("\n");
}

function textoDeDatos(datos: DatoDeNegociacion[]): string {
  return datos.map((dato) => `${dato.etiqueta}: ${dato.valor}`).join("\n");
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
