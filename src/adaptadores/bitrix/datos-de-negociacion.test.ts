import { describe, expect, it } from "vitest";
import { type DefinicionesDeCampos, ETAPA_CERRADA, estadoDeNegociacion, nombresParaElSocio, valorLegible } from "./datos-de-negociacion.js";

const mapeo = {
  campos: { recibo: "UF_RECIBO" } as never,
  etapas: { DOCUMENTACION: "C19:UC_53P7WJ", FALTA_DOCUMENTACION: "C19:FALTA" } as never,
  datosParaElSocio: [
    { etiqueta: "Banco de cobro", campo: "UF_BANCO_TEXTO" },
    { etiqueta: "Banco de cobro", campo: "UF_BANCO_LISTA" },
    { etiqueta: "Cantidad de créditos activos", campo: "UF_CREDITOS" },
    { etiqueta: "Es socio", campo: "UF_SOCIO" },
    { etiqueta: "Motivo de rechazo", campo: "UF_MOTIVO" },
  ],
};
const definiciones: DefinicionesDeCampos = {
  UF_BANCO_TEXTO: { type: "string" },
  UF_BANCO_LISTA: { type: "enumeration", isMultiple: true, items: [{ ID: "7", VALUE: "Bancor" }] },
  UF_CREDITOS: { type: "integer" },
  UF_SOCIO: { type: "enumeration", items: [{ ID: "1", VALUE: "Si" }, { ID: "2", VALUE: "No" }] },
  UF_MOTIVO: { type: "enumeration", items: [{ ID: "9", VALUE: "OTRO BANCO" }] },
};
const etapas = [
  { STATUS_ID: "C19:NEW", NAME: "PRESENTACION", SORT: "50" },
  { STATUS_ID: "C19:UC_53P7WJ", NAME: "DOCUMENTACION", SORT: "80" },
  { STATUS_ID: "C19:FALTA", NAME: "FALTA DOCUMENTACION", SORT: "100" },
  { STATUS_ID: "C19:EXECUTING", NAME: "OFERTA", SORT: "110" },
  { STATUS_ID: "C19:5", NAME: "SIT. NEG. EN BCRA", SORT: "240", SEMANTICS: "F" },
];

describe("datos de la negociación para el socio", () => {
  it("arma la etapa por su nombre, si hay recibo, el monto y los campos elegidos que tienen valor", () => {
    const { datos } = estadoDeNegociacion(
      { STAGE_ID: "C19:UC_53P7WJ", OPPORTUNITY: "850000.00", DATE_CREATE: "2026-11-03T10:00:00-03:00", UF_RECIBO: [], UF_BANCO_LISTA: ["7"], UF_CREDITOS: "2", UF_SOCIO: "1", UF_MOTIVO: null },
      definiciones,
      etapas,
      mapeo,
    );
    expect(datos).toEqual([
      { etiqueta: "Etapa de la solicitud", valor: "DOCUMENTACION" },
      { etiqueta: "Recibo cargado en la negociación", valor: "no" },
      { etiqueta: "Monto cargado en la negociación", valor: "$ 850.000" },
      { etiqueta: "Fecha de inicio de la solicitud", valor: "03/11/2026" },
      { etiqueta: "Banco de cobro", valor: "Bancor" },
      { etiqueta: "Cantidad de créditos activos", valor: "2" },
      { etiqueta: "Es socio", valor: "Si" },
    ]);
  });

  it("no inventa lo que no está cargado: sin monto, sin campos vacíos, y un campo que no está en el mapeo no aparece", () => {
    const { datos } = estadoDeNegociacion({ STAGE_ID: "C19:OTRA", OPPORTUNITY: "0.00", UF_RECIBO: [{ id: 1 }], UF_BANCO_TEXTO: "  ", UF_BCRA: "situación 4" }, definiciones, etapas, mapeo);
    expect(datos).toEqual([
      { etiqueta: "Etapa de la solicitud", valor: "C19:OTRA" },
      { etiqueta: "Recibo cargado en la negociación", valor: "sí" },
    ]);
  });

  it("el recibo se pide mientras la negociación no pasó la documentación y no lo tiene", () => {
    const hayQuePedirlo = (negociacion: Record<string, unknown>) => estadoDeNegociacion(negociacion, definiciones, etapas, mapeo).hayQuePedirElRecibo;
    expect(hayQuePedirlo({ STAGE_ID: "C19:UC_53P7WJ" })).toBe(true);
    expect(hayQuePedirlo({ STAGE_ID: "C19:FALTA" })).toBe(true);
    expect(hayQuePedirlo({ STAGE_ID: "C19:UC_53P7WJ", UF_RECIBO: { id: 1 } })).toBe(false);
    expect(hayQuePedirlo({ STAGE_ID: "C19:NEW" })).toBe(true);
    expect(hayQuePedirlo({ STAGE_ID: "C19:NEW", UF_RECIBO: { id: 1 } })).toBe(false);
    expect(hayQuePedirlo({ STAGE_ID: "C19:EXECUTING" })).toBe(false);
    expect(hayQuePedirlo({ STAGE_ID: "C19:5" })).toBe(false);
    expect(hayQuePedirlo({ STAGE_ID: "C19:DESCONOCIDA" })).toBe(false);
    expect(hayQuePedirlo({})).toBe(true);
  });

  it("de una etapa de cierre no pasa el nombre, que dice el motivo: sólo que está cerrada", () => {
    const nombres = nombresParaElSocio([
      { STATUS_ID: "C19:UC_53P7WJ", NAME: "DOCUMENTACION", SEMANTICS: null },
      { STATUS_ID: "C19:5", NAME: "SIT. NEG. EN BCRA", SEMANTICS: "F" },
      { STATUS_ID: "C19:WON", NAME: "ACREDITACION Y FIDELIZACION", SEMANTICS: "S" },
    ]);
    expect([...nombres.values()]).toEqual(["DOCUMENTACION", ETAPA_CERRADA, "ACREDITACION Y FIDELIZACION"]);
  });

  it("si dos campos comparten etiqueta, vale el primero que tiene algo", () => {
    const { datos } = estadoDeNegociacion({ UF_BANCO_TEXTO: "Banco Nación", UF_BANCO_LISTA: ["7"] }, definiciones, etapas, mapeo);
    expect(datos.filter((d) => d.etiqueta === "Banco de cobro")).toEqual([{ etiqueta: "Banco de cobro", valor: "Banco Nación" }]);
  });

  it("traduce cada tipo de campo a algo que se pueda leer", () => {
    expect(valorLegible("1", { type: "boolean" })).toBe("sí");
    expect(valorLegible("0", { type: "boolean" })).toBe("no");
    expect(valorLegible("120000|ARS", { type: "money" })).toBe("$ 120.000");
    expect(valorLegible("2026-12-01T00:00:00-03:00", { type: "date" })).toBe("01/12/2026");
    expect(valorLegible({ id: 3 }, { type: "file" })).toBe("");
    expect(valorLegible("x".repeat(500), { type: "string" })).toHaveLength(401);
  });
});
