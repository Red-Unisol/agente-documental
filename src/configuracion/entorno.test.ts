import { describe, expect, it } from "vitest";
import { leerEntornoBitrix } from "./entorno.js";

const minimo = { BITRIX24_TOKENS_ARCHIVO: "tokens.json", BITRIX24_URL_PUBLICA: "https://agente.ejemplo.com", BITRIX24_USUARIO_PRUEBA: "7" };

describe("entorno del bot", () => {
  it("con lo mínimo, el resto toma sus valores por defecto y el modo de prueba queda apagado", () => {
    const entorno = leerEntornoBitrix(minimo);
    expect(entorno).toMatchObject({ BITRIX24_PUERTO_EVENTOS: 3000, AGENTE_MODO: "canal", AGENTE_DATOS_CARPETA: "datos/conversaciones" });
    expect(entorno.AGENTE_CLAVE_DE_PRUEBAS).toBeUndefined();
  });

  it("una variable opcional vacía (como queda en un .env sin completar) vale lo mismo que no ponerla", () => {
    const entorno = leerEntornoBitrix({ ...minimo, AGENTE_CLAVE_DE_PRUEBAS: "", BITRIX24_USUARIO_AGENTE: "", AGENTE_LISTA_BLANCA: "", BITRIX24_NEGOCIACION_PRUEBA: "" });
    expect(entorno.AGENTE_CLAVE_DE_PRUEBAS).toBeUndefined();
    expect(entorno.BITRIX24_USUARIO_AGENTE).toBeUndefined();
    expect(entorno.AGENTE_LISTA_BLANCA).toBeUndefined();
    expect(entorno.BITRIX24_NEGOCIACION_PRUEBA).toBeUndefined();
  });

  it("la clave de pruebas no puede ser corta", () => {
    expect(() => leerEntornoBitrix({ ...minimo, AGENTE_CLAVE_DE_PRUEBAS: "1234" })).toThrow(/AGENTE_CLAVE_DE_PRUEBAS/);
  });

  it("dice qué variable falta", () => {
    expect(() => leerEntornoBitrix({ BITRIX24_TOKENS_ARCHIVO: "tokens.json" })).toThrow(/BITRIX24_URL_PUBLICA/);
  });
});
