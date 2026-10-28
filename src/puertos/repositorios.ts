import type { Escenario } from "../dominio/agente/escenarios.js";
import type { BloquesDelPrompt } from "../dominio/agente/prompt.js";
import type { Conversacion } from "../dominio/conversacion/conversacion.js";
import type { Reglas } from "../dominio/tipos.js";

export interface ConfiguracionDelAgente {
  bloques: BloquesDelPrompt;
  escenarios: Escenario[];
  reglas: Reglas;
}

export interface RepositorioDeConversaciones {
  obtener(id: string): Promise<Conversacion | undefined>;
  guardar(conversacion: Conversacion): Promise<void>;
}

export interface RepositorioDeConfiguracion {
  obtener(): Promise<ConfiguracionDelAgente>;
}

export interface Reloj {
  ahora(): Date;
}
