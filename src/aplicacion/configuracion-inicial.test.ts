import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configuracionInicial } from "./configuracion-inicial.js";

// Red de seguridad para quien edita escenarios: que ninguna clave quede repetida, vacía o
// referenciada desde un texto o un eval después de borrarla. Corre sin red.
const escenarios = configuracionInicial.escenarios;
const claves = new Set(escenarios.map((e) => e.clave));
const CARPETA_DE_EVALS = join(process.cwd(), "evals", "conversaciones");

function clavesMencionadas(texto: string): string[] {
  return [...new Set(texto.match(/\bE\d+\b/g) ?? [])];
}

describe("escenarios", () => {
  it("tienen clave única con la forma E<número>", () => {
    expect(claves.size).toBe(escenarios.length);
    for (const e of escenarios) expect(e.clave).toMatch(/^E\d+$/);
  });

  it("tienen nombre, cuándo e instrucciones", () => {
    for (const e of escenarios) {
      expect(e.nombre.trim().length, e.clave).toBeGreaterThan(0);
      expect(e.cuando.trim().length, e.clave).toBeGreaterThan(20);
      expect(e.instrucciones.trim().length, e.clave).toBeGreaterThan(20);
    }
  });

  it("sólo se refieren a escenarios que existen", () => {
    for (const e of escenarios) {
      for (const clave of clavesMencionadas(`${e.cuando} ${e.instrucciones}`)) {
        expect(claves.has(clave), `${e.clave} menciona ${clave}, que no existe`).toBe(true);
      }
    }
  });
});

describe("bloques", () => {
  it("están todos escritos", () => {
    for (const [nombre, texto] of Object.entries(configuracionInicial.bloques)) {
      expect(texto.trim().length, nombre).toBeGreaterThan(20);
    }
  });
});

describe("evals", () => {
  const archivos = readdirSync(CARPETA_DE_EVALS).filter((a) => a.endsWith(".json"));

  it("hay evals", () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it("esperan escenarios que existen", () => {
    for (const archivo of archivos) {
      const caso = JSON.parse(readFileSync(join(CARPETA_DE_EVALS, archivo), "utf8")) as { esperado?: { escenarios?: string[] } };
      for (const clave of caso.esperado?.escenarios ?? []) {
        expect(claves.has(clave), `${archivo} espera ${clave}, que no existe`).toBe(true);
      }
    }
  });

  // E5 (recibo ilegible) lo resuelve casi siempre E4 con el resultado de revisar_recibo: el modelo
  // rara vez lo carga, así que 11-borroso y 15-cortado prueban el comportamiento sin exigir la clave.
  const SIN_EVAL_PROPIO = new Set(["E5"]);

  it("cada escenario tiene al menos un eval que lo espera", () => {
    const esperados = new Set<string>();
    for (const archivo of archivos) {
      const caso = JSON.parse(readFileSync(join(CARPETA_DE_EVALS, archivo), "utf8")) as { esperado?: { escenarios?: string[] } };
      for (const clave of caso.esperado?.escenarios ?? []) esperados.add(clave);
    }
    const sinEval = [...claves].filter((c) => !esperados.has(c) && !SIN_EVAL_PROPIO.has(c));
    expect(sinEval, `escenarios sin eval: ${sinEval.join(", ")}`).toEqual([]);
  });
});
