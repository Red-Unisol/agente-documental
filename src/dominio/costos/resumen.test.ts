import { describe, expect, it } from "vitest";
import { conEvento, nuevaConversacion } from "../conversacion/conversacion.js";
import { resumenDeUso } from "./resumen.js";
import { costoEnUsd, type Tarifa } from "./uso.js";

const tarifas: Record<string, Tarifa> = { barato: { entrada: 1, cacheada: 0.1, salida: 4 } };

const ficha = { negociacionId: "N", nombre: "M", dni: "1", provincia: "C", convenio: "X", sectorDeclarado: "publico" as const, empleadorDeclarado: "E" };

function conUsos(...usos: { modelo: string; proposito: string; entrada: number; cacheados: number; salida: number; ms: number }[]) {
  return usos.reduce(
    (conversacion, u) =>
      conEvento(conversacion, {
        at: new Date(),
        tipo: "uso_de_modelo",
        detalle: { proposito: u.proposito, modelo: u.modelo, tokensDeEntrada: u.entrada, tokensCacheados: u.cacheados, tokensDeSalida: u.salida, milisegundos: u.ms },
      }),
    nuevaConversacion("c", "chat", ficha),
  );
}

describe("costoEnUsd", () => {
  it("cobra los tokens cacheados a la tarifa cacheada", () => {
    const uso = { modelo: "barato", tokensDeEntrada: 1_000_000, tokensCacheados: 500_000, tokensDeSalida: 250_000, milisegundos: 0 };
    expect(costoEnUsd(uso, tarifas)).toBeCloseTo(0.5 + 0.05 + 1);
  });

  it("no inventa un costo si el modelo no tiene tarifa", () => {
    expect(costoEnUsd({ modelo: "desconocido", tokensDeEntrada: 10, tokensCacheados: 0, tokensDeSalida: 1, milisegundos: 0 }, tarifas)).toBeUndefined();
  });
});

describe("resumenDeUso", () => {
  it("suma las llamadas de la conversación y permite filtrar por propósito", () => {
    const conversacion = conUsos(
      { modelo: "barato", proposito: "conversacion", entrada: 1000, cacheados: 200, salida: 100, ms: 800 },
      { modelo: "barato", proposito: "lectura", entrada: 3000, cacheados: 0, salida: 50, ms: 1200 },
    );
    const total = resumenDeUso(conversacion, tarifas);
    expect(total).toMatchObject({ llamadas: 2, tokensDeEntrada: 4000, tokensCacheados: 200, tokensDeSalida: 150, milisegundos: 2000, modelos: ["barato"] });
    expect(total.costoUsd).toBeCloseTo((800 * 1 + 200 * 0.1 + 3000 * 1 + 150 * 4) / 1_000_000);
    expect(resumenDeUso(conversacion, tarifas, "lectura").llamadas).toBe(1);
  });

  it("deja el costo indefinido si alguna llamada no tiene tarifa", () => {
    const conversacion = conUsos({ modelo: "otro", proposito: "conversacion", entrada: 10, cacheados: 0, salida: 1, ms: 1 });
    expect(resumenDeUso(conversacion, tarifas).costoUsd).toBeUndefined();
  });
});
