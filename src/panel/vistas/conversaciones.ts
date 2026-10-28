import type { EventoDeAuditoria, Mensaje } from "../../dominio/conversacion/conversacion.js";
import type { CasoCorrido, Corrida } from "../../evals/corrida.js";
import { chip, escapar, fecha, hora, type Html, segundos, usd } from "../html.js";
import { seccionHtml } from "./plantilla.js";

const ETIQUETA_DE_ESTADO: Record<CasoCorrido["estadoFinal"], Html> = {
  activa: chip("alerta", "Activa"),
  derivada: chip("violeta", "Derivada"),
  documentacion_cargada: chip("ok", "Cargada"),
};

export function vistaDeConversaciones(corrida: Corrida | undefined, seleccionado: string | undefined): { cuerpo: Html; subtitulo: string } {
  if (!corrida) return { cuerpo: `<div class="panel relleno">Todavía no hay conversaciones. Corré <span class="cod">npm run evals -- --guardar</span>.</div>`, subtitulo: "" };
  const caso = corrida.casos.find((c) => c.archivo === seleccionado) ?? corrida.casos[0];
  if (!caso) return { cuerpo: `<div class="panel relleno">La corrida no tiene casos.</div>`, subtitulo: "" };
  return {
    subtitulo: `Corrida del ${fecha(corrida.fecha)} con <span class="cod">${escapar(corrida.modelos.conversacion)}</span>. En producción acá se ven las conversaciones reales del canal; hoy, las de prueba con datos ficticios.`,
    cuerpo: `<div class="editor"><div class="lista"><div class="cabecera">${corrida.casos.length} conversaciones</div>${listado(corrida, caso)}</div><div>${detalle(caso)}</div></div>`,
  };
}

function listado(corrida: Corrida, activo: CasoCorrido): Html {
  return corrida.casos
    .map(
      (c) =>
        `<a href="/conversaciones?caso=${encodeURIComponent(c.archivo)}" class="${c === activo ? "activo" : ""}"><b>${escapar(c.archivo.slice(0, 2))}</b>${escapar(c.nombre)}<small>${ETIQUETA_DE_ESTADO[c.estadoFinal]}</small></a>`,
    )
    .join("");
}

function detalle(caso: CasoCorrido): Html {
  const { ficha } = caso;
  const sector = ficha.sectorDeclarado === "publico" ? "Público" : "Privado";
  const pasos = caso.auditoria.filter((e) => e.tipo !== "uso_de_modelo");
  return `
  ${seccionHtml(caso.archivo.slice(0, 2), caso.nombre, caso.paso ? chip("ok", "eval pasa") : chip("rojo", "eval falla"))}
  <div class="ficha">
    <div><small>Socio</small><b>${escapar(ficha.nombre)}</b></div>
    <div><small>Empleo declarado</small><b>${sector} · ${escapar(ficha.empleadorDeclarado)}</b></div>
    <div><small>Provincia · convenio</small><b>${escapar(ficha.provincia)} · ${escapar(ficha.convenio)}</b></div>
    <div><small>Estado final</small><b>${ETIQUETA_DE_ESTADO[caso.estadoFinal]}</b></div>
  </div>
  <div class="dos">
    <div>
      <div class="ledger">${caso.mensajes.map(renglon).join("")}${caso.estadoFinal === "derivada" ? `<div class="m sistema"><div class="quien">Sistema</div><div class="txt">El agente no responde más: la conversación la sigue la persona a la que derivó.</div></div>` : ""}</div>
    </div>
    <div>
      <div class="pasos">${pasos.map((e, i) => paso(e, i + 1)).join("")}
        <div class="uso"><span><b>${caso.uso.llamadas}</b> llamadas</span><span><b>${caso.uso.tokensDeEntrada.toLocaleString("es-AR")}</b> tokens entrada</span><span><b>${caso.uso.tokensDeSalida.toLocaleString("es-AR")}</b> salida</span><span><b>${segundos(caso.uso.milisegundos)}</b> en modelo</span><span><b>${usd(caso.uso.costoUsd)}</b></span></div>
      </div>
    </div>
  </div>`;
}

function renglon(mensaje: Mensaje): Html {
  const propio = mensaje.direccion === "saliente";
  const adjunto = mensaje.archivoId ? `<div><span class="adj">archivo adjunto</span></div>` : "";
  return `<div class="m ${propio ? "a" : "s"}"><div class="quien">${propio ? "Agente" : "Socio"}<small>${hora(mensaje.at)}</small></div><div class="txt">${escapar(mensaje.texto)}${adjunto}</div></div>`;
}

function paso(evento: EventoDeAuditoria, numero: number): Html {
  const d = evento.detalle;
  const n = String(numero).padStart(2, "0");
  switch (evento.tipo) {
    case "escenario_cargado":
      return bloque(n, `Cargó el escenario <span class="cod">${escapar(d.clave)}</span> · ${escapar(d.nombre)}`, "Elegido del índice. Sólo ese entró al contexto.");
    case "lectura_de_recibo":
      return bloque(n, "Leyó el archivo", resumenDeLectura(d));
    case "verificacion":
      return `<div class="paso"><span class="n">${n}</span><div><h4>Verificó · decide el sistema, no el modelo</h4><ul>${(d.chequeos as { ok: boolean; nombre: string; detalle: string }[]).map((c) => `<li class="${c.ok ? "" : "no"}"><b>${escapar(c.nombre)}</b> · ${escapar(c.detalle)}</li>`).join("")}</ul><p class="pie">Decisión: ${chipDeDecision(String(d.decision))}</p></div></div>`;
    case "accion_crm":
      return bloque(n, `CRM: ${escapar(d.accion)} → ${escapar(d.etapa)}`, d.motivo ? escapar(d.motivo) : "");
    case "derivacion":
      return bloque(n, `Derivó a ${escapar(d.destino)}`, `Motivo interno, el socio no lo ve: ${escapar(d.motivo)}`);
    case "herramienta_rechazada":
      return bloque(n, `Herramienta rechazada: <span class="cod">${escapar(d.herramienta)}</span>`, escapar(d.error));
    case "dato_sensible_omitido":
      return bloque(n, "Filtro de salida", `Omitió ${escapar((d.tipos as string[]).join(", "))} de la respuesta antes de enviarla.`);
    case "uso_de_modelo":
      return "";
  }
}

function bloque(n: string, titulo: Html, texto: Html): Html {
  return `<div class="paso"><span class="n">${n}</span><div><h4>${titulo}</h4>${texto ? `<p>${texto}</p>` : ""}</div></div>`;
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
