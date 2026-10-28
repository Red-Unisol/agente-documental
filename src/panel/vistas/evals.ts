import type { Corrida } from "../../evals/corrida.js";
import { chip, escapar, fecha, type Html, segundos, usd } from "../html.js";

export function vistaDeEvals(corridas: Corrida[], idSeleccionado: string | undefined): { cuerpo: Html; subtitulo: string } {
  const corrida = corridas.find((c) => c.id === idSeleccionado) ?? corridas[0];
  if (!corrida) return { cuerpo: `<div class="tarjeta">Todavía no hay corridas guardadas.</div>`, subtitulo: "" };
  const criterios = corrida.casos.reduce((total, c) => total + c.criterios.length, 0);
  return {
    subtitulo: "Conversaciones de prueba con resultado esperado. Se corren antes de cada cambio de escenarios, reglas o modelo. Datos sintéticos.",
    cuerpo: `
    <div class="kpis">
      <div class="kpi"><small>Casos</small><b>${corrida.total.casos}</b></div>
      <div class="kpi"><small>Pasan</small><b style="color:${corrida.total.pasaron === corrida.total.casos ? "var(--ok)" : "var(--rojo)"}">${corrida.total.pasaron}</b></div>
      <div class="kpi"><small>Criterios verificados</small><b>${criterios}</b></div>
      <div class="kpi"><small>Costo de la corrida</small><b class="chico">${usd(corrida.total.costoUsd, 3)} · ${escapar(corrida.modelos.conversacion)}</b></div>
    </div>
    <div class="tarjeta"><table><thead><tr><th>Caso</th><th>Qué se verifica</th><th>Estado final</th><th class="num">Costo</th><th class="num">Modelo</th><th>Resultado</th></tr></thead><tbody>${corrida.casos.map(fila).join("")}</tbody></table></div>
    <div class="tarjeta" style="margin-top:16px"><h3>Corridas guardadas</h3><table><thead><tr><th>Fecha</th><th>Conversación</th><th>Lectura</th><th class="num">Pasan</th><th class="num">Costo</th><th class="num">Tiempo en modelo</th></tr></thead><tbody>${corridas.map((c) => filaDeCorrida(c, c === corrida)).join("")}</tbody></table></div>`,
  };
}

function fila(caso: Corrida["casos"][number]): Html {
  const criterios = caso.criterios.map((k) => `<span style="color:${k.ok ? "var(--ok)" : "var(--rojo)"}">${k.ok ? "✓" : "✗"}</span> ${escapar(k.nombre)}`).join(" · ");
  return `<tr><td><a href="/conversaciones?caso=${encodeURIComponent(caso.archivo)}"><b>${escapar(caso.archivo.slice(0, 2))}</b> ${escapar(caso.nombre)}</a></td><td style="font-size:12px">${criterios}</td><td>${estado(caso.estadoFinal)}</td><td class="num">${usd(caso.uso.costoUsd)}</td><td class="num">${segundos(caso.uso.milisegundos)}</td><td>${caso.paso ? chip("ok", "pasa") : chip("rojo", "falla")}</td></tr>`;
}

function filaDeCorrida(c: Corrida, activa: boolean): Html {
  return `<tr style="${activa ? "background:#f3f7fe" : ""}"><td><a href="/evals?corrida=${encodeURIComponent(c.id)}">${fecha(c.fecha)}</a></td><td class="mono">${escapar(c.modelos.conversacion)}</td><td class="mono">${escapar(c.modelos.lectura)}</td><td class="num">${c.total.pasaron}/${c.total.casos}</td><td class="num">${usd(c.total.costoUsd, 3)}</td><td class="num">${segundos(c.total.milisegundos)}</td></tr>`;
}

function estado(valor: Corrida["casos"][number]["estadoFinal"]): Html {
  if (valor === "documentacion_cargada") return chip("ok", "documentación cargada");
  if (valor === "derivada") return chip("violeta", "derivada");
  return chip("alerta", "activa");
}
