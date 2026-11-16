import { buscarEscenario, indiceDeEscenarios, textoDeEscenario } from "../dominio/agente/escenarios.js";
import { type ArgumentosDe, definicionesDeHerramientas, esNombreDeHerramienta } from "../dominio/agente/herramientas.js";
import { type Archivo, type Conversacion, conEvento } from "../dominio/conversacion/conversacion.js";
import { type Verificacion, verificacionQueDecide } from "../dominio/verificacion/verificar.js";
import type { LlamadaAHerramienta } from "../puertos/modelo-conversacional.js";
import type { ConfiguracionDelAgente } from "../puertos/repositorios.js";
import type { Dependencias } from "./dependencias.js";
import { type RevisionDeArchivo, revisarArchivo } from "./revisar-archivo.js";

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

// Tope de archivos que se leen en una misma revisión, para que un socio que manda veinte fotos no dispare veinte lecturas.
const MAXIMO_DE_ARCHIVOS_POR_REVISION = 5;

// Revisa todo lo que el socio mandó y todavía no se revisó (puede haber mandado el DNI en un archivo
// y el recibo en otro). Vale el primero que sirve; si ninguno sirve, decide `verificacionQueDecide`.
async function revisarRecibo({ conversacion, configuracion, dependencias }: Contexto): Promise<ResultadoDeHerramienta> {
  if (conversacion.archivos.length === 0) return { conversacion, resultado: { error: "El socio todavía no mandó ningún archivo." } };
  if (conversacion.estado === "documentacion_cargada") {
    return { conversacion, resultado: { yaCargado: true, efecto: "Esta solicitud ya tiene un recibo aceptado y cargado. No se revisa otro archivo: confirmale que ya está y que lo va a contactar una persona de Red Unisol." } };
  }
  const pendientes = archivosSinRevisar(conversacion).slice(-MAXIMO_DE_ARCHIVOS_POR_REVISION);
  if (pendientes.length === 0) {
    const previa = conversacion.auditoria.filter((e) => e.tipo === "verificacion").at(-1);
    return { conversacion, resultado: { yaRevisado: true, decision: previa?.detalle.decision, motivos: previa?.detalle.motivos, efecto: "Ese archivo ya se revisó con el resultado indicado; no se vuelve a revisar. Respondé según ese resultado, sin pedirle nada nuevo salvo que mande otro archivo." } };
  }

  const ahora = dependencias.reloj.ahora();
  const revisados: { archivo: Archivo; verificacion: Verificacion }[] = [];
  let actualizada = conversacion;
  for (const archivo of pendientes) {
    const revision = await revisarArchivo(archivo, { lector: dependencias.lector, lectorDeRespaldo: dependencias.lectorDeRespaldo, ficha: conversacion.ficha, reglas: configuracion.reglas, hoy: ahora });
    const { verificacion } = revision;
    for (const uso of revision.usos) actualizada = conEvento(actualizada, { at: ahora, tipo: "uso_de_modelo", detalle: { proposito: "lectura", ...uso } });
    actualizada = conEvento(actualizada, { at: ahora, tipo: "lectura_de_recibo", detalle: { archivo: archivo.nombre, ...resumenParaAuditoria(revision) } });
    actualizada = conEvento(actualizada, { at: ahora, tipo: "verificacion", detalle: { archivoId: archivo.id, decision: verificacion.decision, motivos: verificacion.motivos, chequeos: verificacion.chequeos } });
    revisados.push({ archivo, verificacion });
    if (verificacion.decision === "aceptar") break;
  }

  const decisivo = verificacionQueDecide(revisados);
  if (!decisivo) return { conversacion: actualizada, resultado: { error: "No se pudo revisar ningún archivo." } };
  const { archivo, verificacion } = decisivo;
  const aplicada = await aplicarDecision({ ...actualizada, ultimaVerificacion: verificacion }, archivo, dependencias);
  actualizada = aplicada.conversacion;

  const chequeos = verificacion.chequeos.map((c) => `${c.ok ? "OK" : "FALLA"} ${c.nombre}: ${c.detalle}`);
  const resultado = { decision: verificacion.decision, chequeos, motivos: verificacion.motivos, ...(revisados.length > 1 && { archivosRevisados: revisados.length }), ...efectoDe(verificacion.decision, aplicada.etapaMovida) };
  return { conversacion: actualizada, resultado };
}

