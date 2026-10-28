import type { Corrida } from "../../evals/corrida.js";
import { chip, escapar, fecha, type Html, segundos, usd } from "../html.js";
import { seccionHtml } from "./plantilla.js";

export function vistaDeEvals(corridas: Corrida[], idSeleccionado: string | undefined): { cuerpo: Html; subtitulo: string } {
  const corrida = corridas.find((c) => c.id === idSeleccionado) ?? corridas[0];
  if (!corrida) return { cuerpo: `<div class="panel relleno">Todavía no hay corridas guardadas.</div>`, subtitulo: "" };
  const criterios = corrida.casos.reduce((total, c) => total + c.criterios.length, 0);
  const todas = corrida.total.pasaron === corrida.total.casos;
  return {
    subtitulo: "Conversaciones de prueba con resultado esperado. Se corren antes de cada cambio de escenarios, reglas o modelo. Datos sintéticos.",
    cuerpo: `
    <div class="kpis">
      <div class="kpi"><small>Pasan</small><b class="${todas ? "ok" : "rojo"}">${corrida.total.pasaron}/${corrida.total.casos}</b><span>casos de la corrida</span></div>
      <div class="kpi"><small>Criterios verificados</small><b>${criterios}</b><span>estado final, acciones, textos prohibidos</span></div>
      <div class="kpi"><small>Costo de la corrida</small><b class="chico">${usd(corrida.total.costoUsd, 3)}</b><span>${usd(corrida.total.costoUsd === undefined ? undefined : corrida.total.costoUsd / corrida.total.casos)} por conversación</span></div>
      <div class="kpi"><small>Modelos</small><b class="chico">${escapar(corrida.modelos.conversacion)}</b><span>lectura: ${escapar(corrida.modelos.lectura)} · ${fecha(corrida.fecha)}</span></div>
    </div>
    <div class="bloque">
      ${seccionHtml("A", "Resultado por caso", `corrida ${escapar(corrida.id)}`)}
      <div class="panel tabla-caja"><table><thead><tr><th style="width:21%">Caso</th><th>Qué se verifica</th><th>Estado final</th><th class="num">Costo</th><th class="num">En modelo</th><th>Resultado</th></tr></thead><tbody>${corrida.casos.map(fila).join("")}</tbody></table></div>
    </div>
    <div class="bloque">
      ${seccionHtml("B", "Corridas guardadas", `${corridas.length} en total`)}
      <div class="panel tabla-caja"><table><thead><tr><th>Fecha</th><th>Conversación</th><th>Lectura</th><th class="num">Pasan</th><th class="num">Costo</th><th class="num">En modelo</th></tr></thead><tbody>${corridas.map((c) => filaDeCorrida(c, c === corrida)).join("")}</tbody></table></div>
      <p class="nota">Cada fila es la misma batería corrida con otra combinación de modelos. La comparación ordenada está en <a href="/modelos">Modelos y costos</a>.</p>
    </div>`,
  };
}

// Los patrones prohibidos son expresiones regulares: a quien mira el panel le
// sirve saber cuántos se verificaron y cuál falló, no leer el regex.
function resumenDeCriterios(criterios: Corrida["casos"][number]["criterios"]): Html {
  const marca = (ok: boolean) => `<span style="color:${ok ? "var(--ok)" : "var(--rojo)"};font-family:var(--mono);font-size:11px">${ok ? "✓" : "✗"}</span>`;
  const prohibidos = criterios.filter((k) => k.nombre.startsWith("no dice"));
  const resto = criterios.filter((k) => !k.nombre.startsWith("no dice"));
  const partes = resto.map((k) => `${marca(k.ok)} ${escapar(k.nombre)}`);
  if (prohibidos.length) {
    const fallidos = prohibidos.filter((k) => !k.ok);
    partes.push(
      fallidos.length
        ? fallidos.map((k) => `${marca(false)} ${escapar(k.detalle)}`).join(" &nbsp;·&nbsp; ")
        : `${marca(true)} ${prohibidos.length} ${prohibidos.length === 1 ? "texto prohibido" : "textos prohibidos"}`,
    );
  }
  return partes.join(" &nbsp;·&nbsp; ");
}

function fila(caso: Corrida["casos"][number]): Html {
  const criterios = resumenDeCriterios(caso.criterios);
  return `<tr><td><a href="/conversaciones?caso=${encodeURIComponent(caso.archivo)}"><b style="font-family:var(--mono);font-weight:500;font-size:11px;margin-right:6px">${escapar(caso.archivo.slice(0, 2))}</b>${escapar(caso.nombre)}</a></td><td style="font-size:12.5px;color:var(--gris)">${criterios}</td><td>${estado(caso.estadoFinal)}</td><td class="num">${usd(caso.uso.costoUsd)}</td><td class="num">${segundos(caso.uso.milisegundos)}</td><td>${caso.paso ? chip("ok", "pasa") : chip("rojo", "falla")}</td></tr>`;
}

function filaDeCorrida(c: Corrida, activa: boolean): Html {
  return `<tr class="${activa ? "activa" : ""}"><td><a href="/evals?corrida=${encodeURIComponent(c.id)}">${fecha(c.fecha)}</a></td><td class="cod">${escapar(c.modelos.conversacion)}</td><td class="cod">${escapar(c.modelos.lectura)}</td><td class="num">${c.total.pasaron}/${c.total.casos}</td><td class="num">${usd(c.total.costoUsd, 3)}</td><td class="num">${segundos(c.total.milisegundos)}</td></tr>`;
}

function estado(valor: Corrida["casos"][number]["estadoFinal"]): Html {
  if (valor === "documentacion_cargada") return chip("ok", "cargada");
  if (valor === "derivada") return chip("violeta", "derivada");
  return chip("alerta", "activa");
}
