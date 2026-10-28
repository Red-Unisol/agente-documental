import { tarifasOpenAI } from "../../dominio/costos/tarifas.js";
import type { Corrida } from "../../evals/corrida.js";
import { chip, escapar, fecha, type Html, segundos, usd } from "../html.js";

const CONVERSACIONES_POR_MES = 2000;

export function vistaDeModelos(corridas: Corrida[]): Html {
  const comparables = ultimaPorCombinacion(corridas);
  const filas = comparables.map((c) => {
    const porConversacion = c.total.costoUsd === undefined ? undefined : c.total.costoUsd / c.total.casos;
    const porMes = porConversacion === undefined ? undefined : porConversacion * CONVERSACIONES_POR_MES;
    const todas = c.total.pasaron === c.total.casos;
    return `<tr><td class="mono">${escapar(c.modelos.conversacion)}</td><td class="mono">${escapar(c.modelos.lectura)}</td><td>${todas ? chip("ok", `${c.total.pasaron}/${c.total.casos}`) : chip("rojo", `${c.total.pasaron}/${c.total.casos}`)}</td><td class="num">${usd(porConversacion)}</td><td class="num">${usd(porMes, 2)}</td><td class="num">${segundos(c.total.milisegundos / c.total.casos)}</td><td style="color:var(--gris)">${fecha(c.fecha)}</td></tr>`;
  });
  const tarifas = Object.entries(tarifasOpenAI)
    .map(([modelo, t]) => `<tr><td class="mono">${escapar(modelo)}</td><td class="num">${t.entrada.toFixed(2)}</td><td class="num">${t.cacheada.toFixed(3)}</td><td class="num">${t.salida.toFixed(2)}</td></tr>`)
    .join("");
  return `
  <div class="tarjeta"><h3>Comparación sobre los mismos evals</h3>
    <table><thead><tr><th>Conversación</th><th>Lectura de recibos</th><th>Pasan</th><th class="num">Costo por conversación</th><th class="num">Estimado · ${CONVERSACIONES_POR_MES.toLocaleString("es-AR")} conv./mes</th><th class="num">Tiempo en modelo por conv.</th><th>Corrida</th></tr></thead>
    <tbody>${filas.join("") || `<tr><td colspan="7">Sin corridas. Corré los evals con distintos <span class="mono">OPENAI_MODELO_CONVERSACION</span> / <span class="mono">OPENAI_MODELO_LECTURA</span> y <span class="mono">--guardar</span>.</td></tr>`}</tbody></table>
    <p class="nota">El costo es el de los tokens de OpenAI según la lista pública; no incluye infraestructura. Una conversación de prueba promedia 2 a 4 mensajes del socio y una lectura de recibo. El tiempo es el que pasa dentro del modelo, sin red ni Bitrix.</p>
  </div>
  <div class="dos iguales" style="margin-top:16px">
    <div class="tarjeta"><h3>Tarifas cargadas (USD por millón de tokens)</h3>
      <table><thead><tr><th>Modelo</th><th class="num">Entrada</th><th class="num">Entrada cacheada</th><th class="num">Salida</th></tr></thead><tbody>${tarifas}</tbody></table>
      <p class="nota">Lista estándar de OpenAI al 28/10/2026. <span class="mono">gpt-4.1</span> y <span class="mono">gpt-4.1-mini</span> se retiran el 14/01/2027; OpenAI recomienda <span class="mono">gpt-6-luna</span> como reemplazo.</p>
    </div>
    <div class="tarjeta"><h3>Cómo se usa OpenAI</h3>
      <div class="campo">Dos llamadas distintas: un modelo <b>conversa</b> (elige el escenario, decide qué herramienta usar y redacta la respuesta) y otro <b>lee el recibo</b> (devuelve campos estructurados: empleador, período, CUIL, sector). Ninguno decide si el recibo sirve: eso lo hace el código con las reglas.</div>
      <label>Datos</label><div class="campo">Se usa la API con la cuenta de Red Unisol y tope de gasto. Por política de la API, OpenAI no entrena con estos datos. El recibo viaja cifrado a OpenAI sólo para la lectura; el DNI de la ficha nunca se manda al modelo.</div>
      <label>Cambiar de modelo</label><div class="campo">Son dos variables de entorno. El cambio se valida corriendo los evals con el modelo nuevo y comparando acá.</div>
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
