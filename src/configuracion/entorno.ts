import { z } from "zod";

const esquema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODELO_CONVERSACION: z.string().default("gpt-4.1-mini"),
  OPENAI_MODELO_LECTURA: z.string().default("gpt-4.1"),
});

export type Entorno = z.infer<typeof esquema>;

export function leerEntorno(fuente: NodeJS.ProcessEnv = process.env): Entorno {
  const resultado = esquema.safeParse(fuente);
  if (!resultado.success) {
    const faltantes = resultado.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Faltan o son inválidas estas variables de entorno: ${faltantes}`);
  }
  return resultado.data;
}
