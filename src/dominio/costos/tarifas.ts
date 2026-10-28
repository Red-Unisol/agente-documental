import type { Tarifa } from "./uso.js";

/** USD por millón de tokens, lista estándar de OpenAI al 28/10/2026. */
export const tarifasOpenAI: Record<string, Tarifa> = {
  "gpt-4.1": { entrada: 2, cacheada: 0.5, salida: 8 },
  "gpt-4.1-mini": { entrada: 0.4, cacheada: 0.1, salida: 1.6 },
  "gpt-4.1-nano": { entrada: 0.1, cacheada: 0.025, salida: 0.4 },
  "gpt-5-mini": { entrada: 0.25, cacheada: 0.025, salida: 2 },
  "gpt-5.4-mini": { entrada: 0.75, cacheada: 0.075, salida: 4.5 },
  "gpt-5.6-luna": { entrada: 0.2, cacheada: 0.02, salida: 1.2 },
  "gpt-5.6-terra": { entrada: 2, cacheada: 0.2, salida: 12 },
  "gpt-6-luna": { entrada: 0.1, cacheada: 0.01, salida: 0.5 },
  "gpt-6.1-terra": { entrada: 1, cacheada: 0.05, salida: 5 },
  "gpt-6.1-sol": { entrada: 2, cacheada: 0.1, salida: 10 },
};
