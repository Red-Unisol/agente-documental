import { describe, expect, it } from "vitest";
import type { EstadoDeNegociacion, Ficha } from "../tipos.js";
import { type EventoDeAuditoria, conEvento, nuevaConversacion } from "./conversacion.js";
import { esDePrueba, notaDeLoQueTiene, notaDelTurno } from "./nota-de-prueba.js";

const ficha: Ficha = {
  negociacionId: "900",
  nombre: "Rubén",
  dni: "16555444",
  provincia: "Catamarca",
  convenio: "Red Mutual",
  sectorDeclarado: "publico",
  empleadorDeclarado: "anses",
  situacionDeclarada: "Jubilado Nacional",
};
const negociacion: EstadoDeNegociacion = {
  hayQuePedirElRecibo: true,
  datos: [
    { etiqueta: "Etapa de la solicitud", valor: "PRESENTACION" },
    { etiqueta: "Recibo cargado en la negociación", valor: "no" },
  ],
};
const at = new Date("2026-11-17T12:00:00Z");
const evento = (tipo: EventoDeAuditoria["tipo"], detalle: Record<string, unknown>): EventoDeAuditoria => ({ at, tipo, detalle });
const conversacion = nuevaConversacion("c", "c", ficha);

describe("nota de prueba", () => {
  it("una conversación es de prueba si arrancó en modo de prueba", () => {
    expect(esDePrueba(conversacion)).toBe(false);
    expect(esDePrueba(conEvento(conversacion, evento("modo_de_prueba", { negociacionOriginal: "1", negociacionDePrueba: "900" })))).toBe(true);
  });

  it("al arrancar muestra lo que el agente tiene de la negociación, sin nombre ni documento", () => {
    const nota = notaDeLoQueTiene(ficha, negociacion);
    expect(nota).toContain("- Provincia: Catamarca");
    expect(nota).toContain("- Situación declarada: Jubilado Nacional, en anses");
    expect(nota).toContain("- Etapa de la solicitud: PRESENTACION");
    expect(nota).toContain("- tiene que pedir el recibo");
    expect(nota).not.toContain("Rubén");
    expect(nota).not.toContain("16555444");
  });

  it("después de cada respuesta cuenta los pasos del turno; el uso del modelo no es un paso", () => {
    const nota = notaDelTurno(
      negociacion,
      [
        evento("uso_de_modelo", { proposito: "conversacion" }),
        evento("escenario_cargado", { clave: "E4", nombre: "Llegó un archivo" }),
        evento("lectura_de_recibo", { archivo: "recibo.pdf", esReciboDeSueldo: true, legible: true, empleador: "ANSES", periodo: { anio: 2026, mes: 8 }, provincia: "Catamarca" }),
        evento("verificacion", { decision: "pedir_de_nuevo", chequeos: [{ ok: true, nombre: "identidad", detalle: "ok" }, { ok: false, nombre: "periodo", detalle: "El recibo es de agosto de 2026" }] }),
      ],
      conversacion,
    );
    expect(nota).toContain("Cómo vio la negociación: etapa PRESENTACION · tiene que pedir el recibo");
    expect(nota).toContain("- Cargó el escenario E4 · Llegó un archivo");
    expect(nota).toContain("- Leyó el archivo recibo.pdf: es un recibo, legible, empleador «ANSES», período 8/2026, provincia Catamarca");
    expect(nota).toContain("- Verificación del sistema: pedir_de_nuevo. No pasó: periodo (El recibo es de agosto de 2026)");
    expect(nota).not.toContain("uso_de_modelo");
  });

  it("cuenta lo que hizo en Bitrix y, si derivó, avisa cómo empezar de cero", () => {
    const derivada = { ...conversacion, estado: "derivada" as const };
    const nota = notaDelTurno(
      { ...negociacion, hayQuePedirElRecibo: false },
      [evento("accion_crm", { accion: "cargar_recibo", archivo: "recibo.pdf" }), evento("derivacion", { destino: "vendedor", motivo: "Pregunta por el monto." })],
      derivada,
    );
    expect(nota).toContain("no tiene que pedir el recibo");
    expect(nota).toContain("- En Bitrix: cargó el recibo en la negociación y no la movió de etapa");
    expect(nota).toContain("- Derivó a vendedor. Motivo interno: Pregunta por el monto.");
    expect(nota).toContain("para empezar de cero, mandá de nuevo el enlace con la clave");
  });

  it("si no se pudo leer la negociación, lo dice", () => {
    expect(notaDeLoQueTiene(ficha, undefined)).toContain("no pudo leer la negociación");
  });
});
