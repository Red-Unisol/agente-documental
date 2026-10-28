import { describe, expect, it } from "vitest";
import { omitirIdentificadores } from "./datos-sensibles.js";

describe("omitirIdentificadores", () => {
  it("oculta un DNI escrito con o sin puntos", () => {
    expect(omitirIdentificadores("el DNI 30.111.222 y el 30111222").texto).toBe("el DNI [dato omitido] y el [dato omitido]");
  });

  it("oculta CUIL y CBU y dice qué omitió", () => {
    const resultado = omitirIdentificadores("CUIL 27-12345678-0, CBU 0170099220000067797370");
    expect(resultado.texto).toBe("CUIL [dato omitido], CBU [dato omitido]");
    expect(resultado.omitidos).toEqual(["CBU/CVU", "CUIL/CUIT"]);
  });

  it("deja pasar montos y fechas", () => {
    const texto = "el recibo de septiembre 2026 por $ 721.282,72 del 02/10/2026";
    expect(omitirIdentificadores(texto)).toEqual({ texto, omitidos: [] });
  });
});
