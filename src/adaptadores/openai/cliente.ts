import OpenAI from "openai";
import { type ZodType, z } from "zod";

export interface OpcionesDeOpenAI {
  apiKey: string;
  modeloConversacion: string;
  modeloLectura: string;
}

export function crearClienteOpenAI(opciones: OpcionesDeOpenAI): OpenAI {
  return new OpenAI({ apiKey: opciones.apiKey });
}

export function esquemaJsonDe(esquema: ZodType): Record<string, unknown> {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(esquema);
  return resto;
}
