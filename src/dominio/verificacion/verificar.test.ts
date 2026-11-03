import { describe, expect, it } from "vitest";
import type { Ficha, LecturaDeRecibo, Reglas } from "../tipos.js";
import { verificarRecibo } from "./verificar.js";

const ficha: Ficha = {
  negociacionId: "1",
  nombre: "Persona de Prueba",
  dni: "12345678",
  provincia: "Catamarca",
  convenio: "EMPLEADOS_PUBLICOS_CATAMARCA",
  sectorDeclarado: "publico",
  empleadorDeclarado: "Ministerio de Educación de Catamarca",
};

const reglas: Reglas = {
  diaDeGracia: 10,
  exclusiones: [{ convenio: null, provincia: "catamarca", patron: "bomberos", motivo: "Bomberos no califica en Catamarca" }],
};

const reciboCorrecto: LecturaDeRecibo = {
  esReciboDeSueldo: true,
  legible: true,
  empleador: "Ministerio de Educación - Gobierno de Catamarca",
  cuil: "20-12345678-6",
  periodo: { anio: 2026, mes: 9 },
  provincia: "Catamarca",
  sector: "publico",
  faltantes: [],
};

const hoy = new Date(2026, 9, 20);

function verificar(cambios: Partial<LecturaDeRecibo>) {
  return verificarRecibo({ lectura: { ...reciboCorrecto, ...cambios }, ficha, reglas, hoy });
}

describe("verificarRecibo", () => {
  it("acepta un recibo del mes anterior que coincide con la ficha", () => {
    const resultado = verificar({});
    expect(resultado.decision).toBe("aceptar");
    expect(resultado.chequeos.every((c) => c.ok)).toBe(true);
  });

  it("pide de nuevo cuando el documento no es un recibo, sin evaluar lo demás", () => {
    const resultado = verificar({ esReciboDeSueldo: false });
    expect(resultado.decision).toBe("pedir_de_nuevo");
    expect(resultado.chequeos).toHaveLength(1);
  });

  it("pide el último recibo cuando el período es viejo", () => {
    const resultado = verificar({ periodo: { anio: 2026, mes: 7 } });
    expect(resultado.decision).toBe("pedir_de_nuevo");
    expect(resultado.motivos[0]).toContain("julio 2026");
  });

  it("acepta el recibo de dos meses atrás dentro del día de gracia", () => {
    const resultado = verificarRecibo({ lectura: { ...reciboCorrecto, periodo: { anio: 2026, mes: 8 } }, ficha, reglas, hoy: new Date(2026, 9, 5) });
    expect(resultado.decision).toBe("aceptar");
  });

  it("deriva cuando el CUIL es de otra persona", () => {
    const resultado = verificar({ cuil: "27-87654321-9" });
    expect(resultado.decision).toBe("derivar");
  });

  it("pide de nuevo cuando el CUIL se leyó mal", () => {
    expect(verificar({ cuil: "20-12345678-0" }).decision).toBe("pedir_de_nuevo");
  });

  it("deriva cuando el recibo es privado y la ficha declara público", () => {
    expect(verificar({ sector: "privado" }).decision).toBe("derivar");
  });

  it("deriva cuando el empleador está excluido por convenio", () => {
    const resultado = verificar({ empleador: "Cuerpo de Bomberos de la Provincia de Catamarca", provincia: "Catamarca" });
    expect(resultado.decision).toBe("derivar");
    expect(resultado.motivos[0]).toContain("Bomberos");
  });

  it("la exclusión por provincia aplica aunque el convenio venga con la etiqueta de Bitrix", () => {
    const lectura = { ...reciboCorrecto, empleador: "Cuerpo de Bomberos de la Provincia de Catamarca", provincia: "Catamarca" };
    const resultado = verificarRecibo({ lectura, ficha: { ...ficha, convenio: "Amejuca" }, reglas, hoy });
    expect(resultado.decision).toBe("derivar");
  });

  it("acepta un CUIL de DNI de 7 cifras aunque venga sin el cero", () => {
    const lectura = { ...reciboCorrecto, cuil: "20-8333444-5" };
    const resultado = verificarRecibo({ lectura, ficha: { ...ficha, dni: "8333444" }, reglas, hoy });
    expect(resultado.chequeos.find((c) => c.nombre === "identidad")?.ok).toBe(true);
  });

  it("derivar pesa más que pedir de nuevo cuando fallan los dos", () => {
    expect(verificar({ sector: "privado", periodo: undefined }).decision).toBe("derivar");
  });
});
