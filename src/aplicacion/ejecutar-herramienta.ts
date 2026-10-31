import { buscarEscenario, indiceDeEscenarios, textoDeEscenario } from "../dominio/agente/escenarios.js";
import { type ArgumentosDe, definicionesDeHerramientas, esNombreDeHerramienta } from "../dominio/agente/herramientas.js";
import { type Archivo, type Conversacion, conEvento, ultimoArchivo } from "../dominio/conversacion/conversacion.js";
import { type Verificacion, verificarRecibo } from "../dominio/verificacion/verificar.js";
import type { LlamadaAHerramienta } from "../puertos/modelo-conversacional.js";
import type { ConfiguracionDelAgente } from "../puertos/repositorios.js";
import type { Dependencias } from "./dependencias.js";

interface Contexto {
  conversacion: Conversacion;
  configuracion: ConfiguracionDelAgente;
  dependencias: Dependencias;
}

export interface ResultadoDeHerramienta {
  conversacion: Conversacion;
  resultado: unknown;
}

export async function ejecutarHerramienta(llamada: LlamadaAHerramienta, contexto: Contexto): Promise<ResultadoDeHerramienta> {
  if (!esNombreDeHerramienta(llamada.nombre)) return rechazar(contexto, llamada, "No existe esa herramienta");
  const argumentos = definicionesDeHerramientas[llamada.nombre].argumentos.safeParse(llamada.argumentos ?? {});
  if (!argumentos.success) return rechazar(contexto, llamada, "Argumentos inválidos");

  switch (llamada.nombre) {
    case "cargar_escenario":
      return cargarEscenario(contexto, argumentos.data as ArgumentosDe<"cargar_escenario">);
    case "revisar_recibo":
      return revisarRecibo(contexto);
    case "marcar_falta_documentacion":
      return marcarFaltaDocumentacion(contexto, argumentos.data as ArgumentosDe<"marcar_falta_documentacion">);
    case "derivar":
      return derivar(contexto, argumentos.data as ArgumentosDe<"derivar">);
  }
}

function rechazar({ conversacion, dependencias }: Contexto, llamada: LlamadaAHerramienta, error: string): ResultadoDeHerramienta {
  const evento = { at: dependencias.reloj.ahora(), tipo: "herramienta_rechazada" as const, detalle: { herramienta: llamada.nombre, error } };
  return { conversacion: conEvento(conversacion, evento), resultado: { error } };
}

function cargarEscenario({ conversacion, configuracion, dependencias }: Contexto, { clave }: ArgumentosDe<"cargar_escenario">): ResultadoDeHerramienta {
  const escenario = buscarEscenario(configuracion.escenarios, clave);
  if (!escenario) {
    return { conversacion, resultado: { error: `No existe el escenario "${clave}".`, disponibles: indiceDeEscenarios(configuracion.escenarios) } };
  }
  const evento = { at: dependencias.reloj.ahora(), tipo: "escenario_cargado" as const, detalle: { clave: escenario.clave, nombre: escenario.nombre } };
  return { conversacion: conEvento(conversacion, evento), resultado: { escenario: textoDeEscenario(escenario) } };
}

async function revisarRecibo({ conversacion, configuracion, dependencias }: Contexto): Promise<ResultadoDeHerramienta> {
  const archivo = ultimoArchivo(conversacion);
  if (!archivo) return { conversacion, resultado: { error: "El socio todavía no mandó ningún archivo." } };
  if (conversacion.estado === "documentacion_cargada") {
    return { conversacion, resultado: { yaCargado: true, efecto: "Esta solicitud ya tiene un recibo aceptado y cargado. No se revisa otro archivo: confirmale que ya está y que lo va a contactar una persona de Red Unisol." } };
  }
  const previa = conversacion.auditoria.find((e) => e.tipo === "verificacion" && e.detalle.archivoId === archivo.id);
  if (previa) {
    return { conversacion, resultado: { yaRevisado: true, decision: previa.detalle.decision, motivos: previa.detalle.motivos, efecto: "Ese archivo ya se revisó con el resultado indicado; no se vuelve a revisar. Respondé según ese resultado, sin pedirle nada nuevo salvo que mande otro archivo." } };
  }

  const ahora = dependencias.reloj.ahora();
  const { lectura, uso } = await dependencias.lector.leer(archivo);
  const verificacion = verificarRecibo({ lectura, ficha: conversacion.ficha, reglas: configuracion.reglas, hoy: ahora });

  let actualizada = conEvento(conversacion, { at: ahora, tipo: "uso_de_modelo", detalle: { proposito: "lectura", ...uso } });
  actualizada = conEvento(actualizada, { at: ahora, tipo: "lectura_de_recibo", detalle: { archivo: archivo.nombre, ...lectura, cuil: lectura.cuil ? "leído" : "ausente" } });
  actualizada = conEvento(actualizada, { at: ahora, tipo: "verificacion", detalle: { archivoId: archivo.id, decision: verificacion.decision, motivos: verificacion.motivos, chequeos: verificacion.chequeos } });
  actualizada = await aplicarDecision({ ...actualizada, ultimaVerificacion: verificacion }, archivo, dependencias);

  const chequeos = verificacion.chequeos.map((c) => `${c.ok ? "OK" : "FALLA"} ${c.nombre}: ${c.detalle}`);
  return { conversacion: actualizada, resultado: { decision: verificacion.decision, chequeos, motivos: verificacion.motivos, ...efectoDe(verificacion.decision) } };
}

