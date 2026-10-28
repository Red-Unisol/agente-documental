import type { EventoDeAuditoria, Mensaje } from "../../dominio/conversacion/conversacion.js";
import type { CasoCorrido, Corrida } from "../../evals/corrida.js";
import { chip, escapar, fecha, type Html, segundos, usd } from "../html.js";

const ETIQUETA_DE_ESTADO: Record<CasoCorrido["estadoFinal"], Html> = {
  activa: chip("alerta", "Activa"),
  derivada: chip("violeta", "Derivada a una persona"),
  documentacion_cargada: chip("ok", "Documentación cargada"),
};

export function vistaDeConversaciones(corrida: Corrida | undefined, seleccionado: string | undefined): { cuerpo: Html; subtitulo: string } {
  if (!corrida) return { cuerpo: `<div class="tarjeta">Todavía no hay conversaciones. Corré <span class="mono">npm run evals -- --guardar</span>.</div>`, subtitulo: "" };
  const caso = corrida.casos.find((c) => c.archivo === seleccionado) ?? corrida.casos[0];
  if (!caso) return { cuerpo: `<div class="tarjeta">La corrida no tiene casos.</div>`, subtitulo: "" };
  return {
    subtitulo: `Conversaciones de la corrida del ${fecha(corrida.fecha)} (${escapar(corrida.modelos.conversacion)}). En producción acá se ven las conversaciones reales del canal; hoy, las de prueba con datos ficticios.`,
    cuerpo: `<div class="editor"><div class="tarjeta lista">${listado(corrida, caso)}</div><div>${detalle(caso)}</div></div>`,
  };
}

function listado(corrida: Corrida, activo: CasoCorrido): Html {
  return corrida.casos
    .map(
      (c) =>
        `<a href="/conversaciones?caso=${encodeURIComponent(c.archivo)}" class="${c === activo ? "activo" : ""}"><b>${escapar(c.archivo.slice(0, 2))}</b> ${escapar(c.nombre)}<small>${ETIQUETA_DE_ESTADO[c.estadoFinal]}</small></a>`,
    )
    .join("");
}

function detalle(caso: CasoCorrido): Html {
  const { ficha } = caso;
  return `
  <div class="ficha">
    <div><small>Socio</small><b>${escapar(ficha.nombre)}</b></div>
    <div><small>Empleo declarado</small><b>${escapar(ficha.sectorDeclarado)} · ${escapar(ficha.empleadorDeclarado)}</b></div>
    <div><small>Provincia · convenio</small><b>${escapar(ficha.provincia)} · ${escapar(ficha.convenio)}</b></div>
    <div><small>Estado</small><b>${ETIQUETA_DE_ESTADO[caso.estadoFinal]}</b></div>
  </div>
  <div class="dos">
    <div class="tarjeta"><div class="chat">${caso.mensajes.map(burbuja).join("")}${caso.estadoFinal === "derivada" ? `<div class="b sistema"><div class="q">Sistema</div>El agente no responde más: la conversación la sigue la persona.</div>` : ""}</div></div>
    <div class="tarjeta"><h3>Qué hizo el agente</h3>${caso.auditoria.filter((e) => e.tipo !== "uso_de_modelo").map(paso).join("")}
      <p class="nota">${caso.uso.llamadas} llamadas al modelo · ${caso.uso.tokensDeEntrada} tokens de entrada · ${caso.uso.tokensDeSalida} de salida · ${segundos(caso.uso.milisegundos)} · ${usd(caso.uso.costoUsd)}</p>
    </div>
  </div>`;
}

function burbuja(mensaje: Mensaje): Html {
  const propio = mensaje.direccion === "saliente";
  const adjunto = mensaje.archivoId ? `<div class="adj">📎 archivo adjunto</div>` : "";
  return `<div class="b ${propio ? "a" : "s"}"><div class="q">${propio ? "Agente" : "Socio"} · ${fecha(mensaje.at)}</div>${escapar(mensaje.texto)}${adjunto}</div>`;
}

function paso(evento: EventoDeAuditoria): Html {
  const d = evento.detalle;
  switch (evento.tipo) {
    case "escenario_cargado":
      return bloque(`Cargó el escenario <span class="mono">${escapar(d.clave)}</span> · ${escapar(d.nombre)}`, "Elegido del índice. Sólo ese entró al contexto.");
    case "lectura_de_recibo":
      return bloque("Leyó el archivo", resumenDeLectura(d));
    case "verificacion":
      return `<div class="paso"><h4>Verificó (decide el sistema, no el modelo)</h4><ul>${(d.chequeos as { ok: boolean; nombre: string; detalle: string }[]).map((c) => `<li class="${c.ok ? "ok" : "no"}"><b>${escapar(c.nombre)}</b> · ${escapar(c.detalle)}</li>`).join("")}</ul><p style="margin-top:6px">Decisión: ${chipDeDecision(String(d.decision))}</p></div>`;
    case "accion_crm":
      return bloque(`CRM: ${escapar(d.accion)} → ${escapar(d.etapa)}`, d.motivo ? escapar(d.motivo) : "");
    case "derivacion":
      return bloque(`Derivó a ${escapar(d.destino)}`, `Motivo interno (el socio no lo ve): ${escapar(d.motivo)}`);
    case "herramienta_rechazada":
      return bloque(`Herramienta rechazada: <span class="mono">${escapar(d.herramienta)}</span>`, escapar(d.error));
    case "dato_sensible_omitido":
      return bloque("Filtro de salida", `Omitió ${escapar((d.tipos as string[]).join(", "))} de la respuesta antes de enviarla.`);
    case "uso_de_modelo":
      return "";
  }
}

function bloque(titulo: Html, texto: Html): Html {
  return `<div class="paso"><h4>${titulo}</h4>${texto ? `<p>${texto}</p>` : ""}</div>`;
}

function resumenDeLectura(d: Record<string, unknown>): Html {
  const periodo = d.periodo as { anio: number; mes: number } | undefined;
  return escapar(
    [
      d.esReciboDeSueldo ? "Recibo de sueldo" : "No es un recibo",
      d.legible ? "legible" : "ilegible",
      d.empleador ? String(d.empleador) : "sin empleador",
      periodo ? `${periodo.mes}/${periodo.anio}` : "sin período",
      String(d.sector),
      `CUIL ${String(d.cuil)}`,
    ].join(" · "),
  );
}

function chipDeDecision(decision: string): Html {
  if (decision === "aceptar") return chip("ok", "aceptar");
  if (decision === "derivar") return chip("violeta", "derivar");
  return chip("alerta", "pedir de nuevo");
}
