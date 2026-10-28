import OpenAI from "openai";
import type { CompletionUsage } from "openai/resources/completions";
import { type ZodType, z } from "zod";
import type { UsoDelModelo } from "../../dominio/costos/uso.js";

export function crearClienteOpenAI(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export function esquemaJsonDe(esquema: ZodType): Record<string, unknown> {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(esquema);
  return resto;
}

/** Los modelos con razonamiento no aceptan temperatura; para usar herramientas por chat.completions hay que apagarlo. */
export function parametrosDeGeneracion(modelo: string, temperatura: number): { temperature: number } | { reasoning_effort: "none" } {
  return /^gpt-4/.test(modelo) ? { temperature: temperatura } : { reasoning_effort: "none" };
}

export function medirUso(modelo: string, usage: CompletionUsage | undefined, inicio: number): UsoDelModelo {
  return {
    modelo,
    tokensDeEntrada: usage?.prompt_tokens ?? 0,
    tokensCacheados: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    tokensDeSalida: usage?.completion_tokens ?? 0,
    milisegundos: Math.round(performance.now() - inicio),
  };
}
