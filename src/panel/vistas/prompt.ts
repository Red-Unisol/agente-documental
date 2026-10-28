import type { Escenario } from "../../dominio/agente/escenarios.js";
import { definicionesDeHerramientas } from "../../dominio/agente/herramientas.js";
import { armarPromptDelSistema, type BloquesDelPrompt } from "../../dominio/agente/prompt.js";
import type { Ficha } from "../../dominio/tipos.js";
import { escapar, type Html } from "../html.js";
import { seccionHtml } from "./plantilla.js";

interface Entrada {
  bloques: BloquesDelPrompt;
  escenarios: Escenario[];
  fichaDeEjemplo: Ficha;
  hoy: Date;
  diaDeGracia: number;
}

const BLOQUES: { clave: keyof BloquesDelPrompt; titulo: string; para: string }[] = [
  { clave: "rol", titulo: "Rol", para: "Quién es y en nombre de quién habla." },
  { clave: "objetivo", titulo: "Objetivo", para: "Lo único que tiene que lograr en este paso." },
  { clave: "limites", titulo: "Qué no hace", para: "Las fronteras: ni aprueba, ni decide, ni ve más que la ficha." },
  { clave: "respuesta", titulo: "Forma de responder", para: "Tono, largo y orden de cada mensaje." },
];

// El prompt base es corto y fijo. Lo que varía por turno (la ficha del socio, el
// índice de escenarios y el escenario cargado) se muestra aparte para que se
// entienda qué es texto estable y qué entra en cada mensaje.
export function vistaDelPrompt(entrada: Entrada): Html {
  const bloques = BLOQUES.map(
    ({ clave, titulo, para }, i) => `
    <div class="campo">
      <label>${String(i + 1).padStart(2, "0")} · ${escapar(titulo)} <span style="text-transform:none;letter-spacing:0;color:#8A94AE">· ${escapar(para)}</span></label>
      <div class="valor">${escapar(entrada.bloques[clave])}</div>
    </div>`,
  ).join("");

  const herramientas = Object.entries(definicionesDeHerramientas)
    .map(([nombre, def]) => `<tr><td class="cod">${escapar(nombre)}</td><td>${escapar(def.descripcion)}</td></tr>`)
    .join("");

  const promptCompleto = armarPromptDelSistema({
    bloques: entrada.bloques,
    escenarios: entrada.escenarios,
    ficha: entrada.fichaDeEjemplo,
    hoy: entrada.hoy,
    diaDeGracia: entrada.diaDeGracia,
  });
  const palabras = promptCompleto.split(/\s+/).length;

  return `
  <div class="bloque">
    ${seccionHtml("A", "Cómo se arma cada turno")}
    <div class="celdas">
      <div><b>Fijo</b><strong>Prompt base</strong>Cuatro bloques cortos, iguales para todas las conversaciones. Son los de abajo.</div>
      <div><b>Por conversación</b><strong>Ficha del socio</strong>Nombre, provincia, convenio, empleo declarado y el período de recibo que se necesita. Sin DNI.</div>
      <div><b>Fijo</b><strong>Índice de escenarios</strong>Una línea por escenario: clave, nombre y cuándo aplica. Las instrucciones no van acá.</div>
      <div><b>Por turno</b><strong>Escenario cargado</strong>Antes de responder, el agente elige uno del índice y carga sólo sus instrucciones.</div>
      <div><b>Siempre</b><strong>Herramientas</strong>Cuatro, y ninguna más. Si el modelo inventa otra, el sistema la rechaza y lo registra.</div>
    </div>
    <p class="nota">Por eso el prompt no crece con cada caso nuevo: un escenario más es una línea más en el índice, no un párrafo más en el contexto.</p>
  </div>

  <div class="dos">
    <div class="bloque">
      ${seccionHtml("B", "Los cuatro bloques", "igual en todas las conversaciones")}
      ${bloques}
    </div>
    <div>
      <div class="bloque">
        ${seccionHtml("C", "Herramientas", `${Object.keys(definicionesDeHerramientas).length} disponibles`)}
        <div class="panel tabla-caja"><table><thead><tr><th style="width:36%">Nombre</th><th>Qué hace</th></tr></thead><tbody>${herramientas}</tbody></table></div>
        <p class="nota">No existe una herramienta para aprobar, rechazar, consultar otros socios ni tocar el ERP. El resultado de <span class="cod">revisar_recibo</span> lo decide el código con las reglas; el modelo sólo lo comunica.</p>
      </div>
      <div class="bloque">
        ${seccionHtml("D", "Prompt completo de ejemplo", `${palabras} palabras`)}
        <div class="campo"><label>Tal como lo recibe el modelo para una ficha de prueba · ${escapar(entrada.fichaDeEjemplo.nombre)}, ${escapar(entrada.fichaDeEjemplo.provincia)}</label>
        <div class="valor codigo">${escapar(promptCompleto)}</div></div>
        <p class="nota">Después de este texto, en cada turno, se suman el historial del chat y el escenario que el agente cargó. Nada más.</p>
      </div>
    </div>
  </div>`;
}
