import { describe, expect, it } from "vitest";
import { usoVacio } from "../dominio/costos/uso.js";
import type { Ficha, LecturaDeDocumento, Liquidacion, Reglas } from "../dominio/tipos.js";
import type { LectorDeRecibo } from "../puertos/lector-de-recibo.js";
import { revisarArchivo } from "./revisar-archivo.js";

const ficha: Ficha = { negociacionId: "1", nombre: "Persona de Prueba", dni: "12345678", provincia: "Catamarca", convenio: "sin informar", sectorDeclarado: "publico" };
const reglas: Reglas = { diaDeGracia: 10, exclusiones: [] };
const hoy = new Date(2026, 9, 20);
const archivo = { id: "a1", nombre: "recibo.jpg", tipoMime: "image/jpeg", bytes: new Uint8Array() };

const liquidacion: Liquidacion = { empleador: "Gobierno de Catamarca", cuil: "20-12345678-6", dni: undefined, periodo: { anio: 2026, mes: 9 }, provincia: "Catamarca", sector: "publico", conHaberes: true };
const recibo = (cambios: Partial<Liquidacion> = {}): LecturaDeDocumento => ({ legible: true, otrosDocumentos: [], liquidaciones: [{ ...liquidacion, ...cambios }] });

function lectorQueDevuelve(lectura: LecturaDeDocumento, modelo: string): LectorDeRecibo & { veces: number } {
  const lector = { veces: 0, leer: async () => ({ lectura, uso: usoVacio(modelo) }) };
  const original = lector.leer;
  lector.leer = async () => { lector.veces += 1; return original(); };
  return lector;
}

describe("revisarArchivo", () => {
  it("si la primera lectura alcanza para aceptar, no gasta la segunda", async () => {
    const respaldo = lectorQueDevuelve(recibo(), "respaldo");
    const revision = await revisarArchivo(archivo, { lector: lectorQueDevuelve(recibo(), "economico"), lectorDeRespaldo: respaldo, ficha, reglas, hoy });

    expect(revision.verificacion.decision).toBe("aceptar");
    expect(respaldo.veces).toBe(0);
    expect(revision.conSegundaLectura).toBe(false);
  });

  it("si la primera lectura confundió el CUIL, la segunda lectura decide", async () => {
    const confundido = lectorQueDevuelve(recibo({ cuil: "20-12845673-0" }), "economico");
    const revision = await revisarArchivo(archivo, { lector: confundido, lectorDeRespaldo: lectorQueDevuelve(recibo(), "respaldo"), ficha, reglas, hoy });

    expect(revision.verificacion.decision).toBe("aceptar");
    expect(revision.conSegundaLectura).toBe(true);
    expect(revision.usos.map((uso) => uso.modelo)).toEqual(["economico", "respaldo"]);
  });

  it("si las dos lecturas ven un recibo viejo, se pide de nuevo", async () => {
    const viejo = recibo({ periodo: { anio: 2026, mes: 6 } });
    const revision = await revisarArchivo(archivo, { lector: lectorQueDevuelve(viejo, "economico"), lectorDeRespaldo: lectorQueDevuelve(viejo, "respaldo"), ficha, reglas, hoy });

    expect(revision.verificacion.decision).toBe("pedir_de_nuevo");
  });

  it("no relee un archivo que claramente es otra cosa", async () => {
    const dni: LecturaDeDocumento = { legible: false, otrosDocumentos: ["dni"], liquidaciones: [] };
    const respaldo = lectorQueDevuelve(recibo(), "respaldo");
    const revision = await revisarArchivo(archivo, { lector: lectorQueDevuelve(dni, "economico"), lectorDeRespaldo: respaldo, ficha, reglas, hoy });

    expect(revision.verificacion.decision).toBe("pedir_de_nuevo");
    expect(respaldo.veces).toBe(0);
  });

  it("si la segunda lectura falla, vale la primera", async () => {
    const roto: LectorDeRecibo = { leer: async () => { throw new Error("sin servicio"); } };
    const revision = await revisarArchivo(archivo, { lector: lectorQueDevuelve(recibo({ periodo: undefined }), "economico"), lectorDeRespaldo: roto, ficha, reglas, hoy });

    expect(revision.verificacion.decision).toBe("pedir_de_nuevo");
    expect(revision.conSegundaLectura).toBe(false);
  });
});
