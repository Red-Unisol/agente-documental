import { describe, expect, it } from "vitest";
import { negociacionDelChat } from "./bot.js";
import { sectorDelConvenio } from "./fichas-bitrix.js";
import { anidar, hoja, rama } from "./formulario.js";

describe("anidar", () => {
  it("convierte las claves estilo PHP en un objeto anidado", () => {
    const evento = anidar(new URLSearchParams("event=ONIMBOTMESSAGEADD&data[PARAMS][MESSAGE]=hola&data[PARAMS][FILES][7][name]=recibo.pdf&auth[domain]=x.bitrix24.es"));
    expect(hoja(evento, "event")).toBe("ONIMBOTMESSAGEADD");
    expect(hoja(evento, "data", "PARAMS", "MESSAGE")).toBe("hola");
    expect(rama(evento, "data", "PARAMS", "FILES")).toEqual({ "7": { name: "recibo.pdf" } });
    expect(hoja(evento, "auth", "domain")).toBe("x.bitrix24.es");
  });

  it("devuelve vacío cuando el camino no existe o no es del tipo esperado", () => {
    const evento = anidar(new URLSearchParams("data[PARAMS][MESSAGE]=hola"));
    expect(hoja(evento, "data", "PARAMS", "FILES")).toBe("");
    expect(rama(evento, "data", "PARAMS", "MESSAGE")).toEqual({});
    expect(hoja(evento, "nada", "de", "esto")).toBe("");
  });
});

describe("negociacionDelChat", () => {
  it("saca el id de la negociación de CHAT_ENTITY_DATA_1", () => {
    expect(negociacionDelChat("Y|DEAL|1245175|0|0|0")).toBe("1245175");
  });

  it("no devuelve nada si el chat no está atado a una negociación", () => {
    expect(negociacionDelChat("N|NONE|0|0|0|0")).toBeUndefined();
    expect(negociacionDelChat("Y|LEAD|55|0")).toBeUndefined();
    expect(negociacionDelChat("")).toBeUndefined();
  });
});

describe("sectorDelConvenio", () => {
  it("reconoce convenios del sector público", () => {
    expect(sectorDelConvenio("EMPLEADOS PUBLICOS CATAMARCA")).toBe("publico");
    expect(sectorDelConvenio("Docentes Chaco")).toBe("publico");
    expect(sectorDelConvenio("Jubilados ANSES")).toBe("publico");
  });

  it("el resto se trata como privado", () => {
    expect(sectorDelConvenio("Comercio")).toBe("privado");
    expect(sectorDelConvenio("")).toBe("privado");
  });
});
