import { existsSync } from "node:fs";
import { z } from "zod";

// Si hay un .env en la carpeta desde donde se corre, se carga. Lo que ya está definido en el entorno manda.
const ARCHIVO_DE_ENTORNO = ".env";
if (existsSync(ARCHIVO_DE_ENTORNO)) process.loadEnvFile(ARCHIVO_DE_ENTORNO);

const esquema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  // Elegidos con los evals (evals/corridas): misma tasa de acierto que gpt-4.1 a una fracción del costo.
  OPENAI_MODELO_CONVERSACION: z.string().default("gpt-6-luna"),
  OPENAI_MODELO_LECTURA: z.string().default("gpt-6-luna"),
  // Relee los archivos que la primera lectura no dejó aceptar (fotos de baja calidad, sobre todo). Vacío = sin segunda lectura.
  OPENAI_MODELO_LECTURA_RESPALDO: z.string().default("gpt-6.1-terra"),
});

export type Entorno = z.infer<typeof esquema>;

// En un .env, "VARIABLE=" deja la variable definida y vacía: vale lo mismo que no ponerla.
function vacioEsAusente<T extends z.ZodType>(esquemaDelValor: T) {
  return z.preprocess((valor) => (valor === "" ? undefined : valor), esquemaDelValor);
}

// Sólo hace falta para correr el bot contra Bitrix; la simulación y los evals no lo piden.
const esquemaBitrix = z.object({
  BITRIX24_TOKENS_ARCHIVO: z.string().min(1),
  BITRIX24_URL_PUBLICA: z.string().url(),
  BITRIX24_APP_CLIENT_ID: vacioEsAusente(z.string().optional()),
  BITRIX24_APP_CLIENT_SECRET: vacioEsAusente(z.string().optional()),
  BITRIX24_USUARIO_PRUEBA: z.coerce.number().int().positive(),
  BITRIX24_NEGOCIACION_PRUEBA: vacioEsAusente(z.string().optional()),
  BITRIX24_PUERTO_EVENTOS: z.coerce.number().int().default(3000),
  // Carpeta donde se guardan las conversaciones (un JSON por chat). Fuera del repo en producción.
  AGENTE_DATOS_CARPETA: z.string().default("datos/conversaciones"),
  // canal: atiende todo chat de la línea. asignacion: sólo si la negociación está asignada a BITRIX24_USUARIO_AGENTE.
  AGENTE_MODO: z.enum(["canal", "asignacion"]).default("canal"),
  BITRIX24_USUARIO_AGENTE: vacioEsAusente(z.coerce.number().int().positive().optional()),
  // Teléfonos habilitados (etapa 2), "tel[:negociación],tel[:negociación]". Vacío = sin restricción.
  AGENTE_LISTA_BLANCA: vacioEsAusente(z.string().optional()),
  // Modo de prueba con negociaciones reales: quien manda en el chat el enlace de una negociación y esta clave
  // hace que el agente la copie al embudo de prueba y siga ahí. Vacío = apagado (así va en producción).
  AGENTE_CLAVE_DE_PRUEBAS: vacioEsAusente(z.string().min(8).optional()),
  // Diagnóstico: archivo donde se anexa cada evento crudo que manda Bitrix (sin tokens).
  AGENTE_VOLCAR_EVENTOS: vacioEsAusente(z.string().optional()),
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