function efectoDe(decision: Verificacion["decision"]): Record<string, string> {
  switch (decision) {
    case "aceptar":
      return { efecto: "El recibo ya quedó cargado y la solicitud pasó a análisis. Avisale al socio." };
    case "derivar":
      return { efecto: "La conversación ya fue derivada a un analista. Mandá un solo mensaje de cierre sin explicar el motivo interno." };
    case "pedir_de_nuevo":
      return { efecto: "No se cargó nada. Explicale qué falló y pedile el recibo de nuevo." };
  }
}

async function aplicarDecision(conversacion: Conversacion, archivo: Archivo, dependencias: Dependencias): Promise<Conversacion> {
  const verificacion = conversacion.ultimaVerificacion;
  if (!verificacion) return conversacion;
  const { negociacionId } = conversacion.ficha;
  const at = dependencias.reloj.ahora();

  if (verificacion.decision === "aceptar") {
    await dependencias.crm.cargarRecibo(negociacionId, archivo);
    await dependencias.crm.moverEtapa(negociacionId, "DOCU_RECIBIDA", `Recibo verificado y guardado (${archivo.nombre}).`);
    const evento = { at, tipo: "accion_crm" as const, detalle: { accion: "cargar_recibo", etapa: "DOCU_RECIBIDA", archivo: archivo.nombre } };
    return { ...conEvento(conversacion, evento), estado: "documentacion_cargada" };
  }
  if (verificacion.decision === "derivar") {
    const motivo = verificacion.motivos.join("; ");
    await dependencias.crm.moverEtapa(negociacionId, "REVISION_DOCUMENTAL");
    await dependencias.crm.transferirConversacion(conversacion.chatId, "analista", motivo);
    return { ...conEvento(conversacion, { at, tipo: "derivacion", detalle: { destino: "analista", motivo } }), estado: "derivada" };
  }
  return conversacion;
}

async function marcarFaltaDocumentacion({ conversacion, dependencias }: Contexto, { motivo }: ArgumentosDe<"marcar_falta_documentacion">): Promise<ResultadoDeHerramienta> {
  await dependencias.crm.moverEtapa(conversacion.ficha.negociacionId, "FALTA_DOCUMENTACION", `Motivo: ${motivo}`);
  const evento = { at: dependencias.reloj.ahora(), tipo: "accion_crm" as const, detalle: { accion: "mover_etapa", etapa: "FALTA_DOCUMENTACION", motivo } };
  return { conversacion: conEvento(conversacion, evento), resultado: { ok: true, etapa: "FALTA DOCUMENTACION" } };
}

async function derivar({ conversacion, dependencias }: Contexto, { motivo, destino }: ArgumentosDe<"derivar">): Promise<ResultadoDeHerramienta> {
  if (conversacion.estado === "derivada") return { conversacion, resultado: { ok: true, nota: "Ya estaba derivada; no hace falta hacer nada más." } };
  // Toda derivación deja la negociación en REVISIÓN DOCUMENTAL: así en el embudo se distingue
  // de una que nadie tocó, y la persona que la toma sabe que el agente ya intervino.
  await dependencias.crm.moverEtapa(conversacion.ficha.negociacionId, "REVISION_DOCUMENTAL");
  await dependencias.crm.transferirConversacion(conversacion.chatId, destino, motivo);
  const evento = { at: dependencias.reloj.ahora(), tipo: "derivacion" as const, detalle: { destino, motivo } };
  return { conversacion: { ...conEvento(conversacion, evento), estado: "derivada" }, resultado: { ok: true, derivadoA: destino } };
}