function archivosSinRevisar(conversacion: Conversacion): Archivo[] {
  const revisados = new Set(conversacion.auditoria.filter((e) => e.tipo === "verificacion").map((e) => e.detalle.archivoId));
  return conversacion.archivos.filter((archivo) => !revisados.has(archivo.id));
}

// Lo que queda en la auditoría de una lectura. El CUIL y el DNI no se guardan: sólo si se leyeron.
function resumenParaAuditoria({ lectura, liquidacion, conSegundaLectura }: RevisionDeArchivo): Record<string, unknown> {
  return {
    ...(conSegundaLectura && { segundaLectura: true }),
    esReciboDeSueldo: liquidacion !== undefined,
    legible: lectura.legible,
    liquidaciones: lectura.liquidaciones.length,
    otrosDocumentos: lectura.otrosDocumentos,
    empleador: liquidacion?.empleador,
    periodo: liquidacion?.periodo,
    provincia: liquidacion?.provincia,
    sector: liquidacion?.sector ?? "desconocido",
    conHaberes: liquidacion?.conHaberes ?? false,
    cuil: liquidacion?.cuil ? "leído" : "ausente",
    dni: liquidacion?.dni ? "leído" : "ausente",
  };
}

function efectoDe(decision: Verificacion["decision"], etapaMovida: boolean): Record<string, string> {
  switch (decision) {
    case "aceptar":
      return etapaMovida
        ? { efecto: "El recibo ya quedó cargado y la solicitud pasó a análisis. Avisale al socio." }
        : { efecto: "El recibo ya quedó cargado. La solicitud ya estaba en una etapa posterior a la documentación y sigue donde estaba: avisale que quedó cargado y que su solicitud sigue con el equipo de Red Unisol. No digas que pasó a análisis." };
    case "derivar":
      return { efecto: "La conversación ya fue derivada a un analista. Mandá un solo mensaje de cierre sin explicar el motivo interno." };
    case "pedir_de_nuevo":
      return { efecto: "No se cargó nada. Explicale qué falló y pedile el recibo de nuevo." };
  }
}

async function aplicarDecision(conversacion: Conversacion, archivo: Archivo, dependencias: Dependencias): Promise<{ conversacion: Conversacion; etapaMovida: boolean }> {
  const verificacion = conversacion.ultimaVerificacion;
  if (!verificacion) return { conversacion, etapaMovida: false };
  const { negociacionId } = conversacion.ficha;
  const at = dependencias.reloj.ahora();

  if (verificacion.decision === "aceptar") {
    await dependencias.crm.cargarRecibo(negociacionId, archivo);
    const etapaMovida = await dependencias.crm.moverEtapa(negociacionId, "DOCU_RECIBIDA", `Recibo verificado y guardado (${archivo.nombre}).`);
    const evento = { at, tipo: "accion_crm" as const, detalle: { accion: "cargar_recibo", ...(etapaMovida && { etapa: "DOCU_RECIBIDA" }), archivo: archivo.nombre } };
    return { conversacion: { ...conEvento(conversacion, evento), estado: "documentacion_cargada" }, etapaMovida };
  }
  if (verificacion.decision === "derivar") {
    const motivo = verificacion.motivos.join("; ");
    const etapaMovida = await dependencias.crm.moverEtapa(negociacionId, "REVISION_DOCUMENTAL");
    await dependencias.crm.transferirConversacion(conversacion.chatId, "analista", motivo);
    return { conversacion: { ...conEvento(conversacion, { at, tipo: "derivacion", detalle: { destino: "analista", motivo } }), estado: "derivada" }, etapaMovida };
  }
  return { conversacion, etapaMovida: false };
}

async function marcarFaltaDocumentacion({ conversacion, dependencias }: Contexto, { motivo }: ArgumentosDe<"marcar_falta_documentacion">): Promise<ResultadoDeHerramienta> {
  const etapaMovida = await dependencias.crm.moverEtapa(conversacion.ficha.negociacionId, "FALTA_DOCUMENTACION", `Motivo: ${motivo}`);
  if (!etapaMovida) return { conversacion, resultado: { ok: true, nota: "La solicitud está en una etapa posterior a la documentación: no se cambió de etapa. El motivo quedó anotado." } };
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
