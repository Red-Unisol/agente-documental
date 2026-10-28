import { z } from "zod";

const esquema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  // Elegidos con los evals (evals/corridas): misma tasa de acierto que gpt-4.1 a una fracción del costo.
  OPENAI_MODELO_CONVERSACION: z.string().default("gpt-6-luna"),
  OPENAI_MODELO_LECTURA: z.string().default("gpt-6-luna"),
});

export type Entorno = z.infer<typeof esquema>;

// Sólo hace falta para correr el bot contra Bitrix; la simulación y los evals no lo piden.
const esquemaBitrix = z.object({
  BITRIX24_TOKENS_ARCHIVO: z.string().min(1),
  BITRIX24_URL_PUBLICA: z.string().url(),
  BITRIX24_APP_CLIENT_ID: z.string().optional(),
  BITRIX24_APP_CLIENT_SECRET: z.string().optional(),
  BITRIX24_USUARIO_PRUEBA: z.coerce.number().int().positive(),
  BITRIX24_NEGOCIACION_PRUEBA: z.string().optional(),
  BITRIX24_PUERTO_EVENTOS: z.coerce.number().int().default(3000),
});

export type EntornoBitrix = z.infer<typeof esquemaBitrix>;

export function leerEntorno(fuente: NodeJS.ProcessEnv = process.env): Entorno {
  return validar(esquema, fuente);
}

export function leerEntornoBitrix(fuente: NodeJS.ProcessEnv = process.env): EntornoBitrix {
  return validar(esquemaBitrix, fuente);
}

function validar<T>(esquemaDeEntorno: z.ZodType<T>, fuente: NodeJS.ProcessEnv): T {
  const resultado = esquemaDeEntorno.safeParse(fuente);
  if (!resultado.success) {
    const faltantes = resultado.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Faltan o son inválidas estas variables de entorno: ${faltantes}`);
  }
  return resultado.data;
}
