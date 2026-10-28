import type { Escenario } from "../../dominio/agente/escenarios.js";
import type { Corrida } from "../../evals/corrida.js";
import { chip, escapar, type Html } from "../html.js";
import { seccionHtml } from "./plantilla.js";

export function vistaDeEscenarios(escenarios: Escenario[], corrida: Corrida | undefined, clave: string | undefined): Html {
  const activo = escenarios.find((e) => e.clave === clave) ?? escenarios[0];
  if (!activo) return `<div class="panel relleno">No hay escenarios configurados.</div>`;
  const lista = escenarios
    .map((e) => `<a href="/escenarios?clave=${encodeURIComponent(e.clave)}" class="${e === activo ? "activo" : ""}"><b>${escapar(e.clave)}</b>${escapar(e.nombre)}<small>${escapar(recortar(e.cuando, 80))}</small></a>`)
    .join("");
  return `<div class="editor">
    <div class="lista"><div class="cabecera">Índice · lo que el agente ve en cada turno</div>${lista}</div>
    <div>${detalle(activo, corrida)}</div>
  </div>`;
}

function detalle(e: Escenario, corrida: Corrida | undefined): Html {
  const usos = corrida?.casos.filter((c) => c.auditoria.some((ev) => ev.tipo === "escenario_cargado" && ev.detalle.clave === e.clave)) ?? [];
  const pasan = usos.filter((c) => c.paso).length;
  const enlaces = usos
    .map((c) => `<li><span class="n">${escapar(c.archivo.slice(0, 2))}</span><span style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><a href="/conversaciones?caso=${encodeURIComponent(c.archivo)}">${escapar(c.nombre)}</a>${c.paso ? chip("ok", "pasa") : chip("rojo", "falla")}</span></li>`)
    .join("");
  return `
  <div class="bloque">
    ${seccionHtml(e.clave, e.nombre, chip("ok", "activo"))}
    <div class="campo"><label>Cuándo aplica <span style="text-transform:none;letter-spacing:0;color:#8A94AE">· la única línea que viaja en el índice</span></label><div class="valor">${escapar(e.cuando)}</div></div>
    <div class="campo"><label>Instrucciones <span style="text-transform:none;letter-spacing:0;color:#8A94AE">· entran al contexto sólo cuando el agente carga este escenario</span></label><div class="valor">${escapar(e.instrucciones)}</div></div>
  </div>
  <div class="bloque">
    ${seccionHtml("Uso", "Conversaciones de prueba que lo cargaron", usos.length ? chip(pasan === usos.length ? "ok" : "rojo", `${pasan}/${usos.length} pasan`) : undefined)}
    <div class="panel relleno" style="padding-top:4px;padding-bottom:4px">${usos.length ? `<ol class="numerada" style="columns:2;column-gap:28px">${enlaces}</ol>` : `<span style="color:var(--gris)">Ninguna en la última corrida.</span>`}</div>
    <p class="nota">Los bloques fijos del prompt están en <a href="/prompt">Prompt base</a>. La edición desde el panel llega con la persistencia; hoy cada cambio de escenario pasa por los evals antes de quedar activo.</p>
  </div>`;
}

function recortar(texto: string, largo: number): string {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
}
