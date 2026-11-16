import { describe, expect, it } from "vitest";
import { type Enumeraciones, fichaDeNegociacion } from "./fichas-bitrix.js";
import { mapeoDelEmbudoDePrueba } from "./mapeo.js";

const { campos } = mapeoDelEmbudoDePrueba(1);
const etiquetas: Enumeraciones = {
  [campos.provincia]: new Map([["10", "Catamarca"]]),
  [campos.situacionLaboral]: new Map([["20", "Empleado Publico Provincial"]]),
  [campos.convenio]: new Map([["30", "Amejuca"]]),
};

describe("fichaDeNegociacion", () => {
  it("arma la ficha de una negociación con todos los datos", () => {
    const ficha = fichaDeNegociacion(
      { ID: "7", [campos.dni]: "12.345.678", [campos.provincia]: "10", [campos.situacionLaboral]: "20", [campos.convenio]: "30", [campos.empleador]: "Ministerio de Educación" },
      "Mariana",
      etiquetas,
      campos,
    );
    expect(ficha).toEqual({
      negociacionId: "7",
      nombre: "Mariana",
      dni: "12345678",
      provincia: "Catamarca",
      convenio: "Amejuca",
      sectorDeclarado: "publico",
      empleadorDeclarado: "Ministerio de Educación",
      situacionDeclarada: "Empleado Publico Provincial",
    });
  });

  it("como llega en el embudo real: sin DNI, sin convenio y sin empleador, con CUIL y línea", () => {
    const ficha = fichaDeNegociacion({ ID: "8", [campos.dni]: "", [campos.cuil]: "20123456786", [campos.linea]: "AMEJUCA Premium", [campos.provincia]: "10", [campos.situacionLaboral]: "20" }, "Mariana", etiquetas, campos);

    expect(ficha.dni).toBe("12345678");
    expect(ficha.convenio).toBe("AMEJUCA Premium");
    expect(ficha.empleadorDeclarado).toBeUndefined();
  });

  it("toma el documento del CUIL aunque Bitrix lo devuelva como número con decimales", () => {
    expect(fichaDeNegociacion({ ID: "9", [campos.cuil]: "20083334445.00" }, "Juan", etiquetas, campos).dni).toBe("8333444");
  });

  it("sin DNI ni CUIL la ficha queda sin documento, y la verificación deriva", () => {
    expect(fichaDeNegociacion({ ID: "10" }, "Juan", etiquetas, campos).dni).toBe("");
  });
});
