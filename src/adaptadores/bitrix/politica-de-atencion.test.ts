import { describe, expect, it } from "vitest";
import { decidirAtencion, entradaDeListaBlanca, leerListaBlanca, mismoTelefono, telefonoDelChat } from "./politica-de-atencion.js";

describe("lista blanca", () => {
  it("lee teléfonos con y sin negociación asociada", () => {
    const lista = leerListaBlanca(" 5493510001230:1246803, +54 9 351 444-5566 ")!;
    expect(lista.telefonos.get("5493510001230")).toBe("1246803");
    expect(lista.telefonos.get("5493514445566")).toBeUndefined();
    expect(lista.telefonos.size).toBe(2);
  });

  it("acepta líneas enteras con linea:<id>", () => {
    const lista = leerListaBlanca("linea:9, 5493510001230")!;
    expect(lista.lineas.has("9")).toBe(true);
    expect(lista.telefonos.size).toBe(1);
  });

  it("vacía o ausente significa sin lista", () => {
    expect(leerListaBlanca(undefined)).toBeUndefined();
    expect(leerListaBlanca(" , ")).toBeUndefined();
  });

  it("encuentra el mismo número aunque cambie el prefijo", () => {
    const lista = leerListaBlanca("5493510001230:1246803")!;
    expect(entradaDeListaBlanca(lista, "3510001230")?.negociacionId).toBe("1246803");
    expect(entradaDeListaBlanca(lista, "03510001230")?.negociacionId).toBe("1246803");
    expect(entradaDeListaBlanca(lista, "3510001231")).toBeUndefined();
  });
});

describe("teléfono del chat", () => {
  it("lo saca del id externo del conector de WhatsApp", () => {
    expect(telefonoDelChat("whatsappbyedna|1|5493510001230|127375")).toBe("5493510001230");
  });

  it("el chat web no tiene teléfono", () => {
    expect(telefonoDelChat("livechat|9|142929|127375")).toBeUndefined();
  });

  it("compara por los últimos diez dígitos", () => {
    expect(mismoTelefono("+54 9 351 000-1230", "3510001230")).toBe(true);
    expect(mismoTelefono("12345", "12345")).toBe(false);
  });
});

describe("decisión de atención", () => {
  const lista = leerListaBlanca("5493510001230");

  it("en modo canal sin lista atiende a todos", () => {
    expect(decidirAtencion({ modo: "canal" })).toEqual({ atender: true });
  });

  it("con lista blanca cede los chats sin teléfono o fuera de la lista", () => {
    expect(decidirAtencion({ modo: "canal", listaBlanca: lista }).atender).toBe(false);
    expect(decidirAtencion({ modo: "canal", listaBlanca: lista, telefono: "5493510000000" }).atender).toBe(false);
    expect(decidirAtencion({ modo: "canal", listaBlanca: lista, telefono: "3510001230" })).toEqual({ atender: true });
  });

  it("con lista blanca, una línea habilitada se atiende aunque el chat no tenga teléfono", () => {
    const conLinea = leerListaBlanca("linea:9, 5493510001230");
    expect(decidirAtencion({ modo: "canal", listaBlanca: conLinea, linea: "9" })).toEqual({ atender: true });
    expect(decidirAtencion({ modo: "canal", listaBlanca: conLinea, linea: "1" }).atender).toBe(false);
  });

  it("nunca atiende sobre una negociación de otro embudo", () => {
    const d = decidirAtencion({ modo: "canal", negociacion: { id: "77", responsableId: 1, esDelEmbudo: false } });
    expect(d).toMatchObject({ atender: false, motivo: expect.stringContaining("embudo") });
  });

  it("en modo asignación sólo atiende si la negociación es del usuario del agente", () => {
    const base = { modo: "asignacion" as const, usuarioAgente: 127363 };
    expect(decidirAtencion({ ...base, negociacion: { id: "1", responsableId: 127363, esDelEmbudo: true } })).toEqual({ atender: true });
    const ajena = decidirAtencion({ ...base, negociacion: { id: "1", responsableId: 123337, esDelEmbudo: true } });
    expect(ajena).toMatchObject({ atender: false, cederA: 123337 });
    expect(decidirAtencion({ ...base }).atender).toBe(false);
    expect(decidirAtencion({ modo: "asignacion", negociacion: { id: "1", responsableId: 127363, esDelEmbudo: true } }).atender).toBe(false);
  });
});
