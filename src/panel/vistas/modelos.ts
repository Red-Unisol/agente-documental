import { tarifasOpenAI } from "../../dominio/costos/tarifas.js";
import type { Corrida } from "../../evals/corrida.js";
import { chip, escapar, fecha, type Html, segundos, usd } from "../html.js";
import { seccionHtml } from "./plantilla.js";

const CONVERSACIONES_POR_MES = 2000;
const SE_RETIRA = /^gpt-4\.1/;

export interface ModelosEnUso {
  conversacion: string;
  lectura: string;
}

export function vistaDeModelos(corridas: Corrida[], enUso: ModelosEnUso): Html {
  const comparables = ultimaPorCombinacion(corridas);
  const esActual = (c: Corrida) => c.modelos.conversacion === enUso.conversacion && c.modelos.lectura === enUso.lectura;
  const porConversacion = (c: Corrida) => (c.total.costoUsd === undefined ? undefined : c.total.costoUsd / c.total.casos);
  const maximo = Math.max(...comparables.map((c) => porConversacion(c) ?? 0), 0.0001);

  const barras = comparables
    .map((c) => {
      const costo = porConversacion(c);
      const ancho = costo === undefined ? 0 : (costo / maximo) * 100;
      const retira = SE_RETIRA.test(c.modelos.conversacion);
      const nota = esActual(c) ? " · en uso" : retira ? " · se retira 14/01/2027" : "";
      return `<div class="barra"><div class="et">${escapar(c.modelos.conversacion)}<small>lectura ${escapar(c.modelos.lectura)}${nota}</small></div><div class="pista"><i class="${retira ? "gris" : esActual(c) ? "" : "ambar"}" style="width:${ancho.toFixed(1)}%"></i></div><div class="v">${usd(costo)}</div></div>`;
    })
    .join("");

  const filas = comparables
    .map((c) => {
      const costo = porConversacion(c);
      const porMes = costo === undefined ? undefined : costo * CONVERSACIONES_POR_MES;
      const todas = c.total.pasaron === c.total.casos;
      return `<tr><td class="cod">${escapar(c.modelos.conversacion)}</td><td class="cod">${escapar(c.modelos.lectura)}</td><td>${todas ? chip("ok", `${c.total.pasaron}/${c.total.casos}`) : chip("rojo", `${c.total.pasaron}/${c.total.casos}`)}</td><td class="num">${usd(costo)}</td><td class="num">${usd(porMes, 2)}</td><td class="num">${segundos(c.total.milisegundos / c.total.casos)}</td><td style="color:var(--gris)">${fecha(c.fecha)}</td></tr>`;
    })
    .join("");

  const tarifas = Object.entries(tarifasOpenAI)
    .map(([modelo, t]) => `<tr><td class="cod">${escapar(modelo)}${SE_RETIRA.test(modelo) ? ` <span class="chip alerta" style="margin-left:6px">se retira</span>` : ""}</td><td class="num">${t.entrada.toFixed(2)}</td><td class="num">${t.cacheada.toFixed(3)}</td><td class="num">${t.salida.toFixed(2)}</td></tr>`)
    .join("");

  const sinCorridas = `<div class="panel relleno" style="color:var(--gris)">Sin corridas. Corré los evals con distintos <span class="cod">OPENAI_MODELO_CONVERSACION</span> / <span class="cod">OPENAI_MODELO_LECTURA</span> y <span class="cod">--guardar</span>.</div>`;

  return `
  <div class="bloque">
    ${seccionHtml("A", "Costo por conversación, misma batería de evals", `${comparables.length} combinaciones`)}
    ${comparables.length ? `<div class="panel barras">${barras}<div class="leyenda"><span><i></i>en uso (${escapar(enUso.conversacion)} · lectura ${escapar(enUso.lectura)})</span><span><i class="ambar"></i>alternativas probadas</span><span><i class="gris"></i>retirado por OpenAI el 14/01/2027</span></div></div>` : sinCorridas}
  </div>
  <div class="bloque">
    ${seccionHtml("B", "Detalle de la comparación")}
    <div class="panel tabla-caja"><table><thead><tr><th>Conversación</th><th>Lectura de recibos</th><th>Pasan</th><th class="num">Por conversación</th><th class="num">${CONVERSACIONES_POR_MES.toLocaleString("es-AR")} conv./mes</th><th class="num">En modelo por conv.</th><th>Corrida</th></tr></thead>
    <tbody>${filas}</tbody></table></div>
    <p class="nota">Costo de tokens según la lista pública de OpenAI; no incluye infraestructura. Una conversación de prueba promedia 2 a 4 mensajes del socio y una lectura de recibo. El tiempo es el que pasa dentro del modelo, sin red ni Bitrix.</p>
  </div>
  <div class="dos iguales">
    <div class="bloque">
      ${seccionHtml("C", "Tarifas cargadas", "USD por millón de tokens")}
      <div class="panel tabla-caja"><table><thead><tr><th>Modelo</th><th class="num">Entrada</th><th class="num">Cacheada</th><th class="num">Salida</th></tr></thead><tbody>${tarifas}</tbody></table></div>
      <p class="nota">Lista estándar de OpenAI al 28/10/2026. OpenAI recomienda <span class="cod">gpt-6-luna</span> como reemplazo de la familia 4.1.</p>
    </div>
    <div class="bloque">
      ${seccionHtml("D", "Cómo se usa OpenAI")}
      <div class="campo"><label>Dos llamadas, dos modelos</label><div class="valor">Uno <b>conversa</b>: elige el escenario, decide qué herramienta usar y redacta la respuesta. Otro <b>lee el recibo</b> y devuelve campos estructurados: empleador, período, CUIL, sector. Ninguno decide si el recibo sirve; eso lo hace el código con las reglas.</div></div>
      <div class="campo"><label>Datos</label><div class="valor">API con la cuenta de Red Unisol y tope de gasto. Por política de la API, OpenAI no entrena con estos datos. Al modelo viajan el chat y el recibo para leerlo; no viajan el DNI de la ficha, el CUIL comparado ni nada del ERP.</div></div>
      <div class="campo"><label>Cambiar de modelo</label><div class="valor">Son dos variables de entorno. El cambio se valida corriendo los evals con el modelo nuevo y comparando acá.</div></div>
    </div>
  </div>`;
}

function ultimaPorCombinacion(corridas: Corrida[]): Corrida[] {
  const vistas = new Map<string, Corrida>();
  for (const c of corridas) {
    const clave = `${c.modelos.conversacion}+${c.modelos.lectura}`;
    if (!vistas.has(clave)) vistas.set(clave, c);
  }
  return [...vistas.values()].sort((a, b) => (a.total.costoUsd ?? 0) - (b.total.costoUsd ?? 0));
}
