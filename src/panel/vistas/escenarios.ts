import type { Escenario } from "../../dominio/agente/escenarios.js";
import { definicionesDeHerramientas } from "../../dominio/agente/herramientas.js";
import type { BloquesDelPrompt } from "../../dominio/agente/prompt.js";
import type { Corrida } from "../../evals/corrida.js";
import { chip, escapar, type Html } from "../html.js";

export function vistaDeEscenarios(escenarios: Escenario[], bloques: BloquesDelPrompt, corrida: Corrida | undefined, clave: string | undefined): Html {
  const activo = escenarios.find((e) => e.clave === clave) ?? escenarios[0];
  if (!activo) return `<div class="tarjeta">No hay escenarios configurados.</div>`;
  const lista = escenarios
    .map((e) => `<a href="/escenarios?clave=${encodeURIComponent(e.clave)}" class="${e === activo ? "activo" : ""}"><b>${escapar(e.clave)}</b> ${escapar(e.nombre)}<small>${escapar(recortar(e.cuando, 70))}</small></a>`)
    .join("");
  return `<div class="editor"><div class="tarjeta lista">${lista}</div><div>${detalle(activo, corrida)}${prompt(bloques)}</div></div>`;
}

function detalle(e: Escenario, corrida: Corrida | undefined): Html {
  const usos = corrida?.casos.filter((c) => c.auditoria.some((ev) => ev.tipo === "escenario_cargado" && ev.detalle.clave === e.clave)) ?? [];
  const pasan = usos.filter((c) => c.paso).length;
  return `<div class="tarjeta">
    <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">${escapar(e.clave)} · ${escapar(e.nombre)}</b>${chip("ok", "Activo")}</div>
    <label>Cuándo aplica (lo único que el agente ve en el índice)</label><div class="campo">${escapar(e.cuando)}</div>
    <label>Instrucciones (se cargan sólo cuando el escenario se elige)</label><div class="campo">${escapar(e.instrucciones)}</div>
    <label>Conversaciones de prueba que lo cargaron en la última corrida</label>
    <div class="campo">${usos.length ? `${usos.map((c) => `<a href="/conversaciones?caso=${encodeURIComponent(c.archivo)}">${escapar(c.archivo.slice(0, 2))} ${escapar(c.nombre)}</a>`).join(" · ")} &nbsp;${chip(pasan === usos.length ? "ok" : "rojo", `${pasan}/${usos.length} pasan`)}` : "ninguna"}</div>
    <p class="nota">La edición desde el panel llega con la persistencia (próxima etapa). Hoy los escenarios se cambian en el código y cada cambio pasa por los evals.</p>
  </div>`;
}

function prompt(bloques: BloquesDelPrompt): Html {
  const herramientas = Object.entries(definicionesDeHerramientas)
    .map(([nombre, def]) => `<tr><td class="mono">${escapar(nombre)}</td><td>${escapar(def.descripcion)}</td></tr>`)
    .join("");
  return `<div class="tarjeta" style="margin-top:16px"><h3>Base del prompt (igual para todos los escenarios)</h3>
    <label>Rol</label><div class="campo">${escapar(bloques.rol)}</div>
    <label>Objetivo</label><div class="campo">${escapar(bloques.objetivo)}</div>
    <label>Qué no hace</label><div class="campo">${escapar(bloques.limites)}</div>
    <label>Forma de responder</label><div class="campo">${escapar(bloques.respuesta)}</div>
    <label>Herramientas disponibles (y ninguna otra)</label><table>${herramientas}</table>
  </div>`;
}

function recortar(texto: string, largo: number): string {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
}
